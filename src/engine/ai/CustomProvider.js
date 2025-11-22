const axios = require('axios');
const AIProvider = require('./AIProvider');

class CustomProvider extends AIProvider {
    constructor(config = {}) {
        super(config);
        // Default to localhost:3005 if not specified, assuming the user is running the proxy locally
        this.apiUrl = process.env.CUSTOM_AI_URL || 'http://localhost:3005/generate';
        this.model = process.env.CUSTOM_AI_MODEL || config.model || null;

        console.log(`[CustomAI] Initialized. URL: ${this.apiUrl}`);
    }

    async classifyIntent(userInput, storyIntents, globalIntents, contextDescription, contextNode) {
        const combinedContext = {
            current_node: contextNode,
            global_intents: globalIntents
        };

        const jsonContext = JSON.stringify(combinedContext, null, 2);

        const intentsFlat = [
            ...(contextNode?.intents || []),
            ...(globalIntents || [])
        ].map(i => ({
            id: i.id,
            description: i.description || i.text_description || i.response || ""
        }));

        const allowedIds = intentsFlat.map(i => i.id).join(', ');

        const systemPrompt = `### Instruction:
You are an advanced Game Engine Intent Classifier.
Your task is to analyze the PLAYER INPUT and determine the correct INTENT ID from the provided JSON CONTEXT.

### Context (JSON):
${jsonContext}

### Allowed IDs (choose exactly one):
${allowedIds}

### Intents:
${intentsFlat.map(i => `- ${i.id}: ${i.description}`).join('\n')}

### Task:
1. Read the "current_node.intents" list and the "global_intents" list.
2. Match the PLAYER INPUT to the most appropriate "id" from Allowed IDs.
3. If the player's input implies movement (e.g. "walk to X"), look for intents with "action": "transition" and a description matching the target.
4. If no intent matches, return "unknown".
5. Output ONLY valid JSON in this exact format:
{"id":"<one of the Allowed IDs or unknown>"}
6. Do not output any explanation. Do not use Markdown.

### Examples:
Input: "look at the sky" -> Output: {"id":"look_sky"}
Input: "check inventory" -> Output: {"id":"global_inventory"}
Input: "jump" -> Output: {"id":"unknown"}

### Player Input:
"${userInput}"

### Response:
`;

        console.log(`[CustomAI] Asking remote endpoint...`);

        try {
            const payload = {
                prompt: systemPrompt,
                model: this.model,
                params: {
                    max_length: 32,
                    temperature: 0.1
                }
            };

            const response = await axios.post(this.apiUrl, payload);

            if (response.data && response.data.text) {
                return this.parseResponse(response.data.text, storyIntents, globalIntents);
            }

            throw new Error("Invalid response format from Custom AI endpoint");

        } catch (error) {
            console.error(`[CustomAI] Error:`, error.message);
            return 'unknown';
        }
    }

    parseResponse(rawText, storyIntents, globalIntents) {
        let result = (rawText || '').trim();
        console.log(`[CustomAI] Raw Response: "${result}"`);

        const validIds = [...storyIntents, ...globalIntents].map(i => i.id);

        // 1. Try to extract JSON object anywhere in the text
        const jsonBlobMatch = result.match(/\{[\s\S]*?\}/);
        if (jsonBlobMatch) {
            try {
                const obj = JSON.parse(jsonBlobMatch[0]);
                if (obj && typeof obj.id === 'string') {
                    const id = obj.id.trim();
                    if (validIds.includes(id)) return id;
                    if (id === 'unknown') return 'unknown';
                }
            } catch (e) {
                // ignore JSON parse errors
            }
        }

        // Cleanup Markdown code blocks
        result = result.replace(/```[\s\S]*?```/g, (match) => {
            const inner = match.replace(/```\w*/, '').replace(/```/, '').trim();
            return inner.includes('{') ? '' : inner;
        });

        const inlineJsonMatch = result.match(/"id"\s*:\s*"([^"]+)"/);
        if (inlineJsonMatch) {
            const id = inlineJsonMatch[1].trim();
            if (validIds.includes(id)) return id;
            if (id === 'unknown') return 'unknown';
        }

        const firstLine = result.split('\n')[0].trim();
        const cleaned = firstLine.replace(/[`'"]/g, '').trim();

        if (validIds.includes(cleaned)) return cleaned;
        if (cleaned === 'unknown') return 'unknown';

        const boundaryFound = validIds.find(id => new RegExp(`\\b${id}\\b`).test(result));
        if (boundaryFound) return boundaryFound;

        const containsFound = validIds.find(id => result.includes(id));
        if (containsFound) return containsFound;

        return 'unknown';
    }
}

module.exports = CustomProvider;
