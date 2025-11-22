const AIProvider = require('./AIProvider');
const natural = require('natural');

class NLPProvider extends AIProvider {
    constructor(config = {}) {
        super(config);
        this.tokenizer = new natural.WordTokenizer();
        this.stemmer = natural.PorterStemmer;
        console.log("[AI-NLP] Initialized simple Natural Language Processing provider.");
    }

    /**
     * Calculates the Jaccard similarity coefficient between two arrays of tokens.
     */
    calculateSimilarity(tokensA, tokensB) {
        if (tokensA.length === 0 || tokensB.length === 0) return 0;

        const setA = new Set(tokensA);
        const setB = new Set(tokensB);

        let intersection = 0;
        setA.forEach(token => {
            if (setB.has(token)) intersection++;
        });

        const union = setA.size + setB.size - intersection;
        return intersection / union;
    }

    processText(text) {
        if (!text) return [];
        // Tokenize and stem
        const tokens = this.tokenizer.tokenize(text.toLowerCase());
        return tokens.map(t => this.stemmer.stem(t));
    }

    async classifyIntent(userInput, storyIntents, globalIntents, contextDescription, contextNode) {
        const userTokens = this.processText(userInput);

        if (userTokens.length === 0) return 'unknown';

        const allIntents = [...storyIntents, ...globalIntents];
        let bestMatch = null;
        let highestScore = 0;

        // Threshold for match confidence
        // Lowered to 0.10 to catch short inputs like "look" (matches "look around")
        const THRESHOLD = 0.10;

        for (const intent of allIntents) {
            // We match against the description AND the ID (as a keyword)

            const descriptionTokens = this.processText(intent.description);
            const idTokens = this.processText(intent.id.replace(/_/g, ' '));

            // Combined tokens for the intent
            const intentTokens = [...descriptionTokens, ...idTokens];

            const score = this.calculateSimilarity(userTokens, intentTokens);

            if (score > highestScore) {
                highestScore = score;
                bestMatch = intent.id;
            }
        }

        console.log(`[AI-NLP] Input: "${userInput}" | Best Match: "${bestMatch}" (Score: ${highestScore.toFixed(2)})`);

        if (highestScore >= THRESHOLD) {
            return bestMatch;
        }

        return 'unknown';
    }
}

module.exports = NLPProvider;
