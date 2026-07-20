const https = require('https');
const zlib = require('zlib');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Fetch concurrently with timeout protection for YÖK
        const [osymNews, yokNews] = await Promise.all([
            getOsymNews().catch(err => { console.error("OSYM Error:", err); return []; }),
            withTimeout(getYokNews(), 4500)
        ]);

        // Combine and sort by date descending (newest first)
        const combined = [...osymNews, ...yokNews];
        combined.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.status(200).json(combined.slice(0, 20));
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

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'close'
        };
        
        https.get(url, { headers }, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const encoding = response.headers['content-encoding'];
                
                if (encoding === 'gzip') {
                    zlib.gunzip(buffer, (err, decoded) => {
                        if (err) reject(err);
                        else resolve(decoded.toString('utf-8'));
                    });
                } else if (encoding === 'deflate') {
                    zlib.inflate(buffer, (err, decoded) => {
                        if (err) reject(err);
                        else resolve(decoded.toString('utf-8'));
                    });
                } else {
                    resolve(buffer.toString('utf-8'));
                }
            });
        }).on('error', (err) => { reject(err); });
    });
}

async function getOsymNews() {
    try {
        const html = await fetchUrl("https://www.osym.gov.tr/");
        const announcements = [];
        const pattern = /<a[^>]+href=["'](\/TR,\d+\/[^"'>]+)["'][^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
        let match;
        
        while ((match = pattern.exec(html)) !== null) {
            const href = match[1];
            let text = match[2].replace(/<[^>]+>/g, ''); // strip tags
            text = text.replace(/\s+/g, ' ').trim();
            
            // Filter: only announcements containing date in parentheses at the end
            const dateMatch = /\((\d{2})\.(\d{2})\.(\d{4})\)$/.exec(text);
            if (dateMatch) {
                const [_, d, m, y] = dateMatch;
                const dt = new Date(`${y}-${m}-${d}T00:00:00`);
                announcements.push({
                    title: text,
                    link: "https://www.osym.gov.tr" + href,
                    source: "ÖSYM",
                    date: dt.toISOString()
                });
            }
        }
        return announcements;
    } catch (e) {
        console.error("OSYM Scrape Error:", e);
        return [];
    }
}

async function getYokNews() {
    try {
        const html = await fetchUrl("https://www.yok.gov.tr");
        const yokItems = [];
        const seenLinks = new Set();
        
        // Match all news and announcements links
        const aPattern = /<a[^>]+href=["']((?:https:\/\/www\.yok\.gov\.tr)?\/tr\/(?:news|announcements)\/([^"'>]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        
        while ((match = aPattern.exec(html)) !== null) {
            const href = match[1];
            let text = match[3].replace(/<[^>]+>/g, ''); // strip inline tags
            text = text.replace(/\s+/g, ' ').trim();
            
            const fullLink = href.startsWith('http') ? href : "https://www.yok.gov.tr" + href;
            
            if (text.length < 10 || ['devamını oku', 'tüm haberler', 'tüm duyurular', 'haberler', 'duyurular'].includes(text.toLowerCase())) {
                continue;
            }
            
            if (seenLinks.has(fullLink)) continue;
            seenLinks.add(fullLink);
            
            // Try to find a date in surrounding HTML context (300 chars before, 900 chars after)
            const pos = html.indexOf(href);
            let dateVal = new Date(); // default to current time
            
            if (pos !== -1) {
                const context = html.substring(pos - 300, pos + 900);
                const dateMatch = /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})/i.exec(context);
                if (dateMatch) {
                    const [_, d, m, y] = dateMatch;
                    const monthIdx = parseTurkishMonth(m);
                    dateVal = new Date(parseInt(y), monthIdx, parseInt(d));
                } else {
                    // If no date found, simulate date based on seen order to preserve ordering
                    dateVal = new Date(Date.now() - (yokItems.length * 3600000));
                }
            } else {
                dateVal = new Date(Date.now() - (yokItems.length * 3600000));
            }
            
            yokItems.push({
                title: text,
                link: fullLink,
                source: "YÖK",
                date: dateVal.toISOString()
            });
        }
        return yokItems;
    } catch (e) {
        console.error("YOK Scrape Error:", e);
        return [];
    }
}

function parseTurkishMonth(m) {
    const months = {
        'ocak': 0, 'şubat': 1, 'mart': 2, 'nisan': 3, 'mayıs': 4, 'haziran': 5,
        'temmuz': 6, 'ağustos': 7, 'eylül': 8, 'ekim': 9, 'kasım': 10, 'aralık': 11
    };
    return months[m.toLowerCase()] || 0;
}
