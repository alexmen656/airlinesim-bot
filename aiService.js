const axios = require('axios');

class AIService {
    constructor() {
        console.log('AI Service initialized');
    }

    // Communicate with the local API
    async queryLocalAPI(prompt) {
        try {
            const response = await axios.post('http://localhost:11434/api/generate', {
                model: 'nollama/mythomax-l2-13b:Q5_K_S',
                prompt,
                stream: false
            });
            return response.data;
        } catch (error) {
            console.error('Error communicating with local API:', error);
            throw error;
        }
    }

    // Example AI function: Generate text using the local API
    async generateText(prompt) {
        const result = await this.queryLocalAPI(prompt);
        return result.response || 'No response';
    }

    // Example AI function: Summarize text using the local API
    async summarizeText(text) {
        const prompt = `Summarize the following text:\n${text}`;
        const result = await this.queryLocalAPI(prompt);
        return result.response || 'No summary available';
    }

    // Add more AI-related functions here as needed
}
/*new AIService().generateText("hallo").then(res => {
    console.log(res);
});*/
module.exports = new AIService();
