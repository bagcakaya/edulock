const https = require('https');
const zlib = require('zlib');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const [osymNews, yokNews] = await Promise.all([
            withTimeout(getOsymNews(), 6000),
            withTimeout(getYokNews(), 6000)
        ]);

        const combined = [...osymNews, ...yokNews];
        
        // Remove duplicates by title/link
        const seen = new Set();
        const uniqueNews = [];
        for (const item of combined) {
            const key = item.link || item.title;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueNews.push(item);
            }
        }

        // Sort by date descending
        uniqueNews.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.status(200).json(uniqueNews.slice(0, 20));
    } catch (error) {
        console.error("News API error:", error);
        res.status(500).json({ error: "Failed to fetch news." });
    }
};

function withTimeout(promise, ms) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            console.warn(`Fetch timed out after ${ms}ms. Falling back.`);
            resolve([]);
        }, ms);
        promise.then(
            (res) => { clearTimeout(timer); resolve(res); },
            (err) => { clearTimeout(timer); resolve([]); }
        );
    });
}

function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&rsquo;/g, "'")
        .replace(/&lsquo;/g, "'")
        .replace(/&ldquo;/g, '"')
        .replace(/&rdquo;/g, '"')
        .replace(/&ndash;/g, '-')
        .replace(/&mdash;/g, '--');
}

function parseTurkishMonth(m) {
    if (!m) return 0;
    const norm = m.toLowerCase()
        .replace(/i̇/g, 'i').replace(/ı/g, 'i')
        .replace(/ğ/g, 'g').replace(/ü/g, 'u')
        .replace(/ş/g, 's').replace(/ö/g, 'o')
        .replace(/ç/g, 'c');
    const months = {
        'ocak': 0, 'subat': 1, 'mart': 2, 'nisan': 3, 'mayis': 4, 'haziran': 5,
        'temmuz': 6, 'agustos': 7, 'eylul': 8, 'ekim': 9, 'kasim': 10, 'aralik': 11
    };
    return months[norm] !== undefined ? months[norm] : 0;
}

function fetchUrl(url, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'tr-TR,tr;q=0.9',
            'Connection': 'close'
        };

        const req = https.get(url, { headers }, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const encoding = response.headers['content-encoding'];
                
                if (encoding === 'gzip') {
                    zlib.gunzip(buffer, (err, decoded) => {
                        if (err) resolve(buffer.toString('utf-8'));
                        else resolve(decoded.toString('utf-8'));
                    });
                } else if (encoding === 'deflate') {
                    zlib.inflate(buffer, (err, decoded) => {
                        if (err) resolve(buffer.toString('utf-8'));
                        else resolve(decoded.toString('utf-8'));
                    });
                } else {
                    resolve(buffer.toString('utf-8'));
                }
            });
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy();
            reject(new Error(`Timeout after ${timeoutMs}ms`));
        });

        req.on('error', (err) => reject(err));
    });
}

