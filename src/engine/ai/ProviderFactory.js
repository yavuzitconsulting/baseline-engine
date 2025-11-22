const OllamaProvider = require('./OllamaProvider');
const CustomProvider = require('./CustomProvider');
const OpenAIProvider = require('./OpenAIProvider');
const GeminiProvider = require('./GeminiProvider');
const NLPProvider = require('./NLPProvider');

class ProviderFactory {
    static createProvider() {
        // Default to 'ollama' 
        const providerType = process.env.AI_PROVIDER || 'ollama';

        console.log(`[AI-Factory] Selecting provider: ${providerType}`);

        switch (providerType.toLowerCase()) {
            case 'custom':
            case 'custom_ai':
                return new CustomProvider();

            case 'openai':
                return new OpenAIProvider();

            case 'gemini':
                return new GeminiProvider();

            case 'nlp':
                return new NLPProvider();

            case 'ollama':
            default:
                return new OllamaProvider({
                    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
                    model: process.env.OLLAMA_MODEL || 'phi3:mini'
                });
        }
    }
}

module.exports = ProviderFactory;
