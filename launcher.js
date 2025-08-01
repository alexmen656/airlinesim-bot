const { exec } = require('child_process');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to run a script
const runScript = (scriptPath) => {
    return new Promise((resolve, reject) => {
        const process = exec(`node ${scriptPath}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing ${scriptPath}:`, error);
                reject(error);
            } else {
                console.log(`Output from ${scriptPath}:\n`, stdout);
                resolve(stdout);
            }
        });

        process.stdout.on('data', (data) => {
            console.log(`[${scriptPath}]`, data.toString());
        });

        process.stderr.on('data', (data) => {
            console.error(`[${scriptPath} ERROR]`, data.toString());
        });
    });
};

(async () => {
    try {
        console.log('Starting loginAutomation.js...');
        await runScript('./loginAutomation.js');
        await sleep(10000);
        await runScript('./fillEnterpriseForm.js');

        // Add more scripts here if needed
        // console.log('Starting anotherScript.js...');
        // await runScript('./anotherScript.js');

        console.log('All scripts executed successfully.');
    } catch (error) {
        console.error('An error occurred while running scripts:', error);
    }
})();
