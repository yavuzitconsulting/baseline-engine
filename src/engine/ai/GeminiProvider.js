const AIProvider = require('./AIProvider');

class GeminiProvider extends AIProvider {
    constructor(config = {}) {
        super(config);
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

        if (!this.apiKey) {
            console.warn("[Gemini] No API Key provided! Set GEMINI_API_KEY env var.");
        }
    }

    async classifyIntent(userInput, storyIntents, globalIntents, contextDescription, contextNode) {
        if (!this.apiKey) return 'unknown';

        const intentsFlat = [
            ...(contextNode?.intents || []),
            ...(globalIntents || [])
        ].map(i => ({
            id: i.id,
            description: i.description || i.text_description || i.response || ""
        }));

        const allowedIds = intentsFlat.map(i => i.id).join(', ');

        const systemPrompt = `You are an Game Engine Intent Classifier.
Analyze the PLAYER INPUT and determine the correct INTENT ID from the Allowed IDs list.

Allowed IDs: ${allowedIds}

Intents:
${intentsFlat.map(i => `- ${i.id}: ${i.description}`).join('\n')}

Output ONLY valid JSON in this format: {"id": "intent_id"}.
If no match, use "unknown".`;

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: systemPrompt + `\n\nPlayer Input: "${userInput}"` }]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            const content = data.candidates[0].content.parts[0].text;
            const json = JSON.parse(content);
            return json.id || 'unknown';

        } catch (error) {
            console.error(`[Gemini] Error:`, error.message);
            return 'unknown';
        }
    }
}

module.exports = GeminiProvider;
