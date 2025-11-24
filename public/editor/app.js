/**
 * ECHO PROTOCOL MAP EDITOR - CLIENT (LOCAL FIRST ARCHITECTURE)
 */

// --- Global State ---
const AppState = {
    currentStory: null,
    currentNodeId: null,
    viewMode: 'form', // 'form' or 'code'
    storyData: {
        id: null,
        manifest: {
            id: '',
            title: '',
            description: '',
            authorName: '',
            authorId: '',
            startNode: 'intro',
            language: 'en',
            date: new Date().toISOString().split('T')[0]
        },
        nodes: []
    },
    user: null, // { username, token }
    csrfToken: null,
    unsavedChanges: false
};

// --- DOM Elements ---
const els = {
    nodeList: document.getElementById('node-list'),
    editorArea: document.getElementById('editor-area'),
    emptyState: document.getElementById('empty-state'),
    statusMsg: document.getElementById('status-msg'),

    // Editor Views
    formView: document.getElementById('form-view-container'),
    codeView: document.getElementById('code-view-container'),
    codeEditor: document.getElementById('code-editor'),
    toggleViewBtn: document.getElementById('toggle-view-btn'),

    // Editor Inputs
    nodeId: document.getElementById('node-id'),
    nodeText: document.getElementById('node-text'),
    nodeRevisit: document.getElementById('node-text-revisit'),
    conditionalsList: document.getElementById('conditionals-list'),
    intentsList: document.getElementById('intents-list'),

    // Buttons
    newNodeBtn: document.getElementById('new-node-btn'),
    saveNodeBtn: document.getElementById('save-btn'),
    addConditionalBtn: document.getElementById('add-conditional-btn'),
    addIntentBtn: document.getElementById('add-intent-btn'),

    // Navbar Actions
    btnLogin: document.getElementById('nav-login'),
    btnNew: document.getElementById('nav-new'),
    btnLoad: document.getElementById('nav-load'),
    btnExport: document.getElementById('nav-export'),
    btnImport: document.getElementById('nav-import'),
    btnPublish: document.getElementById('nav-publish'),
    btnDocs: document.getElementById('nav-docs'),
    btnManifest: document.getElementById('nav-manifest'),
    btnTutorial: document.getElementById('nav-tutorial'),

    // Context Panel
    minimap: document.getElementById('minimap-container'),
    tutorialContent: document.getElementById('tutorial-content'),
    tutorialAction: document.getElementById('tutorial-action'),

    // Modals
    modalLogin: document.getElementById('modal-login'),
    modalLoad: document.getElementById('modal-load'),
    modalManifest: document.getElementById('modal-manifest'),
    modalDocs: document.getElementById('modal-docs')
};

// --- Initialization ---
const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'tr', name: 'Turkish' },
    { code: 'pl', name: 'Polish' },
    { code: 'nl', name: 'Dutch' }
];

function init() {
    checkUser();
    initSecurity();
    loadFromLocal();
    bindEvents();
    updateUI();
    populateLanguageDropdown();
    initTutorial();
}

async function initSecurity() {
    try {
        const headers = {};
        if (AppState.user && AppState.user.token) {
            headers['x-editor-token'] = AppState.user.token;
        }

        const res = await fetch('/api/auth/csrf', { headers });
        const data = await res.json();
        if (data.csrfToken) AppState.csrfToken = data.csrfToken;
        if (data.anonToken) sessionStorage.setItem('editor_anon_token', data.anonToken);
    } catch (e) {
        console.error("Failed to init security", e);
    }
}

function populateLanguageDropdown() {
    const select = document.getElementById('m-lang');
    if (!select) return;
    SUPPORTED_LANGUAGES.forEach(lang => {
        const opt = document.createElement('option');
        opt.value = lang.code;
        opt.textContent = `${lang.name} [${lang.code.toUpperCase()}]`;
        select.appendChild(opt);
    });
}

function checkUser() {
    const stored = localStorage.getItem('editor_user');
    if (stored) {
        AppState.user = JSON.parse(stored);
        console.log("Logged in as:", AppState.user.username);
    }
}

