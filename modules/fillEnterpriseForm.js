const aiService = require('../services/aiService');
const { createBrowserWithCookies } = require('../services/puppeteerSettings');

(async () => {
    const { browser, page } = await createBrowserWithCookies();

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    await page.goto('https://free2.airlinesim.aero/app/enterprise/new?0');
    await sleep(500); // Small delay

    // Generate airline name, code, and hub together using AIService
    const prompt = 'Generate a unique airline name, a corresponding 2-3 letter code and the location hub (3 letter code). format: /Name: (.*), Code: (\w{2,3}), Hub: (.*)/';
    const aiResponse = await aiService.generateText(prompt);
    console.log('AI Response:', aiResponse);

    // Extract name, code, and hub from AI response
    const match = aiResponse.match(/Name: (.*), Code: (\w{2,3}), Hub: (.*)/);
    const airlineName = match ? match[1] : 'Default Airline';
    const airlineCode = match ? match[2] : 'DEF';
    const airlineHub = match ? match[3] : 'LAS';

    // Fill in the field with ID #id2 (Airline Name)
    await page.focus('#id2');
    await sleep(3000);
    await page.type('#id2', airlineName);
    await sleep(3000);

    // Fill in the field with ID #id3 (Airline Code)
    await page.focus('#id3');
    await sleep(3000);
    await page.type('#id3', airlineCode);
    await sleep(3000);

    // Fill in the field with ID #id4 (Airline Hub)
    await page.focus('#id4');
    await sleep(3000);
    await page.type('#id4', airlineHub);
    await sleep(3000);

    await page.focus('input[tabindex="15"]');
    await sleep(3000);
    await page.click('input[tabindex="15"]');
    await sleep(3000);

    await sleep(50000);
    console.log(`Airline created with Name: ${airlineName}, Code: ${airlineCode}, Hub: ${airlineHub}`);

    await browser.close();
})();
