import Vapi from 'https://esm.sh/@vapi-ai/web@2.3.7';

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

async function loadConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Config endpoint failed');
  return res.json();
}

async function init() {
  try {
    const cfg = await loadConfig();
    if (!cfg.publicKey || !cfg.assistantId) {
      setStatus('Voice agent not configured', 'error');
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
      setStatus('Connection issue — please retry', 'error');
    });
  } catch (err) {
    console.error(err);
    setStatus('Could not initialize voice agent', 'error');
    els.callBtn.disabled = true;
    els.heroCall.disabled = true;
  }
}

async function startCall() {
  if (!vapi || !assistantId) return;
  try {
    setStatus('Connecting…');
    clearTranscript();
    await vapi.start(assistantId);
  } catch (err) {
    console.error('start failed', err);
    setStatus('Could not start call. Check microphone permission.', 'error');
  }
}

function stopCall() {
  if (!vapi) return;
  vapi.stop();
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

init();