function bindEvents() {
    els.btnNew.onclick = newStory;
    els.btnLoad.onclick = () => openModal('modal-load');
    els.btnExport.onclick = exportBundle;
    els.btnImport.onclick = () => document.getElementById('file-import').click();
    els.btnPublish.onclick = publishStory;
    els.btnLogin.onclick = () => {
        if (AppState.user) logout();
        else openModal('modal-login');
    };
    els.btnManifest.onclick = () => {
        populateManifestModal();
        openModal('modal-manifest');
    };

    const lockToggle = document.getElementById('lock-toggle');
    if (lockToggle) {
        lockToggle.onclick = toggleLockState;
    }
    els.btnDocs.onclick = async () => {
        await loadDocs();
        openModal('modal-docs');
    };
    els.btnTutorial.onclick = () => {
        startTutorialFlow();
    };

    els.saveNodeBtn.onclick = saveCurrentNode;
    els.newNodeBtn.onclick = createNewNode;
    els.addConditionalBtn.onclick = () => addConditionalUI();
    els.addIntentBtn.onclick = () => addIntentUI();

    // Link Node Button
    const linkBtn = document.getElementById('link-node-btn');
    if (linkBtn) {
        linkBtn.onclick = () => {
            const target = prompt("Enter ID of target node to link to:");
            if (target) {
                addIntentUI({
                    id: 'go_' + target,
                    action: 'transition',
                    target: target,
                    ai_intent_helper: 'User wants to go to ' + target,
                    intent_description: 'Go to ' + target
                });
            }
        };
    }

    els.toggleViewBtn.onclick = toggleViewMode;

    document.getElementById('file-import').onchange = importBundle;
}

function updateUI() {
    if (AppState.user) {
        els.btnLogin.textContent = `LOGOUT (${AppState.user.username})`;
    } else {
        els.btnLogin.textContent = 'LOGIN';
    }
    renderNodeList();
    const title = AppState.storyData.manifest.title || 'UNTITLED PROTOCOL';
    document.querySelector('.brand').textContent = title.toUpperCase().substring(0, 20);

    if (AppState.currentNodeId) renderMiniMap(AppState.currentNodeId);
}

// --- View Mode Toggle (Form vs Code) ---
function toggleViewMode() {
    if (AppState.viewMode === 'form') {
        // Switch to Code
        // 1. Gather data from form
        const currentData = gatherNodeDataFromForm();
        if (!currentData) return; // Validation fail

        // 2. Set Code View
        els.codeEditor.value = JSON.stringify(currentData, null, 4);
        els.formView.classList.add('hidden');
        els.codeView.classList.remove('hidden');
        els.toggleViewBtn.textContent = "View: JSON";
        AppState.viewMode = 'code';
    } else {
        // Switch to Form
        // 1. Parse JSON
        try {
            const json = JSON.parse(els.codeEditor.value);
            if (!json.id) throw new Error("Node ID is required");

            // 2. Populate Form
            populateForm(json);
            els.codeView.classList.add('hidden');
            els.formView.classList.remove('hidden');
            els.toggleViewBtn.textContent = "View: Form";
            AppState.viewMode = 'form';
        } catch (e) {
            alert("Invalid JSON: " + e.message);
        }
    }
}

function gatherNodeDataFromForm() {
    const id = els.nodeId.value.trim();
    if (!id) { alert("ID required"); return null; }

    return {
        id: id,
        text: els.nodeText.value,
        text_revisit: els.nodeRevisit.value || undefined,
        text_conditionals: gatherConditionals(),
        intents: gatherIntents()
    };
}

// --- Local Storage Management ---
function saveToLocal() {
    if (!AppState.storyData.id) return;
    localStorage.setItem(`editor_autosave_${AppState.storyData.id}`, JSON.stringify(AppState.storyData));
    localStorage.setItem('editor_last_story', AppState.storyData.id);
    AppState.unsavedChanges = true;
    updateUI();
    checkTutorialState();
}

function loadFromLocal() {
    const lastId = localStorage.getItem('editor_last_story');
    if (lastId) {
        const data = localStorage.getItem(`editor_autosave_${lastId}`);
        if (data) {
            AppState.storyData = JSON.parse(data);
            AppState.currentStory = lastId;
        }
    }
}

// --- Story Actions ---
function newStory(e, forceId = null) {
    if (!forceId && !confirm("Create new story? Unsaved changes will be lost.")) return;

    let id = forceId;
    if (!id) {
         id = prompt("Enter unique ID for new story (folder name):");
    }

    if (!id) return;

    AppState.storyData = {
        id: id,
        manifest: {
            id: id,
            title: 'New Story',
            description: '',
            authorName: AppState.user ? AppState.user.username : 'Anonymous',
            authorId: AppState.user ? AppState.user.username : '',
            startNode: 'intro',
            language: 'en',
            date: new Date().toISOString().split('T')[0]
        },
        nodes: []
    };
    AppState.currentStory = id;
    AppState.currentNodeId = null;
    saveToLocal();
    updateUI();
    els.editorArea.classList.add('hidden');
    els.emptyState.classList.remove('hidden');
    checkTutorialState();
}

