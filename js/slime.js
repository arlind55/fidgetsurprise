// Slime: a tub of glossy goo. Poking sinks a dimple, dragging stretches the
// slime with your finger, and it oozes slowly back when you let go.
(window.Toys = window.Toys || {}).slime = (() => {
  'use strict';

  const COLOURS = ['#5ee07a', '#a774ff', '#4cc3ff', '#ff6fc0', '#ffc23d'];
  const SPACING = 15;      // px between mesh points
  const LIGHT = norm([-0.45, -0.6, 0.66]);
  const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
  const { shade, hexToRgb } = window.Paint;

  function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }

  let app, ctx;
  const state = {
    colour: 0,
    tub: null,
    nx: 0, ny: 0,
    rx: null, ry: null, ox: null, oy: null, vx: null, vy: null, h: null, hv: null,
    grabs: new Map(),
    sparkles: [],
    pokes: 0,
    time: 0,
  };

  function layout(W, H) {
    const pad = 6;
    const tw = W - pad * 2, th = H - pad * 2;
    state.tub = { x: pad, y: pad, w: tw, h: th, r: Math.min(tw, th) * 0.12 };
    const nx = Math.max(10, Math.round(tw / SPACING) + 1);
    const ny = Math.max(10, Math.round(th / SPACING) + 1);
    const n = nx * ny;
    Object.assign(state, {
      nx, ny,
      rx: new Float32Array(n), ry: new Float32Array(n),
      ox: new Float32Array(n), oy: new Float32Array(n),
      vx: new Float32Array(n), vy: new Float32Array(n),
      h: new Float32Array(n), hv: new Float32Array(n),
    });
    state.grabs.clear();
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        state.rx[k] = pad + (i / (nx - 1)) * tw;
        state.ry[k] = pad + (j / (ny - 1)) * th;
      }
    }
    state.sparkles = [];
    for (let s = 0; s < 70; s++) {
      state.sparkles.push({
        u: 0.04 + Math.random() * 0.92, v: 0.04 + Math.random() * 0.92,
        phase: Math.random() * Math.PI * 2, size: 0.8 + Math.random() * 1.6,
        gold: Math.random() < 0.35,
      });
    }
  }

  function nearest(x, y) {
    const { tub, nx, ny } = state;
    const i = Math.round(((x - tub.x) / tub.w) * (nx - 1));
    const j = Math.round(((y - tub.y) / tub.h) * (ny - 1));
    return [Math.max(0, Math.min(nx - 1, i)), Math.max(0, Math.min(ny - 1, j))];
  }

  function down(id, x, y) {
    const { nx, ny, rx, ry, ox, oy } = state;
    const sigma = 46;
    const [ci, cj] = nearest(x, y);
    const reach = Math.ceil((sigma * 3) / SPACING);
    const idx = [], w = [], ox0 = [], oy0 = [], wp = [];
    for (let j = Math.max(1, cj - reach); j <= Math.min(ny - 2, cj + reach); j++) {
      for (let i = Math.max(1, ci - reach); i <= Math.min(nx - 2, ci + reach); i++) {
        const k = j * nx + i;
        const d2 = (rx[k] + ox[k] - x) ** 2 + (ry[k] + oy[k] - y) ** 2;
        const wt = Math.exp(-d2 / (2 * sigma * sigma));
        if (wt < 0.02) continue;
        idx.push(k); w.push(wt); ox0.push(ox[k]); oy0.push(oy[k]);
        wp.push(Math.exp(-d2 / (2 * 26 * 26)));
      }
    }
    state.grabs.set(id, { x0: x, y0: y, x, y, idx, w, ox0, oy0, wp, travelled: 0, lx: x, ly: y });
    state.pokes++;
    Feel.tick(2);
    Feel.gloop(1);
    app.refreshStatus();
  }

  function move(id, x, y) {
    const g = state.grabs.get(id);
    if (!g) return;
    g.x = x; g.y = y;
    g.travelled += Math.hypot(x - g.lx, y - g.ly);
    g.lx = x; g.ly = y;
    if (g.travelled > 55) {
      g.travelled = 0;
      Feel.gloop(0.45);
      Feel.tick(1);
    }
  }

  function up(id) {
    if (!state.grabs.delete(id)) return;
    Feel.tick(2);
    Feel.plop();
  }

  function step(dt) {
    const { nx, ny, ox, oy, vx, vy, h, hv } = state;
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        const lx = ox[k - 1] + ox[k + 1] + ox[k - nx] + ox[k + nx] - 4 * ox[k];
        const ly = oy[k - 1] + oy[k + 1] + oy[k - nx] + oy[k + nx] - 4 * oy[k];
        const lh = h[k - 1] + h[k + 1] + h[k - nx] + h[k + nx] - 4 * h[k];
        // weak pull home + strong neighbour coupling + heavy damping = ooze
        vx[k] += (-7 * ox[k] + 140 * lx - 5 * vx[k]) * dt;
        vy[k] += (-7 * oy[k] + 140 * ly - 5 * vy[k]) * dt;
        hv[k] += (-5 * h[k] + 70 * lh - 4.5 * hv[k]) * dt;
      }
    }
    const n = nx * ny;
    for (let k = 0; k < n; k++) {
      ox[k] += vx[k] * dt; oy[k] += vy[k] * dt; h[k] += hv[k] * dt;
    }

    const pull = Math.min(1, dt * 25), sink = Math.min(1, dt * 12);
    for (const g of state.grabs.values()) {
      const dx = g.x - g.x0, dy = g.y - g.y0;
      for (let m = 0; m < g.idx.length; m++) {
        const k = g.idx[m], w = g.w[m];
        let tx = g.ox0[m] + dx * w * 0.95, ty = g.oy0[m] + dy * w * 0.95;
        const len = Math.hypot(tx, ty), max = 170;
        if (len > max) { tx *= max / len; ty *= max / len; }
        ox[k] += (tx - ox[k]) * pull; oy[k] += (ty - oy[k]) * pull;
        vx[k] *= 0.85; vy[k] *= 0.85;
        h[k] += (-1.1 * g.wp[m] - h[k]) * sink * g.wp[m];
      }
    }
  }

  function frame(dt) {
    state.time += dt;
    for (let i = 0; i < 2; i++) step(dt / 2);

    const { tub, nx, ny, rx, ry, ox, oy, h } = state;
    const colour = COLOURS[state.colour];
    const [br, bg, bb] = hexToRgb(colour);
    const HS = 1.6; // how strongly dimples tilt the surface

    // tub
    ctx.save();
    ctx.shadowColor = 'rgba(45,35,80,0.25)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.beginPath();
    ctx.roundRect(tub.x, tub.y, tub.w, tub.h, tub.r);
    ctx.fillStyle = shade(colour, -0.45);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tub.x, tub.y, tub.w, tub.h, tub.r);
    ctx.clip();
    ctx.lineWidth = 0.8;
    ctx.lineJoin = 'round';
    const area0 = SPACING * SPACING;
    // Paint the resting goo in one go; only cells that are dented or
    // stretched get drawn on top.
    const flatAdd = Math.pow(HALF[2], 60) * 210, flatLit = 0.55 + 0.5 * LIGHT[2];
    const fr = Math.min(255, br * flatLit + flatAdd) | 0;
    const fg = Math.min(255, bg * flatLit + flatAdd) | 0;
    const fb = Math.min(255, bb * flatLit + flatAdd) | 0;
    ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
    ctx.fillRect(tub.x, tub.y, tub.w, tub.h);
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx + 1, d = a + nx;
        const ax = rx[a] + ox[a], ay = ry[a] + oy[a];
        const bx = rx[b] + ox[b], by = ry[b] + oy[b];
        const cx = rx[c] + ox[c], cy = ry[c] + oy[c];
        const dx = rx[d] + ox[d], dy = ry[d] + oy[d];

        const hA = h[a] * HS, hB = h[b] * HS, hC = h[c] * HS, hD = h[d] * HS;
        const gx = (hB + hC - hA - hD) * 0.5, gy = (hD + hC - hA - hB) * 0.5;
        const nl = Math.hypot(gx, gy, 1);
        const n0 = -gx / nl, n1 = -gy / nl, n2 = 1 / nl;
        const diff = n0 * LIGHT[0] + n1 * LIGHT[1] + n2 * LIGHT[2];
        const spec = Math.pow(Math.max(0, n0 * HALF[0] + n1 * HALF[1] + n2 * HALF[2]), 60);
        // stretched goo goes thin and bright, bunched goo goes deep
        const area = Math.abs((cx - ax) * (dy - by) - (cy - ay) * (dx - bx)) / 2;
        const stretch = Math.max(-0.4, Math.min(1.2, area / area0 - 1));
        const lit = 0.55 + 0.5 * diff;
        const add = stretch * 38 + spec * 210;
        const r = Math.min(255, br * lit + add) | 0;
        const g = Math.min(255, bg * lit + add) | 0;
        const bl = Math.min(255, bb * lit + add) | 0;
        if (Math.abs(r - fr) + Math.abs(g - fg) + Math.abs(bl - fb) < 3) continue;
        const col = `rgb(${r},${g},${bl})`;

        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.strokeStyle = col;
        ctx.fill();
        ctx.stroke();
      }
    }

    // The rim rolls down into the tub: lit along the top-left, shaded along
    // the bottom-right. Drawn as smooth inner shadows so the flat goo stays
    // seamless.
    const rim = (color, blur, dx, dy) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(tub.x - 200, tub.y - 200, tub.w + 400, tub.h + 400);
      ctx.roundRect(tub.x, tub.y, tub.w, tub.h, tub.r);
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = dx;
      ctx.shadowOffsetY = dy;
      ctx.fillStyle = '#000';
      ctx.fill('evenodd');
      ctx.restore();
    };
    rim('rgba(20,10,40,0.45)', 26, -7, -9);
    rim('rgba(255,255,255,0.55)', 16, 5, 6);
    const gloss = ctx.createRadialGradient(tub.x + tub.w * 0.28, tub.y + tub.h * 0.16, 0, tub.x + tub.w * 0.28, tub.y + tub.h * 0.16, tub.w * 0.5);
    gloss.addColorStop(0, 'rgba(255,255,255,0.22)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(tub.x, tub.y, tub.w, tub.h);

    // glitter rides along inside the goo
    for (const s of state.sparkles) {
      const fx = s.u * (nx - 1), fy = s.v * (ny - 1);
      const i = Math.min(nx - 2, fx | 0), j = Math.min(ny - 2, fy | 0);
      const u = fx - i, v = fy - j;
      const a = j * nx + i, b = a + 1, c = a + nx + 1, d = a + nx;
      const lerp2 = (A, O) =>
        (A[a] + O[a]) * (1 - u) * (1 - v) + (A[b] + O[b]) * u * (1 - v) +
        (A[c] + O[c]) * u * v + (A[d] + O[d]) * (1 - u) * v;
      const x = lerp2(rx, ox), y = lerp2(ry, oy);
      const tw = 0.45 + 0.55 * Math.max(0, Math.sin(state.time * 2.6 + s.phase));
      ctx.fillStyle = s.gold ? `rgba(255,236,150,${0.85 * tw})` : `rgba(255,255,255,${0.9 * tw})`;
      ctx.beginPath();
      ctx.arc(x, y, s.size * (0.7 + 0.5 * tw), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // tub lip
    ctx.beginPath();
    ctx.roundRect(tub.x + 1, tub.y + 1, tub.w - 2, tub.h - 2, tub.r);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
  }

  return {
    name: 'Slime',
    icon: '🟢',
    hint: 'Poke it, stretch it, squish it',
    init(a, c) { app = a; ctx = c; },
    layout, frame, down, move, up,
    nextColour() { state.colour = (state.colour + 1) % COLOURS.length; Feel.gloop(0.7); },
    status: () => `${state.pokes} <small>pokes</small>`,
  };
})();
