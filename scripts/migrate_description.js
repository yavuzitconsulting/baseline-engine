const fs = require('fs');
const path = require('path');

const storiesDir = path.join(__dirname, '../stories');

function migrateNode(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(content);
        let modified = false;

        if (json.intents && Array.isArray(json.intents)) {
            json.intents.forEach(intent => {
                if (intent.description !== undefined) {
                    intent.ai_intent_helper = intent.description;
                    delete intent.description;
                    modified = true;
                }
            });
        }

        if (modified) {
            fs.writeFileSync(filePath, JSON.stringify(json, null, 4));
            console.log(`Migrated: ${filePath}`);
        }
    } catch (e) {
        console.error(`Error processing ${filePath}:`, e.message);
    }
}

function traverse(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            traverse(fullPath);
        } else if (file.endsWith('.json') && file !== 'manifest.json' && file !== 'plugin.json') {
            // Assume it is a node file if it's not manifest or plugin
            migrateNode(fullPath);
        }
    });
}

console.log('Starting migration of description -> ai_intent_helper...');
traverse(storiesDir);
console.log('Migration complete.');
