import Vapi from '/vendor/vapi.bundle.js';
import { translations } from '/i18n.js';

const els = {
  callBtn: document.getElementById('call-btn'),
  callBtnLabel: document.getElementById('call-btn-label'),
  heroCall: document.getElementById('hero-call'),
  muteBtn: document.getElementById('mute-btn'),
  status: document.getElementById('call-status'),
  orb: document.getElementById('orb'),
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

// Transcript UI was removed — surface notices via the status line instead.
function clearTranscript() { /* no-op (transcript UI removed) */ }

function notice(text, kind = 'info') {
  setStatus(text, kind === 'error' ? 'error' : '');
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

    // Transcript UI was removed; we no longer subscribe to message events.

    vapi.on('error', (e) => {
      console.error('Vapi error', e);
      const detail = describeError(e);
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

  // NOTE: We intentionally do NOT override `model` here.
  // Vapi requires a full model spec (provider + model) when overriding,
  // and the assistant configured in the Vapi dashboard already carries the
  // system prompt. To change the prompt, edit it in the Vapi dashboard.
  return overrides;
}

function describeError(e) {
  if (!e) return 'unknown error';
  if (typeof e === 'string') return e;
  // Vapi error envelopes nest messages a few levels deep
  const inner = e.error?.error?.message || e.error?.message || e.errorMsg || e.message;
  if (Array.isArray(inner)) return inner.join(' · ');
  if (typeof inner === 'string') return inner;
  if (typeof inner === 'object' && inner) {
    const m = inner.message;
    if (Array.isArray(m)) return m.join(' · ');
    if (typeof m === 'string') return m;
  }
  try { return JSON.stringify(e); } catch { return String(e); }
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
    const msg = describeError(err);
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