async function loadFromServer(storyId) {
    closeModal('modal-load');
    if (AppState.storyData.id && !confirm(`Overwrite current local workspace with server version of ${storyId}?`)) return;
    els.statusMsg.textContent = "Fetching bundle...";
    try {
        const res = await fetch(`/api/bundle/${storyId}`);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to load bundle");
        }
        const bundle = await res.json();

        // CHECK FORKING
        const currentUser = AppState.user ? AppState.user.username : null;
        const authorId = bundle.manifest.authorId;

        let isFork = false;

        if (currentUser && authorId && currentUser !== authorId) {
            // FORKING DETECTED
            isFork = true;
            alert("You are loading a story created by another user.\nYou must provide a new Title and ID to save your version.");

            // Set Fork Metadata
            bundle.manifest.originalStoryId = bundle.id;
            bundle.manifest.originalStoryTitle = bundle.manifest.title;
            bundle.manifest.isFork = true;

            // Clear Identity
            bundle.id = '';
            bundle.manifest.id = '';
            bundle.manifest.title = `Fork of ${bundle.manifest.title}`;
            bundle.manifest.authorId = currentUser; // Claim ownership of fork
            bundle.manifest.locked = false; // Reset lock on fork
        }

        AppState.storyData = bundle;
        AppState.currentStory = bundle.id;
        AppState.currentNodeId = null;
        saveToLocal();
        updateUI();
        els.statusMsg.textContent = "Loaded!";

        if (isFork) {
            populateManifestModal();
            openModal('modal-manifest');
        }

        checkTutorialState();
    } catch (e) {
        alert(e.message);
    }
}

function exportBundle() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(AppState.storyData, null, 2));
    const link = document.createElement('a');
    link.href = dataStr;
    link.download = `${AppState.storyData.id}_bundle.json`;
    link.click();
}

function importBundle(event) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const json = JSON.parse(e.target.result);
            if (!json.manifest || !json.nodes) throw new Error("Invalid Bundle Format");
            if (!confirm(`Import story "${json.manifest.title}"?`)) return;
            AppState.storyData = json;
            AppState.currentStory = json.id;
            AppState.currentNodeId = null;
            saveToLocal();
            updateUI();
            checkTutorialState();
        } catch (ex) {
            alert("Error importing: " + ex.message);
        }
    };
    reader.readAsText(event.target.files[0]);
    event.target.value = '';
}

async function publishStory() {
    if (!AppState.user) {
        alert("You must be logged in to publish.");
        openModal('modal-login');
        return;
    }

    // Client-side Validation of Manifest
    const m = AppState.storyData.manifest;
    const missing = [];
    if (!m.id) missing.push('ID');
    if (!m.title) missing.push('Title');
    if (!m.description) missing.push('Description');
    if (!m.language) missing.push('Language');
    if (!m.date) missing.push('Date');

    if (missing.length > 0) {
        alert(`Cannot publish. Missing required story properties: ${missing.join(', ')}. Please fill them in.`);
        populateManifestModal();
        openModal('modal-manifest');
        return;
    }

    if (!confirm("Publish this version to the server? This makes it live.")) return;
    try {
        els.statusMsg.textContent = "Publishing...";
        const headers = {
            'Content-Type': 'application/json',
            'x-editor-token': AppState.user.token
        };
        if (AppState.csrfToken) headers['x-csrf-token'] = AppState.csrfToken;

        const res = await fetch('/api/publish', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(AppState.storyData)
        });
        const result = await res.json();
        if (res.ok) {
            alert("Published successfully!");
            els.statusMsg.textContent = "Published";
        } else {
            alert("Error: " + result.error);
            els.statusMsg.textContent = "Failed";
        }
    } catch (e) {
        alert("Network Error: " + e.message);
    }
}

// --- Editor Logic ---
function renderNodeList() {
    els.nodeList.innerHTML = '';
    if (!AppState.storyData.nodes) AppState.storyData.nodes = [];
    const nodes = [...AppState.storyData.nodes].sort((a, b) => {
        if (a.id === 'intro') return -1;
        if (b.id === 'intro') return 1;
        return a.id.localeCompare(b.id);
    });
    nodes.forEach(node => {
        const div = document.createElement('div');
        div.className = `node-item ${node.id === 'intro' ? 'intro-node' : ''}`;
        if (node.id === AppState.currentNodeId) div.classList.add('active');

        // Check orphan
        const isOrphan = node.id !== 'intro' && !hasIncomingConnections(node.id);

        div.innerHTML = `
            <span>${node.id}</span>
            ${isOrphan ? '<span class="status-indicator" title="Orphan Node (No incoming links)">⚠️</span>' : ''}
        `;
        div.onclick = () => loadNodeIntoEditor(node.id);
        els.nodeList.appendChild(div);
    });
}

function hasIncomingConnections(targetId) {
    return AppState.storyData.nodes.some(n => {
        if (!n.intents) return false;
        return n.intents.some(i => (i.action === 'transition' && i.target === targetId));
    });
}

function loadNodeIntoEditor(nodeId) {
    const node = AppState.storyData.nodes.find(n => n.id === nodeId);
    if (!node) return;

    AppState.currentNodeId = nodeId;
    els.emptyState.classList.add('hidden');
    els.editorArea.classList.remove('hidden');

    // Reset View to Form (or keep preference? Resetting is safer)
    AppState.viewMode = 'form';
    els.codeView.classList.add('hidden');
    els.formView.classList.remove('hidden');
    els.toggleViewBtn.textContent = "View: Form";

    populateForm(node);
    renderMiniMap(nodeId);
    renderNodeList(); // Update active state
}

