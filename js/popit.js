// Pop it: a silicone board of bubbles. Press sinks a bubble, lifting pops it,
// sliding pops every bubble you cross, and the board flips when all are popped.
(window.Toys = window.Toys || {}).popit = (() => {
  'use strict';

  const PALETTES = [
    ['#ff5470', '#ff8a3d', '#ffc93c', '#7bd389', '#3ec6e0', '#4f8cff', '#8a6cff', '#e36bd8'],
    ['#00b8a9', '#2ec4b6', '#3fa7ff', '#4f7cff', '#6a6cff', '#3fa7ff', '#2ec4b6', '#00b8a9'],
    ['#ff7eb6', '#ff9ec7', '#ffb3d1', '#c9a7ff', '#a68bff', '#ffb3d1', '#ff9ec7', '#ff7eb6'],
    ['#ff6b4a', '#ff8f3f', '#ffb238', '#ffd23f', '#ffb238', '#ff8f3f', '#ff6b4a', '#f2545b'],
  ];
  const COLS = 6, ROWS = 8, TOTAL = COLS * ROWS;
  const { shade } = window.Paint;

  let app, ctx;
  const state = {
    palette: 0,
    bubbles: [],
    ripples: [],
    geo: null,
    flip: null,          // { start, swapped }
    press: 0, pressV: 0, // whole-board squish
    popped: 0,
    touches: new Map(),  // id -> { start, last, moved }
    autoFlipTimer: 0,
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      state.bubbles.push({ r, c, up: true, held: false, t: 1, v: 0, squash: 0, sv: 0 });
    }
  }

  function layout(W, H) {
    const pad = 10;
    const cell = Math.min((W - pad * 2) / (COLS + 0.6), (H - pad * 2) / (ROWS + 0.6));
    const bw = cell * (COLS + 0.6), bh = cell * (ROWS + 0.6);
    state.geo = { W, H, cell, bw, bh, bx: (W - bw) / 2, by: (H - bh) / 2, rad: cell * 0.36, inset: cell * 0.3 };
  }

  function bubbleCenter(b) {
    const g = state.geo;
    return [g.bx + g.inset + b.c * g.cell + g.cell / 2, g.by + g.inset + b.r * g.cell + g.cell / 2];
  }

  function bubbleAt(x, y) {
    const g = state.geo;
    const c = Math.floor((x - g.bx - g.inset) / g.cell);
    const r = Math.floor((y - g.by - g.inset) / g.cell);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    const b = state.bubbles[r * COLS + c];
    const [cx, cy] = bubbleCenter(b);
    // generous target: anywhere in the bubble's cell counts, for small fingers
    return Math.hypot(x - cx, y - cy) <= g.cell * 0.62 ? b : null;
  }

  // --- interaction ---
  function popBubble(b) {
    if (!b.up || state.flip) return false;
    b.up = false;
    b.held = false;
    b.v -= 6;           // kick the spring so it overshoots like silicone
    b.sv += 14;
    state.pressV += 2.5;
    state.popped++;
    Feel.tick(2);
    Feel.pop(380 + (ROWS - b.r) * 32 + b.c * 6);
    const [x, y] = bubbleCenter(b);
    if (!app.reduceMotion) state.ripples.push({ x, y, age: 0 });
    app.refreshStatus();
    if (state.popped === TOTAL) {
      app.setHint('All popped! Flipping…');
      clearTimeout(state.autoFlipTimer);
      state.autoFlipTimer = setTimeout(() => flip(true), 650);
    }
    return true;
  }

  function flip(celebrate) {
    if (state.flip) return;
    clearTimeout(state.autoFlipTimer);
    state.flip = { start: performance.now(), swapped: false };
    Feel.whoosh();
    if (celebrate) { Feel.cheer(); Feel.pattern(3, 90, 24); }
    else Feel.pattern(2, 110, 20);
  }

  function finishFlipSwap() {
    // Turning a pop-it over makes every pressed bubble a dome again, and the
    // domes become dents.
    let popped = 0;
    for (const b of state.bubbles) {
      b.up = !b.up;
      b.t = -b.t;
      if (!b.up) popped++;
    }
    state.popped = popped;
    app.refreshStatus();
    app.setHint(toy.hint);
  }

  function down(id, x, y) {
    const b = bubbleAt(x, y);
    state.touches.set(id, { start: b, last: b, moved: false });
    if (!b || state.flip) return;
    if (b.up) { b.held = true; b.sv += 8; Feel.tick(1); }
    else b.sv += 6; // a dent just squishes a little
  }

  function move(id, x, y) {
    const p = state.touches.get(id);
    if (!p) return;
    const b = bubbleAt(x, y);
    if (b === p.last) return;
    if (!p.moved && p.start && p.start.held) popBubble(p.start);
    p.moved = true;
    if (b) popBubble(b);
    p.last = b;
  }

  function up(id, x, y, cancelled) {
    const p = state.touches.get(id);
    state.touches.delete(id);
    if (!p || !p.start || !p.start.held) return;
    if (!cancelled) popBubble(p.start);
    p.start.held = false;
  }

  // --- drawing ---
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBoard() {
    const g = state.geo, pal = PALETTES[state.palette];
    const r = g.cell * 0.55;

    // drop shadow under the silicone slab
    ctx.save();
    ctx.shadowColor = 'rgba(45,35,80,0.28)';
    ctx.shadowBlur = g.cell * 0.5;
    ctx.shadowOffsetY = g.cell * 0.18;
    roundRect(g.bx, g.by, g.bw, g.bh, r);
    ctx.fillStyle = pal[0];
    ctx.fill();
    ctx.restore();

    // colour bands, one per row
    ctx.save();
    roundRect(g.bx, g.by, g.bw, g.bh, r);
    ctx.clip();
    for (let i = 0; i < ROWS; i++) {
      const y0 = i === 0 ? g.by : g.by + g.inset + i * g.cell;
      const y1 = i === ROWS - 1 ? g.by + g.bh : g.by + g.inset + (i + 1) * g.cell;
      ctx.fillStyle = pal[i];
      ctx.fillRect(g.bx, y0, g.bw, y1 - y0 + 0.5);
    }
    // soft rubbery sheen across the slab
    const sheen = ctx.createLinearGradient(g.bx, g.by, g.bx + g.bw, g.by + g.bh);
    sheen.addColorStop(0, 'rgba(255,255,255,0.28)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0.04)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = sheen;
    ctx.fillRect(g.bx, g.by, g.bw, g.bh);
    ctx.restore();

    // raised rim
    roundRect(g.bx + 1.5, g.by + 1.5, g.bw - 3, g.bh - 3, r - 1.5);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
  }

  function drawBubble(b) {
    const g = state.geo, pal = PALETTES[state.palette];
    const color = pal[b.r];
    const [x, y] = bubbleCenter(b);
    const t = Math.max(-1.2, Math.min(1.2, b.t));
    const sq = b.squash;
    const rad = g.rad * (1 + 0.05 * t) * (1 + 0.06 * sq);

    // groove around the bubble where it meets the slab
    ctx.beginPath();
    ctx.arc(x, y, g.rad * 1.12, 0, Math.PI * 2);
    ctx.fillStyle = shade(color, -0.22);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 + 0.04 * sq, 1 - 0.04 * sq);

    // body: light comes from the top-left. A dome is bright up there; a dent
    // is shadowed up there and catches light bottom-right.
    const off = -0.38 * rad * t;
    const grad = ctx.createRadialGradient(off, off, rad * 0.05, 0, 0, rad * 1.05);
    if (t >= 0) {
      grad.addColorStop(0, shade(color, 0.55 * t));
      grad.addColorStop(0.55, shade(color, 0.08 * t));
      grad.addColorStop(1, shade(color, -0.28 * t));
    } else {
      const k = -t;
      grad.addColorStop(0, shade(color, 0.22 * k));
      grad.addColorStop(0.6, shade(color, -0.1 * k));
      grad.addColorStop(1, shade(color, -0.32 * k));
    }
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    if (t > 0) {
      // glossy highlight on a dome
      ctx.beginPath();
      ctx.ellipse(-rad * 0.36, -rad * 0.42, rad * 0.3, rad * 0.18, -0.7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.6 * Math.min(1, t)})`;
      ctx.fill();
    } else {
      // inner shadow crescent on a dent
      const k = Math.min(1, -t);
      ctx.beginPath();
      ctx.arc(0, 0, rad * 0.92, Math.PI * 0.95, Math.PI * 1.85);
      ctx.lineWidth = rad * 0.22;
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(30,20,60,${0.22 * k})`;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, rad * 0.86, Math.PI * 0.05, Math.PI * 0.75);
      ctx.lineWidth = rad * 0.12;
      ctx.strokeStyle = `rgba(255,255,255,${0.3 * k})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRipples(dt) {
    const g = state.geo;
    state.ripples = state.ripples.filter((rp) => (rp.age += dt) < 0.45);
    for (const rp of state.ripples) {
      const p = rp.age / 0.45;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, g.rad * (1.1 + p * 0.9), 0, Math.PI * 2);
      ctx.lineWidth = 4 * (1 - p);
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - p)})`;
      ctx.stroke();
    }
  }

  // --- simulation ---
  function step(dt) {
    for (const b of state.bubbles) {
      const target = b.up ? (b.held ? 0.3 : 1) : -1;
      // stiff, slightly under-damped spring: snappy with one wobble
      b.v += (520 * (target - b.t) - 18 * b.v) * dt;
      b.t += b.v * dt;
      b.sv += (-700 * b.squash - 16 * b.sv) * dt;
      b.squash += b.sv * dt;
    }
    state.pressV += (-300 * state.press - 14 * state.pressV) * dt;
    state.press += state.pressV * dt;
  }

  function frame(dt, now) {
    for (let i = 0; i < 3; i++) step(dt / 3); // sub-step the springs for stability

    const g = state.geo;
    ctx.save();
    const cx = g.W / 2, cy = g.H / 2;
    ctx.translate(cx, cy);

    let sx = 1;
    if (state.flip) {
      const dur = app.reduceMotion ? 260 : 520;
      const p = Math.min(1, (now - state.flip.start) / dur);
      sx = Math.cos(p * Math.PI);
      if (p >= 0.5 && !state.flip.swapped) { state.flip.swapped = true; finishFlipSwap(); }
      if (p >= 1) state.flip = null;
      sx = Math.max(0.02, Math.abs(sx));
    }
    const squish = 1 - Math.max(-0.02, Math.min(0.03, state.press * 0.01));
    ctx.scale(sx * squish, squish * (1 + (1 - sx) * 0.06));
    ctx.translate(-cx, -cy);

    drawBoard();
    for (const b of state.bubbles) drawBubble(b);
    drawRipples(dt);
    ctx.restore();
  }

  const toy = {
    name: 'Pop it',
    icon: '🫧',
    hint: 'Tap or swipe the bubbles',
    init(a, c) { app = a; ctx = c; },
    layout, frame, down, move, up,
    flip: () => flip(false),
    nextColour() { state.palette = (state.palette + 1) % PALETTES.length; Feel.pop(700); },
    status: () => `${state.popped} <small>/ ${TOTAL} popped</small>`,
  };
  return toy;
})();
