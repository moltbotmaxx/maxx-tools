
const puppeteer = require('puppeteer');
(async () => {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setViewport({ width: 1024, height: 640 });
        await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 2000));
        await page.screenshot({ 
            path: '/Users/maxx/.openclaw/workspace/projects/maxx-tools/smart-frame/Dashboard_Latest.png',
            clip: { x: 0, y: 0, width: 1024, height: 640 }
        });
        await browser.close();
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