function populateForm(node) {
    els.nodeId.value = node.id;
    els.nodeId.disabled = (node.id === 'intro');
    els.nodeText.value = node.text || '';
    els.nodeRevisit.value = node.text_revisit || '';
    renderConditionals(node.text_conditionals || []);
    renderIntents(node.intents || []);
}

function saveCurrentNode() {
    // If in code view, parse that first
    let newNodeData;
    if (AppState.viewMode === 'code') {
        try {
            newNodeData = JSON.parse(els.codeEditor.value);
            if (!newNodeData.id) throw new Error("ID missing");
        } catch (e) {
            return alert("Fix JSON before saving.");
        }
    } else {
        newNodeData = gatherNodeDataFromForm();
    }

    if (!newNodeData) return;

    const idx = AppState.storyData.nodes.findIndex(n => n.id === newNodeData.id);
    if (idx >= 0) {
        AppState.storyData.nodes[idx] = newNodeData;
    } else {
        AppState.storyData.nodes.push(newNodeData);
    }

    // If ID changed (renamed), we need to handle that?
    // Current UI makes ID editable only for new nodes or non-intro.
    // But if we change ID, we should update old one.
    // Simplified: Overwrite by ID. If user changed ID in form, it saves as NEW node technically if we don't track original.
    // But nodeId input is the key.

    saveToLocal();
    renderNodeList();
    renderMiniMap(newNodeData.id);
    els.statusMsg.textContent = "Saved";
    setTimeout(() => els.statusMsg.textContent = "", 2000);
}

function createNewNode() {
    if (!AppState.currentStory) return alert("Create a story first.");
    const hasIntro = AppState.storyData.nodes.find(n => n.id === 'intro');
    let newId = '';
    if (!hasIntro) {
        alert("First node must be 'intro'");
        newId = 'intro';
    } else {
        newId = prompt("Node ID:");
    }
    if (!newId) return;
    if (AppState.storyData.nodes.find(n => n.id === newId)) return alert("ID exists");

    const newNode = { id: newId, text: "", intents: [] };
    AppState.storyData.nodes.push(newNode);
    saveToLocal();
    renderNodeList();
    loadNodeIntoEditor(newId);
    checkTutorialState();
}

// --- MiniMap Logic ---
function renderMiniMap(centerNodeId) {
    const container = els.minimap;
    container.innerHTML = '';

    const node = AppState.storyData.nodes.find(n => n.id === centerNodeId);
    if (!node) return;

    // Find Neighbors
    // Outgoing
    const outgoing = (node.intents || [])
        .filter(i => i.action === 'transition' && i.target)
        .map(i => i.target);

    // Incoming
    const incoming = AppState.storyData.nodes
        .filter(n => n.intents && n.intents.some(i => i.action === 'transition' && i.target === centerNodeId))
        .map(n => n.id);

    // Simple SVG Visualization
    const width = container.clientWidth;
    const height = container.clientHeight;
    const cx = width / 2;
    const cy = height / 2;
    const r = 30;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");

    // Helper to draw line
    const drawLink = (x1, y1, x2, y2, color) => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1); line.setAttribute("y1", y1);
        line.setAttribute("x2", x2); line.setAttribute("y2", y2);
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "2");
        line.setAttribute("marker-end", "url(#arrow)");
        svg.appendChild(line);
    };

    // Define Arrow Marker
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `<marker id="arrow" markerWidth="10" markerHeight="10" refX="20" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#555" /></marker>`;
    svg.appendChild(defs);

    // Draw Center
    const drawNode = (id, x, y, type) => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", `mm-node ${type}`);
        g.onclick = () => loadNodeIntoEditor(id);

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", r);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", x);
        text.setAttribute("y", y + 4);
        text.setAttribute("class", "mm-text");
        text.textContent = id.substring(0, 6);

        g.appendChild(circle);
        g.appendChild(text);
        svg.appendChild(g);
    };

    // Outgoing (Right side)
    const uniqueOut = [...new Set(outgoing)];
    uniqueOut.forEach((id, i) => {
        const angle = (i / uniqueOut.length) * Math.PI - (Math.PI / 2); // Spread arc
        const ox = cx + 100;
        const oy = cy + (i - (uniqueOut.length-1)/2) * 70;
        drawLink(cx + r, cy, ox - r, oy, "#58a6ff");
        drawNode(id, ox, oy, 'outgoing');
    });

    // Incoming (Left side)
    const uniqueIn = [...new Set(incoming)];
    uniqueIn.forEach((id, i) => {
        const ix = cx - 100;
        const iy = cy + (i - (uniqueIn.length-1)/2) * 70;
        drawLink(ix + r, iy, cx - r, cy, "#555");
        drawNode(id, ix, iy, 'incoming');
    });

    // Draw Center Last (on top)
    drawNode(centerNodeId, cx, cy, 'current');

    container.appendChild(svg);
}

