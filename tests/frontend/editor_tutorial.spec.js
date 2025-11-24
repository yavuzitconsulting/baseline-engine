
const { chromium } = require('playwright');
const path = require('path');

async function run() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Helper to verify highlights
    async function verifyHighlight(stepName, selector) {
        console.log(`Verifying highlight for ${stepName} on ${selector}`);
        try {
            await page.waitForFunction(
                (sel) => {
                    const el = document.querySelector(sel);
                    return el && el.classList.contains('highlight-tutorial');
                },
                selector,
                { timeout: 5000 }
            );
            console.log(`✅ ${stepName} highlight verified.`);
        } catch (e) {
            throw new Error(`❌ Failed to verify highlight for ${stepName} on ${selector}.`);
        }
    }

    try {
        console.log('--- Starting Editor Tutorial E2E Test ---');
        await page.goto('http://localhost:3005');

        // Global Dialog Handler State
        let nextNodeId = 'intro';

        // Dialog Handler
        page.on('dialog', async dialog => {
            console.log(`Dialog: ${dialog.message()}`);
            const msg = dialog.message();
            if (msg.includes('Create new story?')) await dialog.accept();
            else if (msg.includes('Enter unique ID')) await dialog.accept('auto_test_story');
            else if (msg.includes('Node ID:')) await dialog.accept(nextNodeId);
            else if (msg.includes('target node')) await dialog.accept('corridor');
            else if (msg.includes('First node must be')) await dialog.accept();
            else if (msg.includes('Publish this version')) await dialog.accept();
            else await dialog.accept();
        });

        // Step 1: Create New Story
        console.log('Step 1: Create New Story');
        await verifyHighlight('Step 1 (Start)', '#nav-new');
        await page.click('#nav-new');

        // Advance Tutorial manually
        await page.click('#tutorial-next-btn');

        // Step 2: Story Properties
        console.log('Step 2: Story Properties');
        await verifyHighlight('Step 2 (Properties)', '#nav-manifest');
        await page.click('#nav-manifest');

        await page.waitForSelector('#modal-manifest:not(.hidden)');

        // Check Required Markers
        const markers = await page.locator('.required-marker').count();
        if (markers === 0) throw new Error('No required field markers found');

        // Check Tooltip
        console.log('Verifying Tooltip...');
        // Use a more specific locator for the label "Title"
        // And ensure we hover the icon inside it.
        const titleLabel = page.locator('label').filter({ hasText: 'Title' });
        const icon = titleLabel.locator('.tooltip-icon');
        await icon.hover();

        // Check if tooltip text becomes visible
        // The tooltip text is a sibling or child.
        const tooltipText = titleLabel.locator('.tooltip-text');
        await tooltipText.waitFor({ state: 'visible', timeout: 5000 });
        console.log('Tooltip verified.');

        // Fill Fields
        await page.fill('#m-title', 'Automated Test Story');
        await page.fill('#m-desc', 'Description for automated test.');

        await page.click('button:has-text("Save Settings")');
        await page.waitForSelector('#modal-manifest', { state: 'hidden' });

        await page.click('#tutorial-next-btn');

        // Step 3: Create Intro Node
        console.log('Step 3: Create Intro Node');
        await verifyHighlight('Step 3 (Create Intro)', '#new-node-btn');
        await page.click('#new-node-btn');

        await page.waitForSelector('#editor-area:not(.hidden)');
        await page.click('#tutorial-next-btn');

        // Step 4: Add Description
        console.log('Step 4: Add Description');
        await verifyHighlight('Step 4 (Desc)', '#node-text');
        await page.fill('#node-text', 'Intro description text.');
        await page.click('#save-btn');
        await page.click('#tutorial-next-btn');

        // Step 5: Add Intent
        console.log('Step 5: Add Intent');
        await verifyHighlight('Step 5 (Intent)', '#add-intent-btn');
        await page.click('#add-intent-btn');

        const intentCard = page.locator('.intent-card').first();
        await intentCard.locator('.intent-id').fill('inspect_term');
        await intentCard.locator('.intent-desc').fill('User inspects');
        await intentCard.locator('.intent-text-desc').fill('Terminal on wall.');
        await intentCard.locator('.intent-target').fill('It works.');

        await page.click('#save-btn');
        await page.click('#tutorial-next-btn');

        // Step 6: Create Second Node
        console.log('Step 6: Create Second Node');
        await verifyHighlight('Step 6 (New Node)', '#new-node-btn');
        nextNodeId = 'corridor'; // Set next ID for dialog
        await page.click('#new-node-btn');
        // Add text to corridor
        await page.fill('#node-text', 'A long metal corridor.');
        await page.click('#save-btn');
        await page.click('#tutorial-next-btn');

        // Step 7: Select Intro
        console.log('Step 7: Select Intro');
        await verifyHighlight('Step 7 (Select Intro)', '#node-list');
        await page.click('.node-item:has-text("intro")');

        const idVal = await page.inputValue('#node-id');
        if (idVal !== 'intro') throw new Error('Failed to switch to intro node');

        await page.click('#tutorial-next-btn');

        // Step 8: Link Node
        console.log('Step 8: Link Node');
        await verifyHighlight('Step 8 (Link)', '#link-node-btn');
        await page.click('#link-node-btn');
        await page.click('#save-btn');
        await page.click('#tutorial-next-btn');

        // Step 9: Switch to Corridor
        console.log('Step 9: Switch to Corridor');
        await verifyHighlight('Step 9 (Nav)', '#node-list');
        await page.click('.node-item:has-text("corridor")');
        await page.click('#tutorial-next-btn');

        // Step 10: Add State Intent
        console.log('Step 10: State Intent');
        await verifyHighlight('Step 10 (Action)', '#add-intent-btn');

        await page.click('#add-intent-btn');
        // Fill intent
        const leverIntent = page.locator('.intent-card').last(); // last added
        await leverIntent.locator('.intent-id').fill('pull_lever');
        await leverIntent.locator('.intent-set-state').fill('power_on:true');
        await leverIntent.locator('.intent-target').fill('You hear a hum.');
        await page.click('#save-btn');

        await page.click('#tutorial-next-btn');

        // Step 11: Switch to Intro
        console.log('Step 11: Switch to Intro');
        await verifyHighlight('Step 11 (Nav)', '#node-list');
        await page.click('.node-item:has-text("intro")');
        await page.click('#tutorial-next-btn');

        // Step 12: Conditional
        console.log('Step 12: Conditional');
        await verifyHighlight('Step 12 (Cond)', '#add-conditional-btn');

        await page.click('#add-conditional-btn');
        const condRow = page.locator('.item-row').last();
        await condRow.locator('.cond-key').fill('power_on');
        await condRow.locator('.cond-val').fill('true');
        await condRow.locator('.cond-text').fill('Room is bright.');
        await page.click('#save-btn');

        await page.click('#tutorial-next-btn');

        // Step 13: Finish / Publish
        console.log('Step 13: Publish');
        await verifyHighlight('Step 13 (Finish)', '#nav-publish');

        // Mock Publish
        let publishHit = false;
        await page.route('**/api/publish', route => {
            console.log('Intercepted /api/publish');
            publishHit = true;
            route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
        });

        // Mock Login
        console.log('Login...');
        await page.click('#nav-login');
        const randomUser = 'user_' + Math.floor(Math.random() * 10000);
        await page.fill('#login-user', randomUser);
        await page.fill('#login-pass', 'testpass');
        await page.click('button:has-text("Register")');
        // Wait for modal to close
        await page.waitForSelector('#modal-login', { state: 'hidden' });
        await page.waitForTimeout(500);

        await page.click('#nav-publish');
        await page.waitForTimeout(1000);

        if (publishHit) console.log('✅ Publish request sent successfully.');
        else console.warn('⚠️ Publish request NOT sent');

        await page.screenshot({ path: 'tests/frontend/tutorial_complete.png' });
        console.log('Screenshot saved.');

    } catch (e) {
        console.error('Test Failed:', e);
        await page.screenshot({ path: 'tests/frontend/tutorial_error.png' });
        process.exit(1);
    } finally {
        await browser.close();
    }
}

run();
