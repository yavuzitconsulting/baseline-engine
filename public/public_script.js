const audioCtx = new (window.AudioContext || window.webkitAudioContext)()

function playHover() {
  if (audioCtx.state === "suspended") audioCtx.resume()
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = "square"
  osc.frequency.setValueAtTime(200, audioCtx.currentTime)
  gain.gain.setValueAtTime(0.05, audioCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05)
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start()
  osc.stop(audioCtx.currentTime + 0.05)
}

function playClick() {
  if (audioCtx.state === "suspended") audioCtx.resume()
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = "square"
  osc.frequency.setValueAtTime(400, audioCtx.currentTime)
  gain.gain.setValueAtTime(0.08, audioCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08)
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start()
  osc.stop(audioCtx.currentTime + 0.08)
}

// Add sound effects to buttons
document.querySelectorAll(".cmd-button, .inline-link, .feature-card, .contact-card").forEach((el) => {
  el.addEventListener("mouseenter", playHover)
})

document.querySelectorAll(".cmd-button").forEach((btn) => {
  btn.addEventListener("click", playClick)
})

// --- VISITOR TRACKING & STATS ---

// Generate simplified UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function initVisitorTracking() {
    let visitorId = localStorage.getItem('baseline_visitor_id');
    if (!visitorId) {
        visitorId = generateUUID();
        localStorage.setItem('baseline_visitor_id', visitorId);
    }

    try {
        await fetch('/api/visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visitorId })
        });
    } catch (err) {
        console.error("Tracking error:", err);
    }
}

// Stats Modal Logic
document.addEventListener('DOMContentLoaded', () => {
    initVisitorTracking();

    const statsBtn = document.getElementById('stats-btn');
    const statsModal = document.getElementById('stats-modal');
    const closeStatsBtn = document.querySelector('.close-stats');

    if (statsBtn && statsModal) {
        statsBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            playClick();

            // Show loading or clear previous
            document.getElementById('stat-visitors-total').textContent = '...';

            statsModal.style.display = 'flex';

            try {
                const res = await fetch('/api/stats');
                const data = await res.json();

                document.getElementById('stat-visitors-total').textContent = data.uniqueVisitors;
                document.getElementById('stat-visitors-today').textContent = data.visitorsToday;
                document.getElementById('stat-visitors-week').textContent = data.visitorsWeek;
                document.getElementById('stat-visitors-month').textContent = data.visitorsMonth;
                document.getElementById('stat-active-sessions').textContent = data.activeSessions;
                document.getElementById('stat-cached-msgs').textContent = data.cachedMessages;
                document.getElementById('stat-creating-stories').textContent = data.creatingStories;
                document.getElementById('stat-total-stories').textContent = data.totalStories;
                document.getElementById('stat-forked-stories').textContent = data.forkedStories;
                document.getElementById('stat-registered-users').textContent = data.registeredUsers;

            } catch (err) {
                console.error("Stats fetch error:", err);
                document.getElementById('stat-visitors-total').textContent = 'ERR';
            }
        });

        if (closeStatsBtn) {
            closeStatsBtn.addEventListener('click', () => {
                statsModal.style.display = 'none';
            });
        }

        // Click outside to close
        statsModal.addEventListener('click', (e) => {
            if (e.target === statsModal) {
                statsModal.style.display = 'none';
            }
        });
    }
});
