const fs = require('fs');
const path = require('path');

const storiesDir = path.join(process.cwd(), 'stories');

// Function to clean up description for human-readable label
function createIntentDescription(intent) {
    if (intent.intent_description) return intent.intent_description;

    let desc = intent.ai_intent_helper || intent.id;

    // Remove common prefixes
    desc = desc.replace(/^the user wants to /i, '');
    desc = desc.replace(/^user wants to /i, '');
    desc = desc.replace(/^the user /i, '');

    // Capitalize first letter
    desc = desc.charAt(0).toUpperCase() + desc.slice(1);

    // Remove trailing period
    if (desc.endsWith('.')) {
        desc = desc.slice(0, -1);
    }

    // If it was just an ID, clean it up further (underscores to spaces)
    if (!intent.ai_intent_helper) {
        desc = desc.replace(/_/g, ' ');
         // Capitalize again after replace
        desc = desc.charAt(0).toUpperCase() + desc.slice(1);
    }

    // Truncate if too long (arbitrary 50 chars)
    if (desc.length > 60) {
        desc = desc.substring(0, 57) + '...';
    }

    return desc;
}

function processStories() {
    const stories = fs.readdirSync(storiesDir);

    for (const storyId of stories) {
        const storyPath = path.join(storiesDir, storyId);
        if (!fs.lstatSync(storyPath).isDirectory()) continue;

        const nodesDir = path.join(storyPath, 'nodes');
        if (!fs.existsSync(nodesDir)) continue;

        const nodes = fs.readdirSync(nodesDir);
        for (const nodeFile of nodes) {
            if (!nodeFile.endsWith('.json')) continue;

            const nodePath = path.join(nodesDir, nodeFile);
            let content;
            try {
                content = JSON.parse(fs.readFileSync(nodePath, 'utf8'));
            } catch (e) {
                console.error(`Failed to parse ${nodePath}: ${e.message}`);
                continue;
            }

            let modified = false;
            if (content.intents && Array.isArray(content.intents)) {
                content.intents = content.intents.map(intent => {
                    if (!intent.intent_description) {
                        const newDesc = createIntentDescription(intent);
                        console.log(`[${storyId}/${nodeFile}] Added intent_description: "${newDesc}" for intent: ${intent.id}`);
                        intent.intent_description = newDesc;
                        modified = true;
                    }
                    return intent;
                });
            }

            if (modified) {
                fs.writeFileSync(nodePath, JSON.stringify(content, null, 2));
            }
        }
    }
}

processStories();
console.log("Update complete.");
