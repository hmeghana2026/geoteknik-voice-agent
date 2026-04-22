import Vapi from '/vendor/vapi.bundle.js';
import { translations } from '/i18n.js';

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

let lang = (localStorage.getItem('lang') === 'tr') ? 'tr' : 'en';
const t = (k) => (translations[lang] && translations[lang][k]) || translations.en[k] || k;

function applyTranslations() {
  document.documentElement.lang = t('htmlLang');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    el.innerHTML = t(key);
  });
  document.querySelectorAll('.lang-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
  // Refresh dynamic strings
  if (!inCall) {
    setStatus(t(vapi ? 'statusReady' : 'statusIdle'));
    els.callBtnLabel.textContent = t('startCall');
    els.muteBtn.textContent = t('mute');
  } else {
    els.callBtnLabel.textContent = t('endCall');
    els.muteBtn.textContent = muted ? t('unmute') : t('mute');
  }
  // Reset placeholder text if present
  const ph = els.transcript.querySelector('.placeholder');
  if (ph) ph.textContent = t('transcriptPlaceholder');
}

function setLang(next) {
  lang = next === 'tr' ? 'tr' : 'en';
  localStorage.setItem('lang', lang);
  applyTranslations();
}

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
  div.className = 'msg agent';
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
    div.innerHTML = `<div class="who">${who === 'user' ? (lang === 'tr' ? 'Siz' : 'You') : (lang === 'tr' ? 'Asistan' : 'Agent')}</div><div class="body"></div>`;
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
  stream.getTracks().forEach((tr) => tr.stop());
}

async function init() {
  applyTranslations();
  try {
    const cfg = await loadConfig();
    if (!cfg.publicKey || !cfg.assistantId) {
      setStatus(t('statusCantStart'), 'error');
      notice(t('notConfigured'), 'error');
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
      setStatus(t('statusConnected'), 'live');
      els.orb.classList.add('live');
      els.callBtn.classList.add('end');
      els.callBtnLabel.textContent = t('endCall');
      els.muteBtn.disabled = false;
    });

    vapi.on('call-end', () => {
      inCall = false;
      clearInterval(timerInt);
      setStatus(t('statusEnded'));
      els.orb.classList.remove('live', 'speaking');
      els.callBtn.classList.remove('end');
      els.callBtnLabel.textContent = t('startCall');
      els.muteBtn.disabled = true;
      muted = false;
      els.muteBtn.textContent = t('mute');
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
      setStatus(t('statusCantStart') + ' — ' + detail, 'error');
      notice('Vapi error: ' + detail, 'error');
    });

    setStatus(t('statusReady'));
  } catch (err) {
    console.error('init failed', err);
    setStatus(t('statusCantStart'), 'error');
    notice('Initialization error: ' + (err?.message || err), 'error');
    els.callBtn.disabled = true;
    els.heroCall.disabled = true;
  }
}

async function buildAssistantOverrides() {
  // Pull the up-to-date system prompt + first message for the chosen UI language.
  let promptData;
  try {
    const r = await fetch(`/api/agent-prompt?lang=${encodeURIComponent(lang)}`);
    promptData = await r.json();
  } catch (e) {
    console.warn('Could not load agent prompt, falling back to defaults', e);
    promptData = { systemPrompt: '', firstMessage: t('firstMessage') };
  }

  const overrides = {
    firstMessage: promptData.firstMessage || t('firstMessage'),
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: lang === 'tr' ? 'tr' : 'en',
    },
  };

  if (promptData.systemPrompt) {
    overrides.model = {
      messages: [{ role: 'system', content: promptData.systemPrompt }],
    };
  }

  return overrides;
}

async function startCall() {
  if (!vapi || !assistantId) {
    notice(lang === 'tr' ? 'Sesli asistan henüz hazır değil. Sayfayı yenileyin.' : 'Voice agent is not ready yet. Please refresh the page.', 'error');
    return;
  }
  try {
    setStatus(t('statusRequestingMic'));
    await ensureMicAccess();
    setStatus(t('statusConnecting'));
    clearTranscript();
    const overrides = await buildAssistantOverrides();
    await vapi.start(assistantId, overrides);
  } catch (err) {
    console.error('start failed', err);
    const msg = (err && (err.message || err.errorMsg)) || String(err);
    if (/permission|denied|NotAllowedError/i.test(msg)) {
      setStatus(t('statusMicBlocked'), 'error');
      notice(isInsideIframe() ? t('micBlockedHint') : t('micDeniedHint'), 'error');
    } else if (/NotFoundError|no.*device/i.test(msg)) {
      setStatus(t('statusNoMic'), 'error');
      notice(t('noMicHint'), 'error');
    } else {
      setStatus(t('statusCantStart'), 'error');
      notice(t('statusCantStart') + ': ' + msg, 'error');
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
  els.muteBtn.textContent = muted ? t('unmute') : t('mute');
});

document.querySelectorAll('.lang-btn').forEach((b) => {
  b.addEventListener('click', () => setLang(b.dataset.lang));
});

if (isInsideIframe()) {
  setTimeout(() => notice(t('iframeNotice'), 'info'), 400);
}

init();
