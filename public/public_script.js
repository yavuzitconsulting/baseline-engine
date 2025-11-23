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
