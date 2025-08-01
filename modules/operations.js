const { createBrowserWithCookies } = require('../services/puppeteerSettings');

(async () => {
    const { browser, page } = await createBrowserWithCookies();

    // Navigate to the fleet page
    await page.goto('https://free2.airlinesim.aero/app/fleets?1');

    // Check for the presence of specific text
    const isDefaultFleetPresent = await page.evaluate(() => {
        return document.body.textContent.includes('Default fleet');
    });

    const isNoAircraftAssignedPresent = await page.evaluate(() => {
        return document.body.textContent.includes('This fleet has no aircraft assigned right now.');
    });

    // Log true if both conditions are met
    if (isDefaultFleetPresent && isNoAircraftAssignedPresent) {
        console.log(true);
    } else {
        console.log(false);
    }

    await browser.close();
})();