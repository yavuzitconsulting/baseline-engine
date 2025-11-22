const redis = require('./src/engine/RedisClient');
const fs = require('fs');
const path = require('path');

async function run() {
    await redis.connect();

    // Manifest
    const manifestPath = path.join(process.cwd(), 'stories/protocol_01/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    await redis.setJson('story:protocol_01:manifest', manifest);
    console.log('Manifest loaded');

    // Intro Node
    const nodePath = path.join(process.cwd(), 'stories/protocol_01/nodes/intro.json');
    const node = JSON.parse(fs.readFileSync(nodePath, 'utf8'));
    await redis.setJson('story:protocol_01:node:intro', node);
    console.log('Intro Node loaded');

    process.exit(0);
}
run();
