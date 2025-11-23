/**
 * ECHO PROTOCOL MAP EDITOR - CLIENT (LOCAL FIRST ARCHITECTURE)
 */

// --- Global State ---
const AppState = {
    currentStory: null,
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
    unsavedChanges: false
};

// --- DOM Elements ---
const els = {
    storySelector: document.getElementById('story-selector'),
    nodeList: document.getElementById('node-list'),
    editorArea: document.getElementById('editor-area'),
    emptyState: document.getElementById('empty-state'),
    statusMsg: document.getElementById('status-msg'),

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

    // Navbar Actions (To be bound)
    btnLogin: document.getElementById('nav-login'),
    btnNew: document.getElementById('nav-new'),
    btnLoad: document.getElementById('nav-load'),
    btnExport: document.getElementById('nav-export'),
    btnImport: document.getElementById('nav-import'),
    btnPublish: document.getElementById('nav-publish'),
    btnDocs: document.getElementById('nav-docs'),
    btnManifest: document.getElementById('nav-manifest'),

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
    loadFromLocal();
    bindEvents();
    updateUI();
    populateLanguageDropdown();
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
    // Nav Actions
    els.btnNew.onclick = newStory;
    els.btnLoad.onclick = () => openModal('modal-load'); // Wait, we need to fetch list first
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
    els.btnDocs.onclick = async () => {
        await loadDocs();
        openModal('modal-docs');
    };

    // Editor Actions
    els.saveNodeBtn.onclick = saveCurrentNode;
    els.newNodeBtn.onclick = createNewNode;
    els.addConditionalBtn.onclick = () => addConditionalUI();
    els.addIntentBtn.onclick = () => addIntentUI();

    // Inputs
    document.getElementById('file-import').onchange = importBundle;
}

function updateUI() {
    // Navbar User State
    if (AppState.user) {
        els.btnLogin.textContent = `LOGOUT (${AppState.user.username})`;
    } else {
        els.btnLogin.textContent = 'LOGIN';
    }

    // Sidebar List
    renderNodeList();

    // Story Info
    const title = AppState.storyData.manifest.title || 'UNTITLED PROTOCOL';
    document.querySelector('.brand').textContent = title.toUpperCase().substring(0, 20);
}

// --- Local Storage Management ---

function saveToLocal() {
    if (!AppState.storyData.id) return;
    localStorage.setItem(`editor_autosave_${AppState.storyData.id}`, JSON.stringify(AppState.storyData));
    localStorage.setItem('editor_last_story', AppState.storyData.id);
    AppState.unsavedChanges = true;
    updateUI();
}

function loadFromLocal() {
    const lastId = localStorage.getItem('editor_last_story');
    if (lastId) {
        const data = localStorage.getItem(`editor_autosave_${lastId}`);
        if (data) {
            AppState.storyData = JSON.parse(data);
            AppState.currentStory = lastId;
            console.log("Restored local session:", lastId);
        }
    }
}

// --- Story Actions ---

function newStory() {
    if (!confirm("Create new story? Unsaved changes to current story will be kept in local storage, but verify you have exported if needed.")) return;

    const id = prompt("Enter unique ID for new story (folder name):");
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
    saveToLocal();
    updateUI();
    els.editorArea.classList.add('hidden');
    els.emptyState.classList.remove('hidden');
}

async function loadFromServer(storyId) {
    closeModal('modal-load');
    if (AppState.storyData.id && !confirm(`Overwrite current local workspace with server version of ${storyId}?`)) return;

    els.statusMsg.textContent = "Fetching bundle...";
    try {
        const res = await fetch(`/api/bundle/${storyId}`);
        if (!res.ok) throw new Error("Failed to load bundle");
        const bundle = await res.json();

        AppState.storyData = bundle;
        AppState.currentStory = bundle.id;
        saveToLocal();
        updateUI();
        els.statusMsg.textContent = "Loaded!";
    } catch (e) {
        alert(e.message);
    }
}

// --- Export / Import ---