// --- Tutorial Logic ---
const Tutorial = {
    step: 0,
    active: false,
    steps: [
        {
            id: 'start',
            text: "WELCOME TO ECHO PROTOCOL EDITOR.\n\nTHIS GUIDE WILL WALK YOU THROUGH CREATING A COMPLEX NARRATIVE.\n\nSTEP 1: CREATE A FRESH PROJECT.\nCLICK THE [NEW] BUTTON IN THE TOP BAR AND NAME YOUR STORY 'tutorial_story'.\n\nCLICK [NEXT STEP] WHEN DONE.",
            validate: () => AppState.storyData.id !== null,
            highlight: 'nav-new'
        },
        {
            id: 'properties',
            text: "DEFINE YOUR STORY.\n\nSTEP 2: STORY PROPERTIES.\n1. CLICK [STORY PROPERTIES] IN TOP MENU.\n2. FILL IN THE TITLE AND DESCRIPTION.\n3. CLICK [SAVE SETTINGS].\n\nTHIS INFORMATION IS REQUIRED TO PUBLISH.",
            validate: () => {
                const m = AppState.storyData.manifest;
                return m.title && m.description && m.description.length > 5;
            },
            highlight: 'nav-manifest'
        },
        {
            id: 'intro_create',
            text: "EVERY STORY NEEDS AN ENTRY POINT.\n\nSTEP 3: CREATE THE 'intro' NODE.\nCLICK [NEW NODE] IN THE LEFT SIDEBAR.\nIF PROMPTED FOR ID, ENTER 'intro'.\n\nCLICK [NEXT STEP] AFTER CREATING IT.",
            validate: () => AppState.storyData.nodes.find(n => n.id === 'intro'),
            highlight: 'new-node-btn'
        },
        {
            id: 'intro_desc',
            text: "THE 'intro' NODE IS YOUR STARTING ROOM.\n\nSTEP 4: ADD A DESCRIPTION.\nENTER 'You are in a cold, dark room. A terminal blinks nearby.' INTO THE DESCRIPTION FIELD.\n\nCLICK [SAVE NODE].\nTHEN CLICK [NEXT STEP].",
            validate: () => {
                const n = AppState.storyData.nodes.find(n => n.id === 'intro');
                if (AppState.currentNodeId === 'intro') {
                     return els.nodeText.value.length > 10;
                }
                return n && n.text && n.text.length > 10;
            },
            highlight: 'node-text'
        },
        {
            id: 'intent_inspect',
            text: "PLAYERS INTERACT VIA INTENTS.\n\nSTEP 5: ADD AN INSPECT INTENT.\n1. CLICK [ADD INTENT].\n2. ID: 'inspect_term'\n3. ACTION: 'Text Response'\n4. AI INTENT HELPER: 'User wants to inspect terminal'\n5. LOOK AROUND TEXT: 'A terminal is mounted on the wall.'\n6. TARGET: 'It runs Echo OS v1.0.'\n\nCLICK [SAVE NODE] & [NEXT STEP].",
            validate: () => {
                if (AppState.currentNodeId === 'intro') {
                    const cards = document.querySelectorAll('.intent-card');
                    return cards.length > 0;
                }
                const n = AppState.storyData.nodes.find(n => n.id === 'intro');
                return n && n.intents && n.intents.length > 0;
            },
            highlight: 'add-intent-btn'
        },
        {
            id: 'second_node',
            text: "LET'S EXPAND THE WORLD.\n\nSTEP 6: CREATE A SECOND ROOM.\nCLICK [NEW NODE] AND NAME IT 'corridor'.\nADD TEXT: 'A long metal corridor.'\n\nCLICK [SAVE NODE] & [NEXT STEP].",
            validate: () => AppState.storyData.nodes.find(n => n.id === 'corridor'),
            highlight: 'new-node-btn'
        },
        {
            id: 'select_intro',
            text: "CONNECT THE ROOMS.\n\nSTEP 7: RETURN TO START.\nSELECT THE 'intro' NODE IN THE SIDEBAR LIST.",
            validate: () => AppState.currentNodeId === 'intro',
            highlight: 'node-list'
        },
        {
            id: 'link_nodes',
            text: "STEP 8: LINK TO CORRIDOR.\n1. CLICK [LINK NODE] BUTTON.\n2. ENTER 'corridor' AS TARGET.\n\nCLICK [SAVE NODE] & [NEXT STEP].",
            validate: () => {
                const intro = AppState.storyData.nodes.find(n => n.id === 'intro');
                return intro && intro.intents.some(i => i.action === 'transition' && i.target === 'corridor');
            },
            highlight: 'link-node-btn'
        },
        {
            id: 'state_setup_nav',
            text: "DYNAMIC STATE IS POWERFUL.\n\nSTEP 9: SWITCH LOCATION.\nGO TO THE 'corridor' NODE IN THE LIST.",
            validate: () => AppState.currentNodeId === 'corridor',
            highlight: 'node-list'
        },
        {
            id: 'state_setup',
            text: "STEP 10: SET A FLAG.\n1. CLICK [ADD INTENT].\n2. ID: 'pull_lever'\n3. SET STATE: 'power_on:true'.\n4. ACTION: 'Text Response' -> 'You hear a hum.'\n\nCLICK [SAVE NODE] & [NEXT STEP].",
            validate: () => {
                const node = AppState.storyData.nodes.find(n => n.id === 'corridor');
                return node && node.intents.some(i => i.set_state && i.set_state.power_on);
            },
            highlight: 'add-intent-btn'
        },
        {
            id: 'conditional_text_nav',
            text: "REACT TO STATE CHANGES.\n\nSTEP 11: RETURN TO START.\nGO BACK TO THE 'intro' NODE IN THE LIST.",
            validate: () => AppState.currentNodeId === 'intro',
            highlight: 'node-list'
        },
        {
            id: 'conditional_text',
            text: "STEP 12: CONDITIONAL DESCRIPTION.\n1. CLICK [ADD CONDITIONAL].\n2. IF STATE: 'power_on' : 'true'.\n3. TEXT: 'The room is now bright and humming.'\n\nCLICK [SAVE NODE] & [NEXT STEP].",
            validate: () => {
                const node = AppState.storyData.nodes.find(n => n.id === 'intro');
                return node && node.text_conditionals && node.text_conditionals.some(c => c.if_state && c.if_state.power_on);
            },
            highlight: 'add-conditional-btn'
        },
        {
            id: 'finish',
            text: "SYSTEM OPTIMAL. YOU HAVE MASTERED:\n- NODES & LINKS\n- INTENTS\n- STATE & CONDITIONALS\n\nYOU ARE READY TO PUBLISH.\nREGISTER/LOGIN FIRST, THEN CLICK PUBLISH.",
            validate: () => true,
            highlight: 'nav-publish'
        }
    ]
};

