const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 640 });

    // Use the live GitHub Pages URL as the master source for the screenshot
    const liveUrl = 'https://moltbotmaxx.github.io/smart-frame/';
    await page.goto(liveUrl, { waitUntil: 'networkidle0' });

    // Wait a moment for layout to settle
    await new Promise(r => setTimeout(r, 2000));

    await page.screenshot({ 
        path: '/Users/maxx/.openclaw/workspace/projects/maxx-tools/smart-frame/Dashboard_Latest.png',
        clip: { x: 0, y: 0, width: 1024, height: 640 }
    });
    await browser.close();
})();
