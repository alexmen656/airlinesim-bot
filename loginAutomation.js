require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    // Helper function to add a delay
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Navigate to the login page
    await page.goto('https://airlinesim.aero/de/auth/login');
    await sleep(500); // Small delay

    // Click the 'Alle Cookies akzeptieren' button
    await page.evaluate(() => {
        const acceptCookiesButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Alle Cookies akzeptieren'));
        if (acceptCookiesButton) acceptCookiesButton.click();
    });
    await sleep(500); // Small delay

    // Fill in the email input field
    await page.type('input[tabindex="1"]', process.env.EMAIL);
    await sleep(500); // Small delay

    // Fill in the password input field
    await page.type('input[tabindex="2"]', process.env.PASSWORD);
    await sleep(500); // Small delay

    // Click the checkbox
    await page.click('input[tabindex="3"]');
    await sleep(500); // Small delay

    // Click the submit button
    await page.click('button[tabindex="4"]');
    await sleep(1000); // Small delay

    // Save cookies to a file
    const cookies = await page.cookies();
    fs.writeFileSync('cookies.json', JSON.stringify(cookies, null, 2));
    console.log('Cookies saved to cookies.json');

    // Wait for navigation after submission (optional, adjust as needed)
   // await page.waitForNavigation();

    console.log('Login process completed.');

    await browser.close();
})();
