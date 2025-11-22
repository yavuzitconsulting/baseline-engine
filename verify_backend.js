const http = require('http');
const assert = require('assert');

const BASE_URL = 'http://localhost:3000';

function httpRequest(url, options = {}, body = null) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const reqOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = http.request(reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        json: () => JSON.parse(data)
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        json: () => ({ error: "Invalid JSON", raw: data })
                    });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(body);
        }
        req.end();
    });
}

async function runTests() {
    console.log("Starting Backend Verification...");

    // 1. Test /api/stories for authorName
    console.log("Testing /api/stories...");
    try {
        const storiesRes = await httpRequest(`${BASE_URL}/api/stories`);
        const stories = storiesRes.json();
        const protocol = stories.find(s => s.id === 'protocol_01');

        assert.ok(protocol, "protocol_01 should exist");
        assert.strictEqual(protocol.authorName, "Ramazan Yavuz (RaY)", "authorName mismatch in protocol_01");
        assert.strictEqual(protocol.authorId, "ramazan_yavuz", "authorId mismatch in protocol_01");
        console.log("PASS: /api/stories has correct author info");

        // 2. Test /api/start for Intro (should be isAiGenerated: false)
        console.log("Testing /api/start (Intro)...");
        const startRes = await httpRequest(`${BASE_URL}/api/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, JSON.stringify({ storyId: 'protocol_01' }));

        const startData = startRes.json();
        const sessionId = startData.sessionId;

        assert.ok(sessionId, "Session ID should be returned");
        // Note: I changed type to 'intro' in the code, checking if it persists
        assert.strictEqual(startData.type, 'intro', `Expected type 'intro', got '${startData.type}'`);
        assert.strictEqual(startData.isAiGenerated, false, "Intro should NOT be AI generated");
        console.log("PASS: /api/start returned correct flags for Intro");

        // 3. Test /api/interact for cached/AI intent
        console.log("Testing /api/interact (look around)...");
        const interactRes = await httpRequest(`${BASE_URL}/api/interact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, JSON.stringify({ sessionId, input: 'look around' }));

        const interactData = interactRes.json();

        assert.ok(interactData.isAiGenerated === true, `Interactions should be marked as AI generated, got ${interactData.isAiGenerated}`);
        console.log("PASS: /api/interact returned isAiGenerated: true");

        console.log("Backend Verification Complete!");

    } catch (err) {
        console.error("TEST FAILED:", err);
        process.exit(1);
    }
}

// Wait for server to start
setTimeout(runTests, 1000);
