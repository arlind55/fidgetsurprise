// Small colour helpers shared by the toys.
window.Paint = (() => {
  'use strict';

  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

  // amt < 0 darkens towards black, amt > 0 lightens towards white.
  function shade(h, amt) {
    const [r, g, b] = hexToRgb(h);
    const f = amt < 0 ? (x) => x * (1 + amt) : (x) => x + (255 - x) * amt;
    return `rgb(${f(r) | 0},${f(g) | 0},${f(b) | 0})`;
  }

  function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }

  return { hexToRgb, shade, rgba };
})();
