// Fidget board: a chunky panel of clicky toggles, arcade buttons, a notched
// slider and a rotary dial with detents. Every control clicks.
(window.Toys = window.Toys || {}).board = (() => {
  'use strict';

  const THEMES = [
    { panel: '#7b5cff', keys: ['#ff5470', '#ffc93c', '#3ec6e0'], led: '#7bffb0' },
    { panel: '#ff8a3d', keys: ['#4f8cff', '#7bd389', '#ff5470'], led: '#fff27b' },
    { panel: '#2ec4b6', keys: ['#ffc93c', '#ff7eb6', '#8a6cff'], led: '#ffffff' },
    { panel: '#ff7eb6', keys: ['#8a6cff', '#3ec6e0', '#ffc93c'], led: '#b8f5ff' },
  ];
  const NOTCHES = 8;              // slider steps
  const DETENT = Math.PI / 6;     // dial clicks every 30 degrees
  const { shade, rgba } = window.Paint;

  let app, ctx;
  const state = {
    theme: 0,
    geo: null,
    toggles: [0, 1, 0].map((on) => ({ on: !!on, t: on, v: 0, pressed: false })),
    keys: [0, 1, 2].map(() => ({ d: 0, v: 0, pressed: false, lit: false })),
    slider: { value: 0.5, shown: 0.5, step: 4, dragging: false },
    dial: { angle: 0, shown: 0, v: 0, detent: 0, dragging: false, grab: 0 },
    touches: new Map(),
    clicks: 0,
  };

  function layout(W, H) {
    const pad = 6;
    const pw = Math.min(W - pad * 2, (H - pad * 2) * 0.62);
    const px = (W - pw) / 2, py = pad, ph = H - pad * 2;
    const inner = pw * 0.06;
    const sec = (a, b) => ({ x: px + inner, y: py + ph * a, w: pw - inner * 2, h: ph * (b - a) });
    const g = {
      W, H, px, py, pw, ph,
      toggles: sec(0.03, 0.2),
      keys: sec(0.23, 0.45),
      slider: sec(0.48, 0.61),
      dial: sec(0.64, 0.97),
    };
    const kr = Math.min(g.keys.w / 3 * 0.36, g.keys.h * 0.38);
    g.keyR = kr;
    const sl = g.slider;
    g.track = { x0: sl.x + sl.w * 0.1, x1: sl.x + sl.w * 0.9, y: sl.y + sl.h / 2 };
    g.dialC = { x: g.dial.x + g.dial.w / 2, y: g.dial.y + g.dial.h / 2, r: Math.min(g.dial.w * 0.32, g.dial.h * 0.36) };
    state.geo = g;
  }

  const colCenter = (s, i) => s.x + (s.w / 3) * (i + 0.5);
  const inside = (s, x, y) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;

  function counted() { state.clicks++; app.refreshStatus(); }

  // --- input ---
  function down(id, x, y) {
    const g = state.geo;
    if (inside(g.toggles, x, y)) {
      const i = Math.min(2, Math.floor(((x - g.toggles.x) / g.toggles.w) * 3));
      state.toggles[i].pressed = true;
      state.touches.set(id, { kind: 'toggle', i });
      Feel.click(1500, 0.5);
      return;
    }
    if (inside(g.keys, x, y)) {
      const i = Math.min(2, Math.floor(((x - g.keys.x) / g.keys.w) * 3));
      const k = state.keys[i];
      k.pressed = true;
      state.touches.set(id, { kind: 'key', i });
      Feel.thock(140 + i * 30);
      Feel.tick(2);
      counted();
      return;
    }
    if (inside(g.slider, x, y)) {
      state.slider.dragging = true;
      state.touches.set(id, { kind: 'slider' });
      move(id, x, y);
      return;
    }
    const d = g.dialC;
    if (Math.hypot(x - d.x, y - d.y) < d.r * 1.5) {
      const dial = state.dial;
      dial.dragging = true;
      dial.grab = Math.atan2(y - d.y, x - d.x) - dial.angle;
      state.touches.set(id, { kind: 'dial' });
      Feel.click(900, 0.4);
    }
  }

  function move(id, x, y) {
    const p = state.touches.get(id);
    if (!p) return;
    const g = state.geo;
    if (p.kind === 'slider') {
      const s = state.slider, tr = g.track;
      s.value = Math.max(0, Math.min(1, (x - tr.x0) / (tr.x1 - tr.x0)));
      const step = Math.round(s.value * NOTCHES);
      if (step !== s.step) {
        s.step = step;
        Feel.click(700 + step * 90, 0.7);
        Feel.tick(1);
        counted();
      }
    } else if (p.kind === 'dial') {
      const dial = state.dial, d = g.dialC;
      let a = Math.atan2(y - d.y, x - d.x) - dial.grab;
      // keep the angle continuous so the dial can turn round and round
      while (a - dial.angle > Math.PI) a -= Math.PI * 2;
      while (a - dial.angle < -Math.PI) a += Math.PI * 2;
      dial.angle = a;
      const det = Math.round(a / DETENT);
      if (det !== dial.detent) {
        dial.detent = det;
        Feel.click(1100 + (((det % 12) + 12) % 12) * 40, 0.8);
        Feel.tick(1);
        counted();
      }
    }
  }

  function up(id, x, y, cancelled) {
    const p = state.touches.get(id);
    state.touches.delete(id);
    if (!p) return;
    if (p.kind === 'toggle') {
      const tg = state.toggles[p.i];
      tg.pressed = false;
      if (!cancelled) {
        tg.on = !tg.on;
        tg.v += tg.on ? 9 : -9;
        Feel.click(tg.on ? 2300 : 1700, 1);
        Feel.tick(2);
        counted();
      }
    } else if (p.kind === 'key') {
      const k = state.keys[p.i];
      k.pressed = false;
      k.lit = !k.lit;
      Feel.click(1200, 0.5);
      Feel.tick(1);
    } else if (p.kind === 'slider') {
      state.slider.dragging = false;
      state.slider.value = state.slider.step / NOTCHES; // settle into the nearest notch
      Feel.tick(2);
    } else if (p.kind === 'dial') {
      state.dial.dragging = false;
      state.dial.angle = state.dial.detent * DETENT;
      Feel.tick(2);
    }
  }

  // --- simulation ---
  function step(dt) {
    for (const tg of state.toggles) {
      const target = tg.on ? (tg.pressed ? 0.8 : 1) : (tg.pressed ? 0.2 : 0);
      tg.v += (700 * (target - tg.t) - 26 * tg.v) * dt;
      tg.t += tg.v * dt;
    }
    for (const k of state.keys) {
      const target = k.pressed ? 1 : 0;
      k.v += (1400 * (target - k.d) - 34 * k.v) * dt;
      k.d += k.v * dt;
    }
    const s = state.slider;
    s.shown += (s.value - s.shown) * Math.min(1, dt * (s.dragging ? 40 : 18));
    const dl = state.dial;
    if (dl.dragging) { dl.shown = dl.angle; dl.v = 0; }
    else {
      dl.v += (500 * (dl.angle - dl.shown) - 24 * dl.v) * dt;
      dl.shown += dl.v * dt;
    }
  }

  // --- drawing ---
  function well(s) {
    const th = THEMES[state.theme];
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, s.w, s.h, Math.min(s.h, s.w) * 0.22);
    ctx.fillStyle = shade(th.panel, -0.18);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.shadowColor = 'rgba(20,10,50,0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.lineWidth = 8;
    ctx.strokeStyle = shade(th.panel, -0.18);
    ctx.beginPath();
    ctx.roundRect(s.x - 4, s.y - 4, s.w + 8, s.h + 8, Math.min(s.h, s.w) * 0.22 + 4);
    ctx.stroke();
    ctx.restore();
  }

  function drawPanel() {
    const g = state.geo, th = THEMES[state.theme];
    ctx.save();
    ctx.shadowColor = 'rgba(45,35,80,0.3)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;
    ctx.beginPath();
    ctx.roundRect(g.px, g.py, g.pw, g.ph, g.pw * 0.1);
    const body = ctx.createLinearGradient(g.px, g.py, g.px + g.pw, g.py + g.ph);
    body.addColorStop(0, shade(th.panel, 0.18));
    body.addColorStop(1, shade(th.panel, -0.12));
    ctx.fillStyle = body;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.roundRect(g.px + 2, g.py + 2, g.pw - 4, g.ph - 4, g.pw * 0.1 - 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.stroke();
  }

  function drawToggles() {
    const g = state.geo, s = g.toggles, th = THEMES[state.theme];
    well(s);
    const hw = Math.min(s.w / 3 * 0.42, s.h * 0.42), hh = s.h * 0.72;
    state.toggles.forEach((tg, i) => {
      const cx = colCenter(s, i), cy = s.y + s.h / 2;
      // housing
      ctx.beginPath();
      ctx.roundRect(cx - hw / 2, cy - hh / 2, hw, hh, hw / 2);
      ctx.fillStyle = '#2a2140';
      ctx.fill();
      // LED above the switch
      ctx.beginPath();
      ctx.arc(cx + hw * 0.85, cy - hh * 0.38, hw * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = tg.on ? th.led : 'rgba(0,0,0,0.25)';
      ctx.shadowColor = tg.on ? th.led : 'transparent';
      ctx.shadowBlur = tg.on ? 10 : 0;
      ctx.fill();
      ctx.shadowBlur = 0;
      // lever: slides from bottom (off) to top (on)
      const t = Math.max(-0.1, Math.min(1.1, tg.t));
      const ky = cy + hh / 2 - hw / 2 - t * (hh - hw);
      const knob = ctx.createRadialGradient(cx - hw * 0.15, ky - hw * 0.2, hw * 0.05, cx, ky, hw * 0.55);
      const col = tg.on ? th.keys[i] : '#d9d3ea';
      knob.addColorStop(0, shade(col, 0.5));
      knob.addColorStop(1, shade(col, -0.15));
      ctx.beginPath();
      ctx.arc(cx, ky, hw * 0.46, 0, Math.PI * 2);
      ctx.fillStyle = knob;
      ctx.fill();
    });
  }

  function drawKeys() {
    const g = state.geo, s = g.keys, th = THEMES[state.theme];
    well(s);
    const r = g.keyR;
    state.keys.forEach((k, i) => {
      const cx = colCenter(s, i), cy = s.y + s.h / 2;
      const col = th.keys[i];
      const depth = r * 0.22, d = Math.max(0, Math.min(1.1, k.d));
      // bezel
      ctx.beginPath();
      ctx.arc(cx, cy + depth * 0.5, r * 1.12, 0, Math.PI * 2);
      ctx.fillStyle = '#2a2140';
      ctx.fill();
      // button side
      const top = cy - depth * (1 - d);
      ctx.beginPath();
      ctx.arc(cx, top + depth * (1 - d), r, 0, Math.PI * 2);
      ctx.fillStyle = shade(col, -0.35);
      ctx.fill();
      // cap
      const cap = ctx.createRadialGradient(cx - r * 0.3, top - r * 0.35, r * 0.05, cx, top, r);
      cap.addColorStop(0, shade(col, k.lit ? 0.7 : 0.45));
      cap.addColorStop(0.6, k.lit ? shade(col, 0.15) : col);
      cap.addColorStop(1, shade(col, -0.2));
      ctx.save();
      if (k.lit) { ctx.shadowColor = col; ctx.shadowBlur = r * 0.8; }
      ctx.beginPath();
      ctx.arc(cx, top, r, 0, Math.PI * 2);
      ctx.fillStyle = cap;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.3, top - r * 0.38, r * 0.3, r * 0.16, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fill();
    });
  }

  function drawSlider() {
    const g = state.geo, s = g.slider, tr = g.track, th = THEMES[state.theme];
    well(s);
    const kx = tr.x0 + (tr.x1 - tr.x0) * state.slider.shown;
    // notches
    for (let i = 0; i <= NOTCHES; i++) {
      const x = tr.x0 + ((tr.x1 - tr.x0) * i) / NOTCHES;
      ctx.beginPath();
      ctx.arc(x, tr.y + s.h * 0.3, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = i <= state.slider.step ? th.led : 'rgba(255,255,255,0.3)';
      ctx.fill();
    }
    // track
    ctx.lineCap = 'round';
    ctx.lineWidth = s.h * 0.16;
    ctx.strokeStyle = '#2a2140';
    ctx.beginPath(); ctx.moveTo(tr.x0, tr.y); ctx.lineTo(tr.x1, tr.y); ctx.stroke();
    ctx.lineWidth = s.h * 0.1;
    ctx.strokeStyle = th.keys[0];
    ctx.beginPath(); ctx.moveTo(tr.x0, tr.y); ctx.lineTo(kx, tr.y); ctx.stroke();
    // knob with grip lines
    const kw = s.h * 0.42, kh = s.h * 0.62;
    const knob = ctx.createLinearGradient(kx, tr.y - kh / 2, kx, tr.y + kh / 2);
    knob.addColorStop(0, '#ffffff');
    knob.addColorStop(1, '#cfc6e6');
    ctx.save();
    ctx.shadowColor = 'rgba(20,10,50,0.35)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.roundRect(kx - kw / 2, tr.y - kh / 2, kw, kh, kw * 0.3);
    ctx.fillStyle = knob;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(42,33,64,0.35)';
    for (const dx of [-0.2, 0, 0.2]) {
      ctx.beginPath();
      ctx.moveTo(kx + dx * kw, tr.y - kh * 0.22);
      ctx.lineTo(kx + dx * kw, tr.y + kh * 0.22);
      ctx.stroke();
    }
  }

  function drawDial() {
    const g = state.geo, s = g.dial, d = g.dialC, th = THEMES[state.theme];
    well(s);
    const a = state.dial.shown;
    // scale of 12 ticks and a lit arc for how far it has turned
    for (let i = 0; i < 12; i++) {
      const t = i * DETENT - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(d.x + Math.cos(t) * d.r * 1.18, d.y + Math.sin(t) * d.r * 1.18);
      ctx.lineTo(d.x + Math.cos(t) * d.r * 1.3, d.y + Math.sin(t) * d.r * 1.3);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.stroke();
    }
    const turn = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (turn > 0.01) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * 1.42, -Math.PI / 2, -Math.PI / 2 + turn);
      ctx.lineWidth = 5;
      ctx.strokeStyle = th.led;
      ctx.stroke();
    }
    // knob
    ctx.save();
    ctx.shadowColor = 'rgba(20,10,50,0.4)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2140';
    ctx.fill();
    ctx.restore();
    // grip ridges turn with the knob
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(a);
    for (let i = 0; i < 28; i++) {
      ctx.rotate((Math.PI * 2) / 28);
      ctx.fillStyle = '#463a66';
      ctx.fillRect(d.r * 0.86, -d.r * 0.035, d.r * 0.14, d.r * 0.07);
    }
    ctx.restore();
    const cap = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.35, d.r * 0.05, d.x, d.y, d.r * 0.85);
    cap.addColorStop(0, '#ffffff');
    cap.addColorStop(1, '#bdb3d9');
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = cap;
    ctx.fill();
    // pointer
    const pa = a - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(d.x + Math.cos(pa) * d.r * 0.2, d.y + Math.sin(pa) * d.r * 0.2);
    ctx.lineTo(d.x + Math.cos(pa) * d.r * 0.68, d.y + Math.sin(pa) * d.r * 0.68);
    ctx.lineWidth = d.r * 0.12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = th.keys[2];
    ctx.stroke();
    ctx.fillStyle = rgba(THEMES[state.theme].panel, 0.25);
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  function frame(dt) {
    for (let i = 0; i < 3; i++) step(dt / 3);
    drawPanel();
    drawToggles();
    drawKeys();
    drawSlider();
    drawDial();
  }

  return {
    name: 'Fidget board',
    icon: '🎛️',
    hint: 'Flip, press, slide and twist',
    init(a, c) { app = a; ctx = c; },
    layout, frame, down, move, up,
    nextColour() { state.theme = (state.theme + 1) % THEMES.length; Feel.click(2000, 0.8); },
    status: () => `${state.clicks} <small>clicks</small>`,
  };
})();