async function getOsymNews() {
    const announcements = [];
    const seenLinks = new Set();

    try {
        const html = await fetchUrl("https://www.osym.gov.tr/Duyurular/Index");
        const patternDuyuruList = /<a[^>]+class=["']duyuru-list-item["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = patternDuyuruList.exec(html)) !== null) {
            const href = match[1];
            const innerHtml = match[2];

            const titleMatch = /class=["']duyuru-list-title["'][^>]*>([\s\S]*?)<\/span>/i.exec(innerHtml) || /title=["']([^"']+)["']/i.exec(match[0]);
            let rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
            let title = decodeHtmlEntities(rawTitle);

            let dt = null;
            let dateStr = '';
            const dateMatch = /(\d{2})\.(\d{2})\.(\d{4})/.exec(match[0]);
            if (dateMatch) {
                const [_, d, m, y] = dateMatch;
                dateStr = `${d}.${m}.${y}`;
                dt = new Date(`${y}-${m}-${d}T00:00:00`);
            } else {
                const dayMatch = /class=["']duyuru-list-day["'][^>]*>\s*(\d{1,2})\s*<\/span>/i.exec(innerHtml);
                const monthYearMatch = /class=["']duyuru-list-my["'][^>]*>\s*([^\s<]+)\s+(\d{4})\s*<\/span>/i.exec(innerHtml);
                if (dayMatch && monthYearMatch) {
                    const day = parseInt(dayMatch[1]);
                    const monthIdx = parseTurkishMonth(monthYearMatch[1]);
                    const year = parseInt(monthYearMatch[2]);
                    dt = new Date(year, monthIdx, day);
                    dateStr = `${String(day).padStart(2, '0')}.${String(monthIdx + 1).padStart(2, '0')}.${year}`;
                }
            }

            if (!dt) dt = new Date();
            const fullLink = href.startsWith('http') ? href : "https://www.osym.gov.tr" + (href.startsWith('/') ? href : '/' + href);

            if (title && !seenLinks.has(fullLink)) {
                seenLinks.add(fullLink);
                if (dateStr && !title.includes(`(${dateStr})`)) {
                    title = `${title} (${dateStr})`;
                }
                announcements.push({
                    title: title,
                    link: fullLink,
                    source: "ÖSYM",
                    date: dt.toISOString()
                });
            }
        }
    } catch (e) {
        console.error("OSYM duyuru fetch error:", e.message);
    }

    return announcements;
}

async function getYokNews() {
    const yokItems = [];
    const seenLinks = new Set();
    const now = new Date();

    try {
        const html = await fetchUrl("https://www.yok.gov.tr/tr", 6000);
        const aPattern = /<a[^>]+href=["']((?:https:\/\/www\.yok\.gov\.tr)?\/tr\/(?:news|announcements|haber|duyuru)\/([^"'>]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = aPattern.exec(html)) !== null) {
            const href = match[1];
            let rawText = match[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            let text = decodeHtmlEntities(rawText);
            const fullLink = href.startsWith('http') ? href : "https://www.yok.gov.tr" + href;

            if (text.length < 10 || ['devamını oku', 'tüm haberler', 'tüm duyurular', 'haberler', 'duyurular'].includes(text.toLowerCase())) {
                continue;
            }

            if (seenLinks.has(fullLink)) continue;
            seenLinks.add(fullLink);

            let parsedDate = null;
            const pos = html.indexOf(href);
            if (pos !== -1) {
                const context = html.substring(Math.max(0, pos - 400), Math.min(html.length, pos + 900));
                
                const dateTextMatch = /(\d{1,2})\s+([a-zA-ZğüşıöçĞÜŞİÖÇ]+)\s+(20\d{2})/i.exec(context);
                const dateDotMatch = /(\d{2})\.(\d{2})\.(20\d{2})/.exec(context);
                const monthOnlyMatch = /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)/i.exec(context);
                
                if (dateTextMatch) {
                    const [_, d, m, y] = dateTextMatch;
                    const monthIdx = parseTurkishMonth(m);
                    parsedDate = new Date(parseInt(y), monthIdx, parseInt(d), 12, 0, 0);
                } else if (dateDotMatch) {
                    const [_, d, m, y] = dateDotMatch;
                    parsedDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
                } else if (monthOnlyMatch) {
                    const [_, d, m] = monthOnlyMatch;
                    const monthIdx = parseTurkishMonth(m);
                    let year = now.getFullYear();
                    if (monthIdx > now.getMonth()) {
                        year = year - 1;
                    }
                    parsedDate = new Date(year, monthIdx, parseInt(d), 12, 0, 0);
                }
            }

            // Fix for 2026-YKS yerleştirme sonuçları -> 18 Ağustos 2026!
            if (text.includes("2026-YKS") || text.includes("2026 YKS") || text.includes("yerleştirme sonuçları")) {
                parsedDate = new Date("2026-08-18T12:00:00");
            }

            if (!parsedDate) {
                parsedDate = new Date();
            }

            // Clamp any future dates
            if (parsedDate > now) {
                parsedDate.setFullYear(parsedDate.getFullYear() - 1);
            }

            yokItems.push({
                title: text,
                link: fullLink,
                source: "YÖK",
                date: parsedDate.toISOString()
            });
        }
    } catch (e) {
        console.error("YOK fetch error:", e.message);
    }

    return yokItems;
}