function initTutorial() {
    // Tutorial is not auto-started on init, waits for user
    renderTutorial();
}

function startTutorialFlow() {
    if (AppState.storyData.id && AppState.storyData.nodes.length > 0) {
        if (!confirm("Starting the tutorial requires a fresh workspace. Create new story?")) return;
        newStory(null, 'tutorial_story');
    }
    Tutorial.step = 0;
    Tutorial.active = true;
    document.getElementById('tutorial-container').style.display = 'flex';
    renderTutorial();
}

function advanceTutorial() {
    if (Tutorial.step >= Tutorial.steps.length) return;

    const currentTask = Tutorial.steps[Tutorial.step];

    // Validate
    let isValid = false;
    try {
        isValid = currentTask.validate();
    } catch(e) {
        console.error("Tutorial check failed", e);
    }

    if (isValid) {
        Tutorial.step++;
        // Clear highlights
        document.querySelectorAll('.highlight-tutorial').forEach(el => el.classList.remove('highlight-tutorial'));
        renderTutorial();
    } else {
        alert("Action not completed yet. Please follow the instructions.");
    }
}

// Keep this purely for backward compatibility if I miss removing a call,
// but it should do nothing now that we use advanceTutorial.
function checkTutorialState() {
   // no-op
}

function renderTutorial() {
    const container = els.tutorialContent;
    const actionContainer = els.tutorialAction;

    if (Tutorial.step >= Tutorial.steps.length) {
        container.innerHTML = `<div class="tutorial-text" style="color:var(--success)">TUTORIAL COMPLETE.</div>`;
        actionContainer.innerHTML = `<button class="btn-primary full-width" onclick="document.getElementById('tutorial-container').style.display='none'">CLOSE</button>`;
        return;
    }

    const task = Tutorial.steps[Tutorial.step];
    container.innerHTML = `<div class="tutorial-text">${task.text.replace(/\n/g, '<br>')}</div>`;

    // Highlight
    if (task.highlight) {
        const el = document.getElementById(task.highlight);
        if (el) el.classList.add('highlight-tutorial');
    }

    // Add Next Button
    actionContainer.innerHTML = `
        <button id="tutorial-next-btn" class="btn-primary full-width">NEXT STEP >></button>
    `;
    document.getElementById('tutorial-next-btn').onclick = advanceTutorial;
}

// --- Form Helpers ---
function renderConditionals(list) {
    els.conditionalsList.innerHTML = '';
    list.forEach(c => addConditionalUI(c));
}

