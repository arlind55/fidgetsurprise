// Spinner: a fidget spinner. Grab it and flick to spin; it ticks past each
// arm as it slows down. The status shows the speed and your best spin.
(window.Toys = window.Toys || {}).spinner = (() => {
  'use strict';

  const COLOURS = ['#4f8cff', '#ff5470', '#7bd389', '#ffc93c', '#8a6cff'];
  const STYLES = [
    { name: 'Classic', arms: 3, rainbow: false },
    { name: 'Rainbow', arms: 3, rainbow: true },
    { name: 'Star', arms: 5, rainbow: false },
  ];
  const RAINBOW = ['#ff5470', '#ffc93c', '#3ec6e0', '#8a6cff', '#7bd389'];
  const { shade } = window.Paint;

  let app, ctx;
  const state = {
    colour: 0,
    style: 0,
    cx: 0, cy: 0, R: 100,
    angle: 0, w: 0,      // radians, radians per second
    grab: null,          // { id, offset, samples: [{a, t}] }
    lastArm: 0,
    lastClick: 0,
    best: 0,
    shownRpm: 0,
  };

  function layout(W, H) {
    state.cx = W / 2;
    state.cy = H * 0.48;
    state.R = Math.min(W * 0.42, H * 0.34);
  }

  const rpm = () => Math.round((Math.abs(state.w) * 60) / (Math.PI * 2));

  function down(id, x, y) {
    if (state.grab) return;
    const dx = x - state.cx, dy = y - state.cy;
    if (Math.hypot(dx, dy) > state.R * 1.25) return;
    const a = Math.atan2(dy, dx);
    state.grab = { id, offset: a - state.angle, samples: [{ a: state.angle, t: performance.now() }] };
    if (Math.abs(state.w) > 3) { Feel.thock(110); Feel.tick(2); } // catching it mid-spin
    state.w = 0;
  }

  function move(id, x, y) {
    const g = state.grab;
    if (!g || g.id !== id) return;
    let a = Math.atan2(y - state.cy, x - state.cx) - g.offset;
    while (a - state.angle > Math.PI) a -= Math.PI * 2;
    while (a - state.angle < -Math.PI) a += Math.PI * 2;
    state.angle = a;
    const now = performance.now();
    g.samples.push({ a, t: now });
    while (g.samples.length > 2 && now - g.samples[0].t > 90) g.samples.shift();
  }

  function up(id, x, y, cancelled) {
    const g = state.grab;
    if (!g || g.id !== id) return;
    state.grab = null;
    if (cancelled || g.samples.length < 2) return;
    const first = g.samples[0], last = g.samples[g.samples.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0 || performance.now() - last.t > 120) return; // finger stopped before lifting
    state.w = Math.max(-60, Math.min(60, ((last.a - first.a) / dt) * 1.15));
    if (Math.abs(state.w) > 2) {
      Feel.whoosh();
      Feel.tick(Math.abs(state.w) > 25 ? 3 : 2);
    }
  }

  function step(dt) {
    if (state.grab) return;
    const w = state.w;
    // bearing friction: a little drag, plus a gentle constant brake near the end
    const brake = 0.22 * Math.abs(w) + 0.35;
    const nw = Math.sign(w) * Math.max(0, Math.abs(w) - brake * dt);
    state.w = nw;
    state.angle += nw * dt;
  }

  function armTicks() {
    const arms = STYLES[state.style].arms;
    const arm = Math.floor(state.angle / ((Math.PI * 2) / arms));
    if (arm === state.lastArm) return;
    state.lastArm = arm;
    const speed = Math.abs(state.w);
    const now = performance.now();
    if (now - state.lastClick < 28 || speed < 0.2) return;
    state.lastClick = now;
    Feel.click(900 + Math.min(speed, 40) * 30, Math.max(0.15, 0.8 - speed / 60));
    if (speed < 10) Feel.tick(1);
  }

  function drawBody(angle, alpha) {
    const { cx, cy, R } = state;
    const style = STYLES[state.style];
    const base = COLOURS[state.colour];
    const armLen = R * (style.arms === 5 ? 0.66 : 0.6);
    const lobeR = R * (style.arms === 5 ? 0.27 : 0.36);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // body: arms + lobes in one colour, lit from the top-left (light stays put)
    const lit = (col) => {
      const gr = ctx.createLinearGradient(-R, -R, R, R);
      gr.addColorStop(0, shade(col, 0.4));
      gr.addColorStop(0.5, col);
      gr.addColorStop(1, shade(col, -0.3));
      return gr;
    };
    for (let k = 0; k < style.arms; k++) {
      const a = (k * Math.PI * 2) / style.arms;
      const col = style.rainbow ? RAINBOW[k % RAINBOW.length] : base;
      ctx.fillStyle = ctx.strokeStyle = lit(col);
      ctx.lineWidth = lobeR * 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * armLen, Math.sin(a) * armLen);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(Math.cos(a) * armLen, Math.sin(a) * armLen, lobeR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = lit(style.rainbow ? '#ffffff' : base);
    ctx.fill();

    // weights in each lobe: a dark ring with a shiny metal disc
    for (let k = 0; k < style.arms; k++) {
      const a = (k * Math.PI * 2) / style.arms;
      const x = Math.cos(a) * armLen, y = Math.sin(a) * armLen;
      ctx.beginPath();
      ctx.arc(x, y, lobeR * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,20,50,0.55)';
      ctx.fill();
      const metal = ctx.createLinearGradient(x - lobeR, y - lobeR, x + lobeR, y + lobeR);
      metal.addColorStop(0, '#ffffff');
      metal.addColorStop(0.5, '#b9b3c9');
      metal.addColorStop(1, '#7d7690');
      ctx.beginPath();
      ctx.arc(x, y, lobeR * 0.56, 0, Math.PI * 2);
      ctx.fillStyle = metal;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCap() {
    const { cx, cy, R } = state;
    const cap = ctx.createRadialGradient(cx - R * 0.08, cy - R * 0.1, R * 0.02, cx, cy, R * 0.22);
    cap.addColorStop(0, '#ffffff');
    cap.addColorStop(0.7, '#d4cee3');
    cap.addColorStop(1, '#8f88a4');
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = cap;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(30,20,50,0.25)';
    ctx.stroke();
  }

  function frame(dt) {
    for (let i = 0; i < 4; i++) { step(dt / 4); armTicks(); }

    const { cx, cy, R } = state;
    // shadow on the table
    const sh = ctx.createRadialGradient(cx, cy + R * 0.12, R * 0.2, cx, cy + R * 0.12, R * 1.15);
    sh.addColorStop(0, 'rgba(45,35,80,0.22)');
    sh.addColorStop(1, 'rgba(45,35,80,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(cx, cy + R * 0.12, R * 1.15, 0, Math.PI * 2);
    ctx.fill();

    // motion blur: faint copies trailing behind when it's fast
    const speed = Math.abs(state.w);
    const ghosts = app.reduceMotion ? 0 : Math.min(5, Math.floor(speed / 6));
    for (let i = ghosts; i >= 1; i--) drawBody(state.angle - state.w * 0.008 * i, 0.12);
    drawBody(state.angle, 1);
    drawCap();

    const r = rpm();
    if (r > state.best && !state.grab) state.best = r;
    if (Math.abs(r - state.shownRpm) > 0) { state.shownRpm = r; app.refreshStatus(); }
  }

  return {
    name: 'Spinner',
    icon: '🌀',
    hint: 'Grab it and flick to spin',
    init(a, c) { app = a; ctx = c; },
    layout, frame, down, move, up,
    nextColour() { state.colour = (state.colour + 1) % COLOURS.length; Feel.click(1500, 0.7); },
    styleIcon: '⭐',
    styleLabel: 'Change spinner',
    nextStyle() {
      state.style = (state.style + 1) % STYLES.length;
      Feel.whoosh();
      app.setHint(`${STYLES[state.style].name} spinner`);
    },
    status: () => `${state.shownRpm} <small>rpm · best ${state.best}</small>`,
  };
})();
