document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('commandInput');
    const output = document.getElementById('output');
    const statusBar = document.getElementById('statusBar');

    // URL params for story ID
    const urlParams = new URLSearchParams(window.location.search);
    const currentStoryId = urlParams.get('storyId') || 'protocol_01';
    const sessionKey = `session_${currentStoryId}`;

    // History Key
    let sessionId = localStorage.getItem(sessionKey);
    const getHistoryKey = (id) => `history_${id}`;

    // Security Token
    let csrfToken = null;

    let isTyping = false;

    // Audio System
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    function playTone(freq, type, duration) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    function playClick() {
        playTone(1200, 'sine', 0.05);
    }

    function playTypeSound() {
        // Slight variation to sound organic
        const freq = 250 + Math.random() * 60;
    playTone(freq, 'square', 0.03);
    }

    function playPunctSound() {
    // Sharper, slightly higher "tick" for punctuation
    const freq = 420 + Math.random() * 120;
    playTone(freq, 'triangle', 0.02);
}
    // Correction State
    let currentChallengeBtn = null;
    let challengeTimeout = null;
    let lastUserText = "";

    // Focus input always, unless disabled
    document.addEventListener('click', (e) => {
        // Don't autofocus if clicking modal or button
        if (e.target.closest('.modal') || e.target.closest('.challenge-btn')) return;

        if (!input.disabled && e.target.tagName !== 'BUTTON') {
            input.focus();
        }
    });

    // Typewriter Effect
   function typeText(element, text, speed = 10) {
    return new Promise((resolve) => {
        // If speed is 0 (fast forward), render instantly
        if (speed === 0) {
            element.innerText = text;
            resolve();
            return;
        }

        isTyping = true;
        let i = 0;

        function type() {
            if (i >= text.length) {
                isTyping = false;
                resolve();
                return;
            }

            const char = text.charAt(i);
            element.innerText += char;

            // Classes of chars
            const isWhitespace = char.trim() === "";
            const isPunct = /[.,!?;:()[\]{}"'`-]/.test(char);

            // Sound logic
            if (!isWhitespace) {
                if (isPunct) playPunctSound();
                else playTypeSound();
            }

            output.scrollTop = output.scrollHeight;
            i++;

            // Timing logic
            // Add extra pause on whitespace so the "silence" is perceptible
            const nextDelay = isWhitespace ? speed * 2.2 : speed;

            setTimeout(type, nextDelay);
        }

        type();
    });
}


    // Append text to output
    async function appendToLog(text, type = 'system', elapsedMs = null, isOptimized = false, isAiGenerated = false, isHistoryReplay = false) {
        // Save to history (if not replaying)
        if (!isHistoryReplay && sessionId) {
            saveHistory({
                text,
                type,
                elapsedMs,
                optimized: isOptimized,
                isAiGenerated
            });
        }

        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        output.appendChild(entry);

        // Speed: 0 for replay, 10 (default) for live
        const speed = isHistoryReplay ? 0 : 10;

        if (type === 'user') {
            entry.innerText = text;
        } else {
            await typeText(entry, text, speed);
            if (elapsedMs !== null) {
                const tag = document.createElement('span');
                tag.className = 'transmission-tag';
                tag.innerText = `[TRANSMITTED ${elapsedMs}MS${isOptimized ? ' / OPTIMIZED' : ''}]`;
                entry.appendChild(tag);

                // Add Challenge Button only if AI generated AND NOT REPLAY
                // (Challenge buttons expire, so old ones are useless)
                if (isAiGenerated && !isHistoryReplay) {
                    addChallengeButton(entry);
                }
            }
        }

        output.scrollTop = output.scrollHeight;
    }

    // History Persistence Logic
    function saveHistory(entry) {
        if (!sessionId) return;
        try {
            const key = getHistoryKey(sessionId);
            const history = JSON.parse(localStorage.getItem(key) || '[]');
            history.push(entry);
            localStorage.setItem(key, JSON.stringify(history));
        } catch (e) {
            console.error("Failed to save history:", e);
        }
    }

    async function loadHistory() {
        if (!sessionId) return;
        const key = getHistoryKey(sessionId);
        const history = JSON.parse(localStorage.getItem(key) || '[]');

        if (history.length > 0) {
             // Render history in fast-forward
             for (const entry of history) {
                 await appendToLog(
                     entry.text,
                     entry.type,
                     entry.elapsedMs,
                     entry.optimized,
                     entry.isAiGenerated,
                     true // isHistoryReplay
                 );
             }
             // Add a spacer to indicate end of history
             const spacer = document.createElement('div');
             spacer.className = 'log-entry system';
             spacer.innerHTML = '<span style="color:#444">--- SESSION RESTORED ---</span>';
             spacer.style.margin = '20px 0';
             spacer.style.textAlign = 'center';
             output.appendChild(spacer);
             output.scrollTop = output.scrollHeight;

             // Check if session was finished
             if (localStorage.getItem(`session_ended_${sessionId}`) === 'true') {
                 // Disable input
                 input.disabled = true;
                 input.style.display = 'none';
                 document.querySelector('.prompt').style.display = 'none';

                 // Show restart button
                 // We don't have author name easily here without saving it, but generic restart is fine or we can save author too
                 // For now, generic restart is safer than passing undefined.
                 showRestartButton();
             }
        }
    }

    function addChallengeButton(entryElement) {
        // Clear previous button/timer if any
        clearChallenge();

        const btn = document.createElement('span');
        btn.className = 'challenge-btn';
        btn.innerText = '[ ! ]';
        btn.title = 'Challenge Interpretation';

        btn.addEventListener('click', () => {
             showCorrectionModal();
        });

        entryElement.appendChild(btn);
        currentChallengeBtn = btn;

        // Auto-remove after 60 seconds
        challengeTimeout = setTimeout(() => {
            if (currentChallengeBtn === btn) {
                btn.remove();
                currentChallengeBtn = null;
            }
        }, 60000);
    }

    function clearChallenge() {
        if (challengeTimeout) clearTimeout(challengeTimeout);
        if (currentChallengeBtn) {
            currentChallengeBtn.remove();
            currentChallengeBtn = null;
        }
    }

    async function showCorrectionModal() {
        // Fetch intents
        try {
            const res = await fetch(`/api/intents?sessionId=${sessionId}`);
            const intents = await res.json();

            // Create Modal
            const modal = document.createElement('div');
            modal.className = 'modal';

            const content = document.createElement('div');
            content.className = 'modal-content';

            const header = document.createElement('div');
            header.className = 'modal-header';
            header.innerText = 'SELECT INTENDED ACTION';
            content.appendChild(header);

            intents.forEach(intent => {
                const opt = document.createElement('div');
                opt.className = 'intent-option';
                opt.innerText = `> ${intent.intent_description.toUpperCase()}`;
                opt.onclick = () => submitCorrection(intent.id, modal);
                content.appendChild(opt);
            });

            const close = document.createElement('div');
            close.className = 'modal-close';
            close.innerText = '[ CANCEL ]';
            close.onclick = () => modal.remove();
            content.appendChild(close);

            modal.appendChild(content);
            document.body.appendChild(modal);

        } catch (e) {
            console.error("Failed to fetch intents", e);
        }
    }

    async function submitCorrection(intentId, modal) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (csrfToken) headers['x-csrf-token'] = csrfToken;

            const res = await fetch('/api/correct-intent', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    sessionId,
                    input: lastUserText,
                    correctIntentId: intentId
                })
            });
            const data = await res.json();

            if (data.success) {
                modal.remove();
                clearChallenge(); // Remove button after successful correction

                // Show feedback
                const feedback = document.createElement('div');
                feedback.className = 'log-entry system';
                feedback.innerText = `SYSTEM RECALIBRATED. INPUT MAPPED TO: ${intentId.toUpperCase()}`;
                feedback.style.color = '#ffcc00';
                output.appendChild(feedback);
                output.scrollTop = output.scrollHeight;

                // Display the new result
                if (data.gameResponse && data.gameResponse.text) {
                    await appendToLog(
                        data.gameResponse.text,
                        data.gameResponse.type,
                        null, // No timing stats needed for local correction
                        data.gameResponse.optimized,
                        data.gameResponse.isAiGenerated
                    );
                }
            } else {
                alert(data.error || "Correction Failed");
            }
        } catch (e) {
            console.error("Correction error", e);
        }
    }

    function updateStatus(text) {
        statusBar.innerText = text;
    }

    // Create Restart Button
    function showRestartButton(authorName) {
        if (authorName) {
            const authorDiv = document.createElement('div');
            authorDiv.className = 'log-entry system';
            authorDiv.style.marginTop = '20px';
            authorDiv.style.textAlign = 'center';
            authorDiv.style.color = '#aaa';
            authorDiv.innerText = `STORY BY: ${authorName.toUpperCase()}`;
            output.appendChild(authorDiv);
        }

        const btn = document.createElement('div');
        btn.className = 'restart-btn';
        btn.innerText = '[ > REINITIALIZE SYSTEM < ]';
        btn.style.cursor = 'pointer';
        btn.style.color = '#ff3333'; // Reddish for alert
        btn.style.marginTop = '20px';
        btn.style.textAlign = 'center';
        btn.style.fontFamily = "'Share Tech Mono', monospace";
        btn.style.fontSize = '1.2rem';
        btn.style.textShadow = '0 0 5px #ff3333';

        btn.addEventListener('click', () => {
            // Clear both session, history, and ended flag
            if (sessionId) {
                localStorage.removeItem(getHistoryKey(sessionId));
                localStorage.removeItem(`session_ended_${sessionId}`);
                localStorage.removeItem(sessionKey);
            }
            window.location.reload();
        });

        output.appendChild(btn); // Append to log area so it's at the bottom
        output.scrollTop = output.scrollHeight;

        // Add a 'Return to Menu' button as well
        const menuBtn = document.createElement('div');
        menuBtn.className = 'restart-btn';
        menuBtn.innerText = '[ < RETURN TO ARCHIVES ]';
        menuBtn.style.cursor = 'pointer';
        menuBtn.style.color = '#0f0';
        menuBtn.style.marginTop = '10px';
        menuBtn.style.textAlign = 'center';
        menuBtn.style.fontFamily = "'Share Tech Mono', monospace";
        menuBtn.style.fontSize = '1.2rem';

        menuBtn.addEventListener('click', () => {
            window.location.href = '/play';
        });
        output.appendChild(menuBtn);
        output.scrollTop = output.scrollHeight;
    }

    // Handle Session Expiration
    function handleSessionExpired() {
        localStorage.removeItem(sessionKey);
        if (sessionId) {
            localStorage.removeItem(getHistoryKey(sessionId));
            localStorage.removeItem(`session_ended_${sessionId}`);
        }
        alert("SESSION SIGNAL LOST. RE-ESTABLISHING UPLINK...");
        window.location.reload();
    }

    // Fetch Security Token
    async function fetchCsrfToken() {
        if (!sessionId) return;
        try {
            const res = await fetch(`/api/csrf-token?sessionId=${sessionId}`);
            const data = await res.json();
            if (data.csrfToken) {
                csrfToken = data.csrfToken;
            }
        } catch (e) {
            console.error("Failed to fetch security token", e);
        }
    }

    // Initialize Session
    async function initSession() {
        if (!sessionId) {
            // New Session
            try {
                const res = await fetch('/api/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ storyId: currentStoryId })
                });
                const data = await res.json();

                if (data.error) throw new Error(data.error);

                sessionId = data.sessionId;
                localStorage.setItem(sessionKey, sessionId);

                // Fetch Token immediately after start
                await fetchCsrfToken();

                await appendToLog(data.text, data.type || 'story', null, false, data.isAiGenerated);
            } catch (e) {
                await appendToLog("CONNECTION ERROR: " + e.message, 'error');
            }
        } else {
            // Resume Session - Restore History First
            await fetchCsrfToken(); // Fetch token for resumed session
            await loadHistory();
        }
    }

    // PWA Install Logic
    let deferredPrompt;
    const installBtn = document.getElementById('installBtn');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installBtn.style.display = 'block';
    });

    installBtn.addEventListener('click', (e) => {
        installBtn.style.display = 'none';
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                appendToLog('INSTALLATION ACCEPTED.', 'system');
            } else {
                appendToLog('INSTALLATION DECLINED.', 'system');
            }
            deferredPrompt = null;
        });
    });

    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            if (isTyping) return; // Prevent input while typing

            playClick(); // Sound on enter

            const text = input.value.trim();
            if (!text) return;

            // Clear any existing challenge button immediately when new input starts
            clearChallenge();

            lastUserText = text; // Save for potential correction

            // We log user input BEFORE send (will be saved to history)
            await appendToLog(`> ${text}`, 'user');
            input.value = '';
            input.disabled = true;

            // Status Bar Timer
            let startTime = Date.now();
            const timer = setInterval(() => {
                const elapsed = Date.now() - startTime;
                updateStatus(`TRANSMITTING... [${elapsed}ms]`);
            }, 50);

            try {
                const res = await fetch('/api/interact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, input: text })
                });
                const data = await res.json();

                // Check for session expiry
                if (data.error === 'SESSION_EXPIRED') {
                    handleSessionExpired();
                    return; // Stop processing
                }

                const elapsed = Date.now() - startTime;

                if (data.text) {
                    await appendToLog(data.text, data.type, elapsed, data.optimized, data.isAiGenerated);
                }

                if (data.type === 'end') {
                    // Mark session as ended in local storage to persist disabled state
                    localStorage.setItem(`session_ended_${sessionId}`, 'true');

                    // Open new tab as requested
                    window.open('https://ramazan-yavuz.tr', '_blank');

                    // Disable input permanently for this session
                    input.disabled = true;
                    input.style.display = 'none';
                    document.querySelector('.prompt').style.display = 'none';

                    showRestartButton(data.authorName);
                }

            } catch (err) {
                await appendToLog("TRANSMISSION ERROR.", 'error');
            } finally {
                clearInterval(timer);
                updateStatus('');

                // Only re-enable if not ended
                if (sessionId) {
                    // Check if game ended in UI logic
                    const isEnded = output.lastElementChild && output.lastElementChild.classList.contains('restart-btn');
                    if (!isEnded) {
                         input.disabled = false;
                         input.focus();
                    }
                }
            }
        }
    });

    initSession();
});
