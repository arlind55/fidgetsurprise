// App shell: picks the toy, sizes the canvas, routes touches and runs the loop.
(() => {
  'use strict';

  const ORDER = ['popit', 'squishy', 'slime'];
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('status');
  const hintEl = document.getElementById('hint');
  const flipBtn = document.getElementById('flipBtn');
  const tabsEl = document.getElementById('tabs');

  const app = {
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    refreshStatus() { statusEl.innerHTML = current.status(); },
    setHint(text) { hintEl.textContent = text; },
  };

  let current = null, size = { W: 0, H: 0 };

  function readSaved() {
    try { return localStorage.getItem('fidget.toy'); } catch (_) { return null; }
  }

  function choose(key) {
    current = Toys[key];
    try { localStorage.setItem('fidget.toy', key); } catch (_) {}
    for (const b of tabsEl.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.toy === key));
    flipBtn.hidden = !current.flip;
    canvas.setAttribute('aria-label', `${current.name}. ${current.hint}.`);
    current.layout(size.W, size.H);
    app.refreshStatus();
    app.setHint(current.hint);
  }

  // Toy picker
  for (const key of ORDER) {
    const toy = Toys[key];
    toy.init(app, ctx);
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.toy = key;
    b.innerHTML = `<span class="tab-icon" aria-hidden="true">${toy.icon}</span><span>${toy.name}</span>`;
    b.addEventListener('click', () => {
      if (current === toy) return;
      Feel.ensureAudio();
      Feel.tick(1);
      Feel.pop(620);
      choose(key);
    });
    tabsEl.appendChild(b);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = { W: rect.width, H: rect.height };
    if (current) current.layout(size.W, size.H);
  }

  // --- input ---
  // Touches go to the toy by id. On iPhone the haptic tick may only play while
  // a finger lifts, so every touchend ends with Feel.flush().
  function local(p) {
    const rect = canvas.getBoundingClientRect();
    return [p.clientX - rect.left, p.clientY - rect.top];
  }

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    Feel.ensureAudio();
    for (const t of e.changedTouches) current.down('t' + t.identifier, ...local(t));
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) current.move('t' + t.identifier, ...local(t));
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) current.up('t' + t.identifier, ...local(t), false);
    Feel.flush();
  }, { passive: false });

  canvas.addEventListener('touchcancel', (e) => {
    for (const t of e.changedTouches) current.up('t' + t.identifier, ...local(t), true);
    Feel.flush();
  });

  // Mouse and pen
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    Feel.ensureAudio();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    current.down('p' + e.pointerId, ...local(e));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) current.move('p' + e.pointerId, ...local(ev));
  });
  ['pointerup', 'pointercancel'].forEach((type) => {
    canvas.addEventListener(type, (e) => {
      if (e.pointerType === 'touch') return;
      current.up('p' + e.pointerId, ...local(e), type === 'pointercancel');
      Feel.flush();
    });
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // iOS unlocks audio on touchend; keep resuming until it's running.
  document.addEventListener('touchend', () => Feel.ensureAudio(), { passive: true });
  // Buttons: play any queued iPhone tick once the button's own handler ran.
  document.addEventListener('click', () => Feel.flush());

  // --- toolbar ---
  flipBtn.addEventListener('click', () => current.flip && current.flip());
  document.getElementById('colorsBtn').addEventListener('click', () => {
    Feel.ensureAudio();
    Feel.tick(1);
    current.nextColour();
  });
  const soundBtn = document.getElementById('soundBtn');
  soundBtn.addEventListener('click', () => {
    Feel.soundOn = !Feel.soundOn;
    soundBtn.setAttribute('aria-pressed', String(Feel.soundOn));
    soundBtn.textContent = Feel.soundOn ? '🔊' : '🔈';
    Feel.tick(1);
  });
  document.getElementById('buzzBtn').addEventListener('click', () => {
    Feel.tick(3);
    app.setHint(Feel.canVibrate || Feel.isIOS ? 'Did you feel a buzz?' : 'This browser can\'t buzz');
  });

  // --- loop ---
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - lastT) / 1000);
    lastT = now;
    ctx.clearRect(0, 0, size.W, size.H);
    current.frame(dt, now);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  const saved = readSaved();
  choose(ORDER.includes(saved) ? saved : 'popit');
  requestAnimationFrame((t) => { lastT = t; frame(t); });
})();
