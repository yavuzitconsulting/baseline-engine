const fs = require('fs');
const path = require('path');

const STORIES_DIR = path.join(process.cwd(), 'stories');
const MANDATORY_MANIFEST_FIELDS = ['id', 'title', 'description', 'authorId', 'authorName', 'startNode', 'language', 'date'];

console.log("Scanning stories for validation...");

if (!fs.existsSync(STORIES_DIR)) {
    console.log("No stories directory found.");
    process.exit(0);
}

const stories = fs.readdirSync(STORIES_DIR);
let hasErrors = false;

for (const storyId of stories) {
    const storyPath = path.join(STORIES_DIR, storyId);
    if (!fs.statSync(storyPath).isDirectory()) continue;

    const manifestPath = path.join(storyPath, 'manifest.json');
    const nodesPath = path.join(storyPath, 'nodes');

    // 1. Check Manifest Existence
    if (!fs.existsSync(manifestPath)) {
        console.error(`[ERROR] Story '${storyId}' is missing manifest.json`);
        hasErrors = true;
        continue;
    }

    // 2. Validate Manifest Fields
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const missingFields = MANDATORY_MANIFEST_FIELDS.filter(field => !manifest[field]);

        if (missingFields.length > 0) {
            console.error(`[ERROR] Story '${storyId}' manifest is missing fields: ${missingFields.join(', ')}`);
            hasErrors = true;
        }

        // 3. Validate Nodes Directory
        if (!fs.existsSync(nodesPath)) {
            console.error(`[ERROR] Story '${storyId}' is missing 'nodes' directory`);
            hasErrors = true;
            continue;
        }

        const nodeFiles = fs.readdirSync(nodesPath).filter(f => f.endsWith('.json'));
        const nodeIds = new Set();

        // 4. Validate Individual Nodes
        for (const file of nodeFiles) {
            try {
                const nodeContent = JSON.parse(fs.readFileSync(path.join(nodesPath, file), 'utf8'));

                if (!nodeContent.id) {
                    console.error(`[ERROR] Story '${storyId}' node '${file}' is missing 'id'`);
                    hasErrors = true;
                } else {
                    nodeIds.add(nodeContent.id);
                    // Check if filename matches ID
                    const expectedFilename = `${nodeContent.id}.json`;
                    if (file !== expectedFilename) {
                         console.error(`[ERROR] Story '${storyId}' node filename '${file}' does not match id '${nodeContent.id}'`);
                         hasErrors = true;
                    }
                }

                if (!nodeContent.text && (!nodeContent.text_conditionals || nodeContent.text_conditionals.length === 0)) {
                     console.error(`[ERROR] Story '${storyId}' node '${file}' is missing 'text' (and has no conditionals)`);
                     hasErrors = true;
                }
            } catch (err) {
                console.error(`[ERROR] Story '${storyId}' node '${file}' is invalid JSON: ${err.message}`);
                hasErrors = true;
            }
        }

        // 5. Validate Start Node Existence
        if (manifest.startNode && !nodeIds.has(manifest.startNode)) {
            console.error(`[ERROR] Story '${storyId}' manifest startNode '${manifest.startNode}' does not exist in nodes.`);
            hasErrors = true;
        }

    } catch (err) {
        console.error(`[ERROR] Story '${storyId}' manifest.json is invalid JSON: ${err.message}`);
        hasErrors = true;
    }
}

if (hasErrors) {
    console.error("\nVerification FAILED. Please fix the errors above.");
    process.exit(1);
} else {
    console.log("All stories verified successfully.");
    process.exit(0);
}
