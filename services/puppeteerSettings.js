const puppeteer = require('puppeteer');
const fs = require('fs');

async function createBrowserWithCookies() {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    if (fs.existsSync('cookies.json')) {
        const cookies = JSON.parse(fs.readFileSync('cookies.json', 'utf-8'));
        await page.setCookie(...cookies);
        console.log('Cookies loaded into the browser.');
    } else {
        console.log('No cookies file found. Proceeding without cookies.');
    }

    return { browser, page };
}

module.exports = { createBrowserWithCookies };
