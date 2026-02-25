const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);

    // API: Data Health Status
    if (req.url === '/api/status' && req.method === 'GET') {
        fs.readFile(DATA_FILE, 'utf8', (err, raw) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to read data file', details: err.message }));
                return;
            }
            fs.stat(DATA_FILE, (statErr, stats) => {
                const payload = {};
                try {
                    const data = JSON.parse(raw || '{}');
                    const articles = Array.isArray(data.articles) ? data.articles : [];
                    const xItems = Array.isArray(data.x_viral?.items) ? data.x_viral.items : [];
                    const redditItems = Array.isArray(data.reddit_viral?.items) ? data.reddit_viral.items : [];
                    const validImageCount = articles.filter(a =>
                        typeof a.image_url === 'string' && /^https?:\/\//i.test(a.image_url)
                    ).length;
                    const imageCoveragePct = articles.length ? Number(((validImageCount / articles.length) * 100).toFixed(2)) : 0;

                    payload.timestamp = data.pipeline_meta?.generated_at || (statErr ? null : stats.mtime.toISOString());
                    payload.last_run = payload.timestamp;
                    payload.counts = {
                        articles: articles.length,
                        x_items: xItems.length,
                        reddit_items: redditItems.length
                    };
                    payload.image_url_valid_pct = imageCoveragePct;
                    payload.scoring_version = data.pipeline_meta?.scoring_version || 'unknown';
                } catch (parseErr) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON in data file', details: parseErr.message }));
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            });
        });
        return;
    }

    // API: GET Data
    if (req.url === '/api/data' && req.method === 'GET') {
        fs.readFile(DATA_FILE, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to read data' }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data || '{}');
            }
        });
        return;
    }

    // API: SAVE Data
    if (req.url === '/api/data' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            fs.writeFile(DATA_FILE, body, (err) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to save data' }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                }
            });
        });
        return;
    }

    // Static File Serving
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Serving static files from ${__dirname}`);
    console.log(`Data file: ${DATA_FILE}`);
});
