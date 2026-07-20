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
        const query = '("ÖSYM" OR "YÖK" OR "YKS" OR "TYT" OR "AYT")';
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=tr&gl=TR&ceid=TR:tr`;

        const xmlText = await new Promise((resolve, reject) => {
            https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
                let data = '';
                response.on('data', (chunk) => { data += chunk; });
                response.on('end', () => { resolve(data); });
            }).on('error', (err) => { reject(err); });
        });

        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        const titleRegex = /<title>([\s\S]*?)<\/title>/i;
        const linkRegex = /<link>([\s\S]*?)<\/link>/i;
        const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/i;
        const sourceRegex = /<source[^>]*>([\s\S]*?)<\/source>/i;

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
                let source = sourceMatch ? sourceMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim() : '';
                
                title = decodeHtmlEntities(title);
                source = decodeHtmlEntities(source);

                if (source && title.endsWith(' - ' + source)) {
                    title = title.substring(0, title.length - (source.length + 3)).trim();
                }
                
                items.push({ title, link, pubDate, source });
            }
        }

        res.status(200).json(items.slice(0, 15));
    } catch (error) {
        console.error("News API error:", error);
        res.status(500).json({ error: "Failed to fetch news." });
    }
};

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
