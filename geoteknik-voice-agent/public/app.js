import Vapi from 'https://cdn.jsdelivr.net/npm/@vapi-ai/web@2.3.7/+esm';

const els = {
  callBtn: document.getElementById('call-btn'),
  callBtnLabel: document.getElementById('call-btn-label'),
  heroCall: document.getElementById('hero-call'),
  muteBtn: document.getElementById('mute-btn'),
  status: document.getElementById('call-status'),
  orb: document.getElementById('orb'),
  transcript: document.getElementById('transcript'),
  timer: document.getElementById('timer'),
};

let vapi = null;
let assistantId = null;
let inCall = false;
let muted = false;
let timerInt = null;
let startedAt = 0;

function setStatus(text, type = '') {
  els.status.textContent = text;
  els.status.className = 'call-status' + (type ? ' ' + type : '');
}

function clearTranscript() {
  els.transcript.innerHTML = '';
}

function notice(text, kind = 'info') {
  const placeholder = els.transcript.querySelector('.placeholder');
  if (placeholder) placeholder.remove();
  const div = document.createElement('div');
  div.className = `msg ${kind === 'error' ? 'agent' : 'agent'}`;
  div.style.background = kind === 'error' ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)';
  div.innerHTML = `<div class="who">${kind === 'error' ? 'Error' : 'Notice'}</div><div class="body"></div>`;
  div.querySelector('.body').textContent = text;
  els.transcript.appendChild(div);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function addMessage(who, text) {
  const placeholder = els.transcript.querySelector('.placeholder');
  if (placeholder) placeholder.remove();

  const last = els.transcript.lastElementChild;
  if (last && last.dataset.who === who && last.dataset.partial === 'true') {
    last.querySelector('.body').textContent = text;
  } else {
    const div = document.createElement('div');
    div.className = `msg ${who}`;
    div.dataset.who = who;
    div.dataset.partial = 'true';
    div.innerHTML = `<div class="who">${who === 'user' ? 'You' : 'Agent'}</div><div class="body"></div>`;
    div.querySelector('.body').textContent = text;
    els.transcript.appendChild(div);
  }
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function finalizeMessage(who) {
  const last = els.transcript.lastElementChild;
  if (last && last.dataset.who === who) last.dataset.partial = 'false';
}

function tickTimer() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  els.timer.textContent = `${m}:${ss}`;
}

function isInsideIframe() {
  try { return window.self !== window.top; } catch { return true; }
}

async function loadConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Config endpoint failed');
  return res.json();
}

async function ensureMicAccess() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('This browser does not support microphone access.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // We don't need the stream itself — Vapi/Daily will request its own.
  stream.getTracks().forEach((t) => t.stop());
}

async function init() {
  try {
    const cfg = await loadConfig();
    if (!cfg.publicKey || !cfg.assistantId) {
      setStatus('Voice agent not configured', 'error');
      notice('Server is missing VAPI_PUBLIC_KEY or VAPI_ASSISTANT_ID.', 'error');
      els.callBtn.disabled = true;
      els.heroCall.disabled = true;
      return;
    }
    assistantId = cfg.assistantId;
    vapi = new Vapi(cfg.publicKey);

    vapi.on('call-start', () => {
      inCall = true;
      startedAt = Date.now();
      timerInt = setInterval(tickTimer, 500);
      setStatus('Connected — speak naturally', 'live');
      els.orb.classList.add('live');
      els.callBtn.classList.add('end');
      els.callBtnLabel.textContent = 'End call';
      els.muteBtn.disabled = false;
    });

    vapi.on('call-end', () => {
      inCall = false;
      clearInterval(timerInt);
      setStatus('Call ended');
      els.orb.classList.remove('live', 'speaking');
      els.callBtn.classList.remove('end');
      els.callBtnLabel.textContent = 'Start call';
      els.muteBtn.disabled = true;
      muted = false;
      els.muteBtn.textContent = 'Mute';
    });

    vapi.on('speech-start', () => els.orb.classList.add('speaking'));
    vapi.on('speech-end', () => els.orb.classList.remove('speaking'));

    vapi.on('message', (msg) => {
      if (msg.type === 'transcript' && msg.transcript) {
        const who = msg.role === 'user' ? 'user' : 'agent';
        addMessage(who, msg.transcript);
        if (msg.transcriptType === 'final') finalizeMessage(who);
      }
    });

    vapi.on('error', (e) => {
      console.error('Vapi error', e);
      const detail = (e && (e.errorMsg || e.message || e.error?.message)) || 'unknown error';
      setStatus('Connection issue — ' + detail, 'error');
      notice('Vapi error: ' + detail, 'error');
    });

    setStatus('Ready — click "Start call" to begin');
  } catch (err) {
    console.error('init failed', err);
    setStatus('Could not initialize voice agent', 'error');
    notice('Initialization error: ' + (err?.message || err), 'error');
    els.callBtn.disabled = true;
    els.heroCall.disabled = true;
  }
}

async function startCall() {
  if (!vapi || !assistantId) {
    notice('Voice agent is not ready yet. Please refresh the page.', 'error');
    return;
  }
  try {
    setStatus('Requesting microphone…');
    await ensureMicAccess();
    setStatus('Connecting…');
    clearTranscript();
    await vapi.start(assistantId);
  } catch (err) {
    console.error('start failed', err);
    const msg = (err && (err.message || err.errorMsg)) || String(err);
    if (/permission|denied|NotAllowedError/i.test(msg)) {
      setStatus('Microphone blocked', 'error');
      const hint = isInsideIframe()
        ? 'Microphone is blocked inside the embedded preview. Click the "Open in new tab" icon at the top of the preview, then allow the mic prompt.'
        : 'Microphone permission was denied. Click the lock icon in your address bar and allow microphone access.';
      notice(hint, 'error');
    } else if (/NotFoundError|no.*device/i.test(msg)) {
      setStatus('No microphone found', 'error');
      notice('No microphone was detected on this device.', 'error');
    } else {
      setStatus('Could not start call', 'error');
      notice('Start call failed: ' + msg, 'error');
    }
  }
}

function stopCall() {
  if (!vapi) return;
  try { vapi.stop(); } catch (e) { console.warn(e); }
}

function toggleCall() {
  if (inCall) stopCall(); else startCall();
}

els.callBtn.addEventListener('click', toggleCall);
els.heroCall.addEventListener('click', () => {
  document.getElementById('call').scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (!inCall) startCall();
});
els.muteBtn.addEventListener('click', () => {
  if (!vapi) return;
  muted = !muted;
  vapi.setMuted(muted);
  els.muteBtn.textContent = muted ? 'Unmute' : 'Mute';
});

// Show iframe hint upfront so users understand the limitation.
if (isInsideIframe()) {
  setTimeout(() => {
    notice('You are viewing this inside an embedded preview. If the call fails to start, open the page in a new tab so the browser can prompt for microphone access.', 'info');
  }, 400);
}

init();