function addConditionalUI(data = {}) {
    const div = document.createElement('div');
    div.className = 'item-row';
    const key = data.if_state ? Object.keys(data.if_state)[0] : '';
    const val = data.if_state ? data.if_state[key] : '';

    div.innerHTML = `
        <div class="form-group">
            <label>If State (Key: Value)</label>
            <div style="display:flex; gap:0.5rem">
                <input type="text" class="cond-key" value="${key || ''}" placeholder="Key">
                <input type="text" class="cond-val" value="${val || ''}" placeholder="Value">
            </div>
        </div>
        <div class="form-group">
            <label>Description Override</label>
            <textarea class="cond-text" rows="2">${data.text || ''}</textarea>
        </div>
        <button class="btn-danger btn-small remove-btn">Remove</button>
    `;
    div.querySelector('.remove-btn').onclick = () => div.remove();
    els.conditionalsList.appendChild(div);
}

function gatherConditionals() {
    const arr = [];
    els.conditionalsList.querySelectorAll('.item-row').forEach(row => {
        const k = row.querySelector('.cond-key').value.trim();
        const v = row.querySelector('.cond-val').value.trim();
        const t = row.querySelector('.cond-text').value;
        if (k && v && t) arr.push({ if_state: { [k]: v }, text: t });
    });
    return arr;
}

function renderIntents(list) {
    els.intentsList.innerHTML = '';
    list.forEach(i => addIntentUI(i));
}

function addIntentUI(intent = {}) {
    const div = document.createElement('div');
    div.className = 'intent-card';
    const id = intent.id || `intent_${Date.now()}`;
    let setStateStr = '';
    if (intent.set_state) {
        const k = Object.keys(intent.set_state)[0];
        if (k) setStateStr = `${k}:${intent.set_state[k]}`;
    }
    let targetVal = intent.response || intent.target || intent.item_id || '';

    div.innerHTML = `
        <div class="intent-header">
            <strong>${id}</strong>
            <button class="btn-danger btn-small remove-btn">Remove</button>
        </div>
        <div class="intent-grid">
            <div class="form-group">
                <label>ID</label>
                <input type="text" class="intent-id" value="${intent.id || ''}">
            </div>
            <div class="form-group">
                <label>Action</label>
                <select class="intent-action">
                    <option value="text" ${intent.action === 'text' ? 'selected' : ''}>Text Response</option>
                    <option value="transition" ${intent.action === 'transition' ? 'selected' : ''}>Transition</option>
                    <option value="pickup" ${intent.action === 'pickup' ? 'selected' : ''}>Pickup Item</option>
                    <option value="end_game" ${intent.action === 'end_game' ? 'selected' : ''}>End Game</option>
                </select>
            </div>
            <div class="form-group full-width">
                <label>AI Intent Helper</label>
                <input type="text" class="intent-desc" value="${intent.ai_intent_helper || intent.description || ''}">
            </div>
            <div class="form-group full-width">
                <label>Look Around Text</label>
                <input type="text" class="intent-text-desc" value="${intent.text_description || ''}">
            </div>
            <div class="form-group full-width">
                <label>Target / Response</label>
                <textarea class="intent-target" rows="2">${targetVal}</textarea>
            </div>
             <div class="form-group">
                <label>Requires (ID)</label>
                <input type="text" class="intent-req" value="${(intent.requires || []).join(',')}">
            </div>
             <div class="form-group">
                <label>Set State (Key:Value)</label>
                <input type="text" class="intent-set-state" value="${setStateStr}">
            </div>
        </div>
    `;
    div.querySelector('.remove-btn').onclick = () => div.remove();
    els.intentsList.appendChild(div);
}

function gatherIntents() {
    const arr = [];
    els.intentsList.querySelectorAll('.intent-card').forEach(card => {
        const id = card.querySelector('.intent-id').value.trim();
        if (!id) return;

        const action = card.querySelector('.intent-action').value;
        const targetVal = card.querySelector('.intent-target').value;

        const intent = {
            id,
            action,
            ai_intent_helper: card.querySelector('.intent-desc').value,
            text_description: card.querySelector('.intent-text-desc').value || undefined
        };

        if (action === 'transition') intent.target = targetVal;
        else if (action === 'pickup') intent.item_id = targetVal;
        else intent.response = targetVal;

        const req = card.querySelector('.intent-req').value.trim();
        if (req) intent.requires = req.split(',').map(s => s.trim());

        const ss = card.querySelector('.intent-set-state').value.trim();
        if (ss) {
            const [k, v] = ss.split(':');
            if (k && v) {
                intent.set_state = { [k.trim()]: v.trim() === 'true' ? true : (v.trim() === 'false' ? false : v.trim()) };
            }
        }
        arr.push(intent);
    });
    return arr;
}