function exportBundle() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(AppState.storyData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${AppState.storyData.id}_bundle.json`);
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importBundle(event) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const json = JSON.parse(e.target.result);
            if (!json.manifest || !json.nodes) throw new Error("Invalid Bundle Format");

            if (!confirm(`Import story "${json.manifest.title}"? This will overwrite current workspace.`)) return;

            AppState.storyData = json;
            AppState.currentStory = json.id;
            saveToLocal();
            updateUI();
        } catch (ex) {
            alert("Error importing: " + ex.message);
        }
    };
    reader.readAsText(event.target.files[0]);
    event.target.value = ''; // Reset
}

// --- Publish ---

async function publishStory() {
    if (!AppState.user) {
        alert("You must be logged in to publish.");
        openModal('modal-login');
        return;
    }

    if (!confirm("Publish this version to the server? This makes it live.")) return;

    try {
        els.statusMsg.textContent = "Publishing...";
        const res = await fetch('/api/publish', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-editor-token': AppState.user.token
            },
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

    // Sort
    const nodes = [...AppState.storyData.nodes].sort((a, b) => {
        if (a.id === 'intro') return -1;
        if (b.id === 'intro') return 1;
        return a.id.localeCompare(b.id);
    });

    nodes.forEach(node => {
        const div = document.createElement('div');
        div.className = `node-item ${node.id === 'intro' ? 'intro-node' : ''}`;
        div.textContent = node.id;
        div.onclick = () => loadNodeIntoEditor(node.id);
        els.nodeList.appendChild(div);
    });
}

function loadNodeIntoEditor(nodeId) {
    const node = AppState.storyData.nodes.find(n => n.id === nodeId);
    if (!node) return;

    els.emptyState.classList.add('hidden');
    els.editorArea.classList.remove('hidden');

    // Populate Fields
    els.nodeId.value = node.id;
    els.nodeId.disabled = (node.id === 'intro');
    els.nodeText.value = node.text || '';
    els.nodeRevisit.value = node.text_revisit || '';

    renderConditionals(node.text_conditionals || []);
    renderIntents(node.intents || []);
}

function saveCurrentNode() {
    const id = els.nodeId.value.trim();
    if (!id) return alert("ID required");

    const newNode = {
        id: id,
        text: els.nodeText.value,
        text_revisit: els.nodeRevisit.value || undefined,
        text_conditionals: gatherConditionals(),
        intents: gatherIntents()
    };

    // Update Store
    const idx = AppState.storyData.nodes.findIndex(n => n.id === id);
    if (idx >= 0) {
        AppState.storyData.nodes[idx] = newNode;
    } else {
        AppState.storyData.nodes.push(newNode);
    }

    saveToLocal();
    renderNodeList();
    els.statusMsg.textContent = "Locally Saved";
    setTimeout(() => els.statusMsg.textContent = "", 2000);
}

function createNewNode() {
    if (!AppState.currentStory) return alert("Create a story first.");

    // Enforce Intro
    const hasIntro = AppState.storyData.nodes.find(n => n.id === 'intro');
    let newId = '';
    if (!hasIntro) {
        alert("First node must be 'intro'");
        newId = 'intro';
    } else {
        newId = prompt("Node ID:");
    }
    if (!newId) return;

    // Check duplicate
    if (AppState.storyData.nodes.find(n => n.id === newId)) return alert("ID exists");

    const newNode = { id: newId, text: "", intents: [] };
    AppState.storyData.nodes.push(newNode);
    saveToLocal();
    renderNodeList();
    loadNodeIntoEditor(newId);
}

// --- Conditionals & Intents Helpers (Similar to before) ---

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

    // Helper to serialize set_state
    let setStateStr = '';
    if (intent.set_state) {
        const k = Object.keys(intent.set_state)[0];
        if (k) setStateStr = `${k}:${intent.set_state[k]}`;
    }

    // Determine target value based on action
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
                <label>AI Hint</label>
                <input type="text" class="intent-desc" value="${intent.description || ''}">
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
            description: card.querySelector('.intent-desc').value,
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


// --- Auth & Modals ---

function logout() {
    localStorage.removeItem('editor_user');
    AppState.user = null;
    updateUI();
}

async function performLogin(isRegister) {
    const u = document.getElementById('login-user').value;
    const p = document.getElementById('login-pass').value;
    const url = isRegister ? '/api/auth/register' : '/api/auth/login';

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();

        if (res.ok) {
            AppState.user = { username: data.username, token: data.token };
            localStorage.setItem('editor_user', JSON.stringify(AppState.user));
            closeModal('modal-login');
            updateUI();
            alert(isRegister ? "Registered & Logged in!" : "Logged in!");
        } else {
            alert(data.error);
        }
    } catch (e) {
        alert("Error: " + e.message);
    }
}

async function populateManifestModal() {
    document.getElementById('m-id').value = AppState.storyData.manifest.id || '';
    document.getElementById('m-title').value = AppState.storyData.manifest.title || '';
    document.getElementById('m-desc').value = AppState.storyData.manifest.description || '';
    document.getElementById('m-auth').value = AppState.storyData.manifest.authorId || (AppState.user ? AppState.user.username : '');
    document.getElementById('m-lang').value = AppState.storyData.manifest.language || 'en';
    document.getElementById('m-date').value = AppState.storyData.manifest.date || new Date().toISOString().split('T')[0];
}

function saveManifest() {
    AppState.storyData.manifest.id = document.getElementById('m-id').value; // Changing ID might break sync?
    AppState.storyData.manifest.title = document.getElementById('m-title').value;
    AppState.storyData.manifest.description = document.getElementById('m-desc').value;
    // Author ID is mostly controlled by login on publish, but we let them set it here for "Draft"
    AppState.storyData.manifest.authorId = document.getElementById('m-auth').value;
    AppState.storyData.manifest.language = document.getElementById('m-lang').value;
    AppState.storyData.manifest.date = document.getElementById('m-date').value;

    // Also update top-level ID if changed
    AppState.storyData.id = AppState.storyData.manifest.id;

    saveToLocal();
    closeModal('modal-manifest');
    updateUI();
}

async function loadDocs() {
    const res = await fetch('/api/docs');
    const text = await res.text();
    document.getElementById('docs-content').innerText = text;
}

// --- Modal Helpers ---
function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    if (id === 'modal-load') fetchStoryList();
}
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

async function fetchStoryList() {
    const list = document.getElementById('load-list');
    list.innerHTML = 'Loading...';
    const res = await fetch('/api/stories');
    const stories = await res.json();
    list.innerHTML = '';
    stories.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'btn-secondary full-width';
        btn.style.marginBottom = '0.5rem';
        btn.textContent = s;
        btn.onclick = () => loadFromServer(s);
        list.appendChild(btn);
    });
}

// Global Scope Assignments for HTML onclicks (if any remain)
window.performLogin = performLogin;
window.saveManifest = saveManifest;
window.closeModal = closeModal;

// Start
init();
