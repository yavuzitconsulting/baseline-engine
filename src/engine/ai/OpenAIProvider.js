const AIProvider = require('./AIProvider');

class OpenAIProvider extends AIProvider {
    constructor(config = {}) {
        super(config);
        this.apiKey = process.env.OPENAI_API_KEY;
        this.model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

        if (!this.apiKey) {
            console.warn("[OpenAI] No API Key provided! Set OPENAI_API_KEY env var.");
        }
    }

    async classifyIntent(userInput, storyIntents, globalIntents, contextDescription, contextNode) {
        if (!this.apiKey) return 'unknown';

        const combinedContext = {
            current_node: contextNode,
            global_intents: globalIntents
        };

        const intentsFlat = [
            ...(contextNode?.intents || []),
            ...(globalIntents || [])
        ].map(i => ({
            id: i.id,
            description: i.description || i.text_description || i.response || ""
        }));

        const allowedIds = intentsFlat.map(i => i.id).join(', ');

        const systemPrompt = `You are an advanced Game Engine Intent Classifier.
Analyze the PLAYER INPUT and determine the correct INTENT ID from the Allowed IDs list based on the JSON Context.

Context:
${JSON.stringify(combinedContext)}

Allowed IDs:
${allowedIds}

Intents:
${intentsFlat.map(i => `- ${i.id}: ${i.description}`).join('\n')}

Output ONLY valid JSON in this format: {"id": "intent_id"}.
If no match, use "unknown".`;

        try {
            // We use dynamic import or a simple fetch to avoid hard dependency on openai package if possible,
            // but standard practice implies using 'openai' lib. For simplicity and zero-dependency preference in this task:
            // we use fetch (node 18+).

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userInput }
                    ],
                    temperature: 0.1,
                    response_format: { type: "json_object" }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            const content = data.choices[0].message.content;
            const json = JSON.parse(content);
            return json.id || 'unknown';

        } catch (error) {
            console.error(`[OpenAI] Error:`, error.message);
            return 'unknown';
        }
    }
}

module.exports = OpenAIProvider;