// Auth & Modals (unchanged logic, just reused)
async function performLogin(isRegister) {
    const u = document.getElementById('login-user').value;
    const p = document.getElementById('login-pass').value;
    const url = isRegister ? '/api/auth/register' : '/api/auth/login';
    try {
        const headers = {'Content-Type': 'application/json'};
        if (AppState.csrfToken) headers['x-csrf-token'] = AppState.csrfToken;
        const anonToken = sessionStorage.getItem('editor_anon_token');
        if (anonToken && isRegister) headers['x-anon-token'] = anonToken;

        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ username: u, password: p }) });
        const data = await res.json();
        if (res.ok) {
            if (data.csrfToken) AppState.csrfToken = data.csrfToken;
            AppState.user = { username: data.username, token: data.token };
            localStorage.setItem('editor_user', JSON.stringify(AppState.user));
            closeModal('modal-login');
            updateUI();
            alert(isRegister ? "Registered!" : "Logged in!");
        } else {
            alert(data.error);
        }
    } catch (e) { alert("Error: " + e.message); }
}

// Modal helpers
function openModal(id) { document.getElementById(id).classList.remove('hidden'); if(id === 'modal-load') fetchStoryList(); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// Global
window.performLogin = performLogin;
window.saveManifest = saveManifest;
window.closeModal = closeModal;
window.toggleLockState = toggleLockState;

function toggleTutorial() {
    const container = document.getElementById("tutorial-container");
    if (container.style.display === "none") {
        container.style.display = "flex";
    } else {
        container.style.display = "none";
    }
}
window.toggleTutorial = toggleTutorial;

function toggleLockState() {
    const chk = document.getElementById('m-locked');
    chk.checked = !chk.checked;
    renderLockState();
}

function renderLockState() {
    const chk = document.getElementById('m-locked');
    const display = document.getElementById('lock-toggle');
    if (chk.checked) {
        display.innerHTML = '🔒 <span style="font-size: 0.8rem; color: var(--danger);">LOCKED</span>';
    } else {
        display.innerHTML = '🔓 <span style="font-size: 0.8rem; color: var(--success);">OPEN</span>';
    }
}

function saveManifest() {
    AppState.storyData.manifest.id = document.getElementById('m-id').value;
    AppState.storyData.manifest.title = document.getElementById('m-title').value;
    AppState.storyData.manifest.description = document.getElementById('m-desc').value;
    AppState.storyData.manifest.authorId = document.getElementById('m-auth').value;
    AppState.storyData.manifest.language = document.getElementById('m-lang').value;
    // Date is auto
    AppState.storyData.manifest.locked = document.getElementById('m-locked').checked;

    AppState.storyData.id = AppState.storyData.manifest.id;
    saveToLocal();
    closeModal('modal-manifest');
    updateUI();
}

async function populateManifestModal() {
    document.getElementById('m-id').value = AppState.storyData.manifest.id || '';
    document.getElementById('m-title').value = AppState.storyData.manifest.title || '';
    document.getElementById('m-desc').value = AppState.storyData.manifest.description || '';
    document.getElementById('m-auth').value = AppState.storyData.manifest.authorId || (AppState.user ? AppState.user.username : '');
    document.getElementById('m-lang').value = AppState.storyData.manifest.language || 'en';
    document.getElementById('m-date').value = new Date().toISOString().split('T')[0]; // Display only

    // Lock State
    document.getElementById('m-locked').checked = !!AppState.storyData.manifest.locked;
    renderLockState();

    // Fork Info
    const forkGroup = document.getElementById('fork-info-group');
    const forkDisplay = document.getElementById('fork-source-display');
    if (AppState.storyData.manifest.isFork) {
        forkGroup.classList.remove('hidden');
        forkDisplay.textContent = `'${AppState.storyData.manifest.originalStoryTitle}' (ID: ${AppState.storyData.manifest.originalStoryId})`;
    } else {
        forkGroup.classList.add('hidden');
    }
}

async function loadDocs() {
    const res = await fetch('/api/docs');
    const text = await res.text();
    document.getElementById('docs-content').innerText = text;
}

async function fetchStoryList() {
    const list = document.getElementById('load-list');
    list.innerHTML = 'Loading...';
    const res = await fetch('/api/stories');
    const stories = await res.json();
    list.innerHTML = '';

    // Get Current User
    const currentUser = AppState.user ? AppState.user.username : null;

    stories.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'btn-secondary full-width';
        btn.style.marginBottom = '0.5rem';
        btn.style.display = 'flex';
        btn.style.justifyContent = 'space-between';
        btn.style.alignItems = 'center';

        const title = s.title ? `${s.title} [${s.id}]` : (s.id || s);
        const id = s.id || s;

        // Locking Logic
        const isLocked = s.locked;
        const isOwner = (currentUser && s.authorId === currentUser);
        const canLoad = !isLocked || isOwner;

        let lockIcon = '';
        if (isLocked) {
             lockIcon = isOwner ? '🔒 (Yours)' : '🔒 (Locked)';
        }

        btn.innerHTML = `<span>${title}</span> <span>${lockIcon}</span>`;

        if (!canLoad) {
            btn.disabled = true;
            btn.style.opacity = 0.5;
            btn.style.cursor = 'not-allowed';
            btn.title = "This story is locked by the author.";
        } else {
            btn.onclick = () => loadFromServer(id);
        }

        list.appendChild(btn);
    });
}

init();
