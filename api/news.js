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
        const [osymNews, yokNews] = await Promise.all([
            getOsymNews().catch(err => { console.error("OSYM Error:", err); return []; }),
            withTimeout(getYokNews(), 4500)
        ]);

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
        // Try fetching the actual portal homepage first
        const html = await fetchUrl("https://www.osym.gov.tr/genel/anasayfa.aspx");
        const announcements = [];
        const pattern = /<a[^>]+href=["'](\/TR,\d+\/[^"'>]+)["'][^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
        let match;
        
        while ((match = pattern.exec(html)) !== null) {
            const href = match[1];
            let text = match[2].replace(/<[^>]+>/g, ''); // strip tags
            text = text.replace(/\s+/g, ' ').trim();
            
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
        
        if (announcements.length > 0) {
            return announcements;
        }
    } catch (e) {
        console.error("OSYM Portal Scrape Error, trying splash fallback:", e);
    }
    
    // Fallback: Fetch index page to check for splash page
    try {
        const html = await fetchUrl("https://www.osym.gov.tr/");
        
        const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(html);
        const bodyTitleMatch = /<div class="wpage-title">([\s\S]*?)<\/div>/i.exec(html);
        
        const splashTitle = bodyTitleMatch ? bodyTitleMatch[1] : (titleMatch ? titleMatch[1] : null);
        
        if (splashTitle && (html.includes("sonuc") || html.includes("Sonuç"))) {
            let cleanTitle = splashTitle.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            
            const linkMatch = /href=["'](https:\/\/ykssonuc\.osym\.gov\.tr\/[^"']*)["']/i.exec(html) || /href=["'](https:\/\/sonuc\.osym\.gov\.tr\/[^"']*)["']/i.exec(html);
            const resultLink = linkMatch ? linkMatch[1] : "https://ykssonuc.osym.gov.tr/";
            
            return [{
                title: cleanTitle,
                link: resultLink,
                source: "ÖSYM",
                date: new Date().toISOString()
            }];
        }
    } catch (e) {
        console.error("OSYM Splash Fallback Error:", e);
    }
    
    return [];
}

async function getYokNews() {
    try {
        const html = await fetchUrl("https://www.yok.gov.tr/tr");
        const yokItemsRaw = [];
        const seenLinks = new Set();
        
        const aPattern = /<a[^>]+href=["']((?:https:\/\/www\.yok\.gov\.tr)?\/tr\/(?:news|announcements)\/([^"'>]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        let maxParsedDate = null;
        
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
            
            const pos = html.indexOf(href);
            let parsedDate = null;
            
            if (pos !== -1) {
                const context = html.substring(pos - 300, pos + 900);
                const dateMatch = /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)/i.exec(context);
                const yearMatch = /\b(20\d{2})\b/.exec(context);
                if (dateMatch) {
                    const [_, d, m] = dateMatch;
                    const y = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
                    const monthIdx = parseTurkishMonth(m);
                    parsedDate = new Date(parseInt(y), monthIdx, parseInt(d), 0, 0, 0);
                    if (!maxParsedDate || parsedDate > maxParsedDate) {
                        maxParsedDate = parsedDate;
                    }
                }
            }
            
            yokItemsRaw.push({
                title: text,
                link: fullLink,
                source: "YÖK",
                parsedDate: parsedDate
            });
        }
        
        if (!maxParsedDate) {
            maxParsedDate = new Date();
        }
        
        return yokItemsRaw.map((item, idx) => {
            let finalDate = item.parsedDate;
            if (!finalDate) {
                // Subtract hours to keep relative ordering below maxParsedDate
                finalDate = new Date(maxParsedDate.getTime() - (idx * 3600000));
            }
            return {
                title: item.title,
                link: item.link,
                source: item.source,
                date: finalDate.toISOString()
            };
        });
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
