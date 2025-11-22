const { createClient } = require('redis');
const fs = require('fs');
const path = require('path');

const HOST = process.env.REDIS_HOST || 'localhost';
const PORT = process.env.REDIS_PORT || 6379;

async function main() {
    const command = process.argv[2];
    const fileArg = process.argv[3] || 'redis_dump.json';
    const filePath = path.resolve(process.cwd(), fileArg);

    if (!command || !['export', 'import'].includes(command)) {
        console.error('Usage: node redis_tools.js [export|import] <filename>');
        process.exit(1);
    }

    console.log(`[RedisTool] Connecting to ${HOST}:${PORT}...`);
    const client = createClient({ url: `redis://${HOST}:${PORT}` });

    client.on('error', (err) => console.error('[Redis] Error:', err));
    await client.connect();
    console.log('[RedisTool] Connected.');

    try {
        if (command === 'export') {
            await exportData(client, filePath);
        } else {
            await importData(client, filePath);
        }
    } catch (err) {
        console.error('[RedisTool] Error:', err);
    } finally {
        await client.quit();
    }
}

async function exportData(client, filePath) {
    console.log('[RedisTool] Scanning keys...');

    // Define patterns to export
    const patterns = ['story:*', 'session:*', 'intent_cache:*'];
    let allKeys = [];

    for (const pattern of patterns) {
        let cursor = 0;
        do {
            const reply = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
            cursor = reply.cursor;
            allKeys.push(...reply.keys);
        } while (cursor !== 0);
    }

    // Deduplicate keys
    allKeys = [...new Set(allKeys)];
    console.log(`[RedisTool] Found ${allKeys.length} keys.`);

    if (allKeys.length === 0) {
        console.log('[RedisTool] Nothing to export.');
        return;
    }

    const data = {};
    for (const key of allKeys) {
        const value = await client.get(key);
        data[key] = value;
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`[RedisTool] Successfully exported to ${filePath}`);
}

async function importData(client, filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`[RedisTool] File not found: ${filePath}`);
        return;
    }

    console.log(`[RedisTool] Reading from ${filePath}...`);
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    const keys = Object.keys(data);

    console.log(`[RedisTool] Importing ${keys.length} keys...`);

    // Use MSET for batch insertion if possible, or loop
    // MSET arguments are [key, value, key, value...]
    // But huge MSET might block, so let's do chunks or simple loop

    let count = 0;
    for (const key of keys) {
        await client.set(key, data[key]);
        count++;
    }

    console.log(`[RedisTool] Successfully imported ${count} keys.`);
}

main();
