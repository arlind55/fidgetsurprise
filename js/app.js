// App shell: home screen, opening a toy, sizing the canvas, routing touches
// and running the loop.
(() => {
  'use strict';

  const ORDER = ['popit', 'squishy', 'slime'];
  const CARDS = {
    popit: { line: 'Pop all the bubbles', art: '<i></i>'.repeat(9) },
    squishy: { line: 'Squeeze the foam friend', art: '' },
    slime: { line: 'Stretch the gooey slime', art: '' },
  };
  const homeEl = document.getElementById('home');
  const playEl = document.getElementById('play');
  const cardsEl = document.getElementById('cards');
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('status');
  const hintEl = document.getElementById('hint');
  const flipBtn = document.getElementById('flipBtn');

  const app = {
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    refreshStatus() { statusEl.innerHTML = current.status(); },
    setHint(text) { hintEl.textContent = text; },
  };

  let current = null, size = { W: 0, H: 0 };

  function showToy(key) {
    current = Toys[key];
    homeEl.hidden = true;
    playEl.hidden = false;
    flipBtn.hidden = !current.flip;
    canvas.setAttribute('aria-label', `${current.name}. ${current.hint}.`);
    resize();
    app.refreshStatus();
    app.setHint(current.hint);
  }

  function showHome() {
    current = null;
    playEl.hidden = true;
    homeEl.hidden = false;
  }

  // The address keeps the open toy (#slime), so the phone's back gesture
  // returns to the home screen.
  function route() {
    const key = location.hash.slice(1);
    if (ORDER.includes(key)) showToy(key); else showHome();
  }

  // Home screen cards
  for (const key of ORDER) {
    const toy = Toys[key];
    toy.init(app, ctx);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `card card-${key}`;
    b.innerHTML = `<span class="art art-${key}" aria-hidden="true">${CARDS[key].art}</span>` +
      `<span class="card-text"><span class="card-name">${toy.name}</span><span class="card-line">${CARDS[key].line}</span></span>`;
    b.addEventListener('click', () => {
      Feel.ensureAudio();
      Feel.tick(2);
      Feel.pop(620);
      history.pushState({ fromHome: true }, '', '#' + key);
      route();
    });
    cardsEl.appendChild(b);
  }

  document.getElementById('backBtn').addEventListener('click', () => {
    Feel.tick(1);
    Feel.pop(520);
    if (history.state && history.state.fromHome) history.back(); // popstate re-routes
    else { history.replaceState(null, '', location.pathname + location.search); route(); }
  });
  window.addEventListener('popstate', route);

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
  flipBtn.addEventListener('click', () => current && current.flip && current.flip());
  document.getElementById('colorsBtn').addEventListener('click', () => {
    Feel.ensureAudio();
    Feel.tick(1);
    if (current) current.nextColour();
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
    if (current) {
      ctx.clearRect(0, 0, size.W, size.H);
      current.frame(dt, now);
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => { if (current) resize(); });
  route();
  requestAnimationFrame((t) => { lastT = t; frame(t); });
})();
