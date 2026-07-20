const https = require('https');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Scrape ÖSYM and fetch YÖK concurrently
        const [osymNews, yokNews] = await Promise.all([
            getOsymNews(),
            getYokNews()
        ]);

        // Combine and sort by date descending
        const combined = [...osymNews, ...yokNews];
        combined.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.status(200).json(combined.slice(0, 15));
    } catch (error) {
        console.error("News API error:", error);
        res.status(500).json({ error: "Failed to fetch news." });
    }
};

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (response) => {
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => { resolve(data); });
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
            let text = match[2].replace(/<[^>]+>/g, ''); // strip inline tags
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
        const query = 'site:yok.gov.tr';
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=tr&gl=TR&ceid=TR:tr`;
        const xmlText = await fetchUrl(url);
        
        const announcements = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        const titleRegex = /<title>([\s\S]*?)<\/title>/i;
        const linkRegex = /<link>([\s\S]*?)<\/link>/i;
        const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/i;
        const sourceRegex = /<source[^>]*>([\s\S]*?)<\/source>/i;

        const excludeSubdomains = ['akademik.yok.gov.tr', 'tez.yok.gov.tr', 'yoksis.yok.gov.tr', 'denklik.yok.gov.tr', 'dbs.yok.gov.tr'];
        const excludeTitles = ['yök akademik', 'ulusal tez merkezi', 'yükseköğretim bilgi sistemi', 'doçentlik bilgi sistemi', 'rektörlük başvuru sistemi'];

        let match;
        while ((match = itemRegex.exec(xmlText)) !== null) {
            const itemContent = match[1];
            const titleMatch = titleRegex.exec(itemContent);
            const linkMatch = linkRegex.exec(itemContent);
            const pubDateMatch = pubDateRegex.exec(itemContent);
            const sourceMatch = sourceRegex.exec(itemContent);
            
            if (titleMatch && linkMatch) {
                let title = titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
                let link = linkMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
                let pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';
                let source = sourceMatch ? sourceMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim() : 'YÖK';
                
                title = decodeHtmlEntities(title);
                source = decodeHtmlEntities(source);

                const titleClean = title.split(' - ')[0].trim();
                
                if (excludeSubdomains.some(sub => link.toLowerCase().includes(sub))) continue;
                if (excludeTitles.some(t => titleClean.toLowerCase().includes(t))) continue;
                if (['haberler', 'ana sayfa | yükseköğretim kurulu', 'başkan'].includes(titleClean.toLowerCase())) continue;

                const dt = new Date(pubDate);
                announcements.push({
                    title: titleClean,
                    link: link,
                    source: "YÖK",
                    date: dt.toISOString()
                });
            }
        }
        return announcements;
    } catch (e) {
        console.error("YOK RSS Error:", e);
        return [];
    }
}

function decodeHtmlEntities(str) {
    return str
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&Ouml;/g, "Ö")
        .replace(/&ouml;/g, "ö")
        .replace(/&Uuml;/g, "Ü")
        .replace(/&uuml;/g, "ü")
        .replace(/&Ccedil;/g, "Ç")
        .replace(/&ccedil;/g, "ç")
        .replace(/&Iuml;/g, "İ")
        .replace(/&iuml;/g, "i")
        .replace(/&Scedil;/g, "Ş")
        .replace(/&scedil;/g, "ş")
        .replace(/&Gbreve;/g, "Ğ")
        .replace(/&gbreve;/g, "ğ");
}
