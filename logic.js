// Ting Tang Ring - core puzzle model, solver and level generator (original design).
// Shared by the browser (window.TTR) and node tests (module.exports).
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const W = 1000, H = 1000;            // world size (letterboxed to screen)
  const GAP = 0.80;                    // gap opening (radians, ~46deg)
  const RELEASE_TOL = 0.24;            // gap centre within this of a crossing -> link slips off
  const TAB_TOL = 0.26;                // tab within this of a crossing -> blocked (tab can't pass a ring)
  const STEP = 0.02;                   // rotation step for collision stepping
  const COLORS = ['#F796A0', '#FFDE7D', '#8CD6AA', '#8CB8F0', '#C4A0E8', '#FFB882', '#9EDCDC'];

  const norm = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

  function crossings(A, B) {
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
    if (d >= A.r + B.r || d <= Math.abs(A.r - B.r) || d === 0) return null;
    const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d);
    const h = Math.acos(Math.max(-1, Math.min(1, a / A.r)));
    const base = Math.atan2(dy, dx);
    return [base - h, base + h];
  }
  const partners = (s, i) => s.links.filter(l => l[0] === i || l[1] === i).map(l => l[0] === i ? l[1] : l[0]);
  const hasLink = (s, i, j) => s.links.some(l => (l[0] === i && l[1] === j) || (l[0] === j && l[1] === i));

  // Is ring i blocked (a tab sits on a crossing with a linked partner) at rotation rot / position p?
  function blockedAt(s, i, rot, px, py) {
    const A = Object.assign({}, s.rings[i], { x: px ?? s.rings[i].x, y: py ?? s.rings[i].y });
    for (const j of partners(s, i)) {
      const cr = crossings(A, s.rings[j]); if (!cr) continue;
      for (const c of cr) for (const t of A.tabs) if (Math.abs(norm(rot + t - c)) < TAB_TOL) return true;
      // partner's tabs vs partner's crossings change when A slides
      const B = s.rings[j], crb = crossings(B, A);
      if (crb && (px !== undefined)) for (const c of crb) for (const t of B.tabs) if (Math.abs(norm(B.rot + t - c)) < TAB_TOL) return true;
    }
    return false;
  }

  function gapAtCrossing(A, B) {
    const cr = crossings(A, B); if (!cr) return true;
    return cr.some(c => Math.abs(norm(A.rot - c)) < RELEASE_TOL);
  }

  // Remove released links and vanish rings with no links left. Returns events.
  function settle(s) {
    const ev = [];
    s.links = s.links.filter(([i, j]) => {
      const A = s.rings[i], B = s.rings[j];
      if (gapAtCrossing(A, B) || gapAtCrossing(B, A)) { ev.push({ type: 'unlink', i, j }); return false; }
      return true;
    });
    s.rings.forEach((r, i) => {
      if (r.alive && partners(s, i).length === 0) { r.alive = false; ev.push({ type: 'free', i }); }
    });
    return ev;
  }

  // Twist ring i by delta, stopping at a tab collision. Returns rotation applied.
  function tryRotate(s, i, delta) {
    const r = s.rings[i]; let done = 0;
    const dir = Math.sign(delta), n = Math.ceil(Math.abs(delta) / STEP);
    for (let k = 0; k < n; k++) {
      const st = dir * Math.min(STEP, Math.abs(delta) - k * STEP);
      if (blockedAt(s, i, r.rot + st)) break;
      r.rot += st; done += st;
      if (settle(s).length) { s._pending = (s._pending || []); }
      if (!r.alive) break;
    }
    return done;
  }
  // Rotate with event collection
  function rotateCollect(s, i, delta) {
    const r = s.rings[i], ev = []; let done = 0;
    const dir = Math.sign(delta), n = Math.ceil(Math.abs(delta) / STEP);
    for (let k = 0; k < n && r.alive; k++) {
      const st = dir * Math.min(STEP, Math.abs(delta) - k * STEP);
      if (blockedAt(s, i, r.rot + st)) { ev.push({ type: 'bump', i }); break; }
      r.rot += st; done += st; ev.push(...settle(s));
    }
    return { done, ev };
  }

  // Slide ring i by (dx,dy): stays threaded on its partners, never passes through other rings.
  function canPlace(s, i, x, y) {
    const A = s.rings[i];
    const b = s.tray || { x0: 0, y0: 0, x1: W, y1: H };
    if (x - A.r < b.x0 + 40 || x + A.r > b.x1 - 40 || y - A.r < b.y0 + 40 || y + A.r > b.y1 - 40) return false;
    for (let j = 0; j < s.rings.length; j++) {
      if (j === i || !s.rings[j].alive) continue;
      const B = s.rings[j], d = Math.hypot(B.x - x, B.y - y);
      if (hasLink(s, i, j)) { if (d < Math.abs(A.r - B.r) + 40 || d > A.r + B.r - 40) return false; }
      else if (d < A.r + B.r + 8 && d > Math.abs(A.r - B.r) - 8) return false;
    }
    return !blockedAt(s, i, A.rot, x, y);
  }
  function slideCollect(s, i, dx, dy) {
    const A = s.rings[i], ev = [];
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
    for (let k = 0; k < n && A.alive; k++) {
      const sx = dx / n, sy = dy / n;
      if (canPlace(s, i, A.x + sx, A.y + sy)) { A.x += sx; A.y += sy; }
      else if (canPlace(s, i, A.x + sx, A.y)) A.x += sx;
      else if (canPlace(s, i, A.x, A.y + sy)) A.y += sy;
      else { ev.push({ type: 'bump', i }); break; }
      ev.push(...settle(s));
    }
    return ev;
  }

  // Can ring i twist to rotation target without a tab hitting a partner? returns signed delta or null
  function reach(s, i, target) {
    const r = s.rings[i];
    const fwd = ((target - r.rot) % TAU + TAU) % TAU, opts = [fwd, fwd - TAU].sort((a, b) => Math.abs(a) - Math.abs(b));
    for (const d of opts) {
      let ok = true; const n = Math.ceil(Math.abs(d) / STEP);
      for (let k = 1; k <= n; k++) if (blockedAt(s, i, r.rot + Math.sign(d) * Math.min(k * STEP, Math.abs(d)))) { ok = false; break; }
      if (ok) return d;
    }
    return null;
  }

  // Greedy solver (releasing a link never removes options, so greedy is complete for twist moves).
  function solve(s0, limit = 60) {
    const s = clone(s0), moves = [];
    while (s.rings.some(r => r.alive) && moves.length < limit) {
      let best = null;
      for (const [a, b] of s.links) for (const [i, j] of [[a, b], [b, a]]) {
        const cr = crossings(s.rings[i], s.rings[j]); if (!cr) continue;
        for (const c of cr) { const d = reach(s, i, c); if (d !== null && (!best || Math.abs(d) < Math.abs(best.delta))) best = { i, j, delta: d }; }
      }
      if (!best) return null;
      moves.push(best);
      rotateCollect(s, best.i, best.delta);
      settle(s);
    }
    return s.rings.some(r => r.alive) ? null : moves;
  }

  function clone(s) { return JSON.parse(JSON.stringify({ rings: s.rings, links: s.links, n: s.n })); }

  function finish(rings, n) {
    const s = { n, rings: rings.map((r, k) => Object.assign({ alive: true, color: COLORS[k % COLORS.length], tabs: [], gripOff: Math.PI }, r)), links: [] };
    for (let i = 0; i < s.rings.length; i++) for (let j = i + 1; j < s.rings.length; j++) if (crossings(s.rings[i], s.rings[j])) s.links.push([i, j]);
    return s;
  }

  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // Hand-tuned starters
  const HAND = {
    1: () => finish([
      { x: 390, y: 500, r: 150, rot: Math.PI, gripOff: Math.PI * 0.75 },
      { x: 610, y: 500, r: 150, rot: 0, gripOff: -Math.PI * 0.25 }], 1),
    2: () => finish([
      { x: 270, y: 470, r: 135, rot: Math.PI * 0.5, gripOff: Math.PI * 0.5 + 0.0, tabs: [] },
      { x: 500, y: 520, r: 135, rot: -Math.PI * 0.5, gripOff: Math.PI, tabs: [] },
      { x: 730, y: 470, r: 135, rot: Math.PI * 0.5, gripOff: -Math.PI * 0.5 - 0.9, tabs: [] }], 2),
  };

  function initialOK(s) {
    for (const [i, j] of s.links) if (gapAtCrossing(s.rings[i], s.rings[j]) || gapAtCrossing(s.rings[j], s.rings[i])) return false;
    for (let i = 0; i < s.rings.length; i++) if (blockedAt(s, i, s.rings[i].rot)) return false;
    return true;
  }
  function lockedLinks(s) { // links that cannot be released by any single twist right now
    let c = 0;
    for (const [a, b] of s.links) {
      let ok = false;
      for (const [i, j] of [[a, b], [b, a]]) { const cr = crossings(s.rings[i], s.rings[j]); for (const x of cr) if (reach(s, i, x) !== null) ok = true; }
      if (!ok) c++;
    }
    return c;
  }

  function generate(n) {
    const R = rng(n * 9973 + 17);
    const count0 = Math.min(7, 2 + Math.floor((n + 1) / 3));
    const tabsMax = n < 5 ? 1 : n < 10 ? 2 : 3;
    const wantLocked0 = Math.min(count0 - 2, Math.max(0, Math.floor((n - 2) / 3)));
    for (let attempt = 0; attempt < 16000; attempt++) {
      const count = Math.max(3, count0 - Math.floor(attempt / 4000)), wantLocked = Math.min(count - 2, wantLocked0);
      const rad = count <= 3 ? 135 : count <= 5 ? 118 : 102;
      const rings = [{ x: 500 + (R() - 0.5) * 80, y: 500 + (R() - 0.5) * 80, r: rad * (0.9 + R() * 0.2) }];
      let tries = 0;
      while (rings.length < count && tries++ < 300) {
        const p = rings[Math.floor(R() * rings.length)], r = rad * (0.85 + R() * 0.3), a = R() * TAU;
        const d = (p.r + r) * (0.58 + R() * 0.14), x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (x - r < 70 || x + r > W - 70 || y - r < 70 || y + r > H - 70) continue;
        let ok = true;
        for (const q of rings) {
          const e = Math.hypot(q.x - x, q.y - y);
          const proper = e > Math.abs(q.r - r) + 60 && e < q.r + r - 60;
          if (!proper && e < q.r + r + 20) { ok = false; break; }
        }
        if (ok) rings.push({ x, y, r });
      }
      if (rings.length < count) continue;
      const cx = rings.reduce((a, r) => a + r.x, 0) / count, cy = rings.reduce((a, r) => a + r.y, 0) / count;
      for (const r of rings) {
        r.rot = R() * TAU; r.tabs = [];
        const k = Math.floor(R() * (tabsMax + 1));
        for (let t = 0; t < k * 3 && r.tabs.length < k; t++) {
          const o = 0.9 + R() * (TAU - 1.8);
          if (r.tabs.every(u => Math.abs(norm(u - o)) > 0.7)) r.tabs.push(o);
        }
        const out = Math.atan2(r.y - cy, r.x - cx) || R() * TAU;
        r.gripOff = norm(out - r.rot);
        // keep grip clear of gap and tabs
        for (let t = 0; t < 12 && (Math.abs(norm(r.gripOff)) < 0.7 || r.tabs.some(u => Math.abs(norm(u - r.gripOff)) < 0.5)); t++) r.gripOff += 0.35;
      }
      for (const r of rings) { // grip points to the clearest open space
        let best = null;
        for (let k = 0; k < 36; k++) {
          const off = k * TAU / 36; if (Math.abs(norm(off)) < 0.75 || r.tabs.some(u => Math.abs(norm(u - off)) < 0.5)) continue;
          const a = r.rot + off, bx = r.x + Math.cos(a) * (r.r + 60), by = r.y + Math.sin(a) * (r.r + 60);
          let sc = Math.min(bx - 40, W - 40 - bx, by - 40, H - 40 - by) * 0.5;
          for (const q of rings) if (q !== r) sc = Math.min(sc, Math.abs(Math.hypot(bx - q.x, by - q.y) - q.r) - 30);
          if (!best || sc > best.sc) best = { sc, off };
        }
        if (best) r.gripOff = best.off;
      }
      const s = finish(rings, n);
      if (!initialOK(s)) continue;
      if (lockedLinks(s) < wantLocked - Math.floor((attempt % 4000) / 1300)) continue;
      const sol = solve(s); if (!sol) continue;
      return s;
    }
    throw new Error('generator failed for level ' + n);
  }

  const cache = {};
  function getLevel(n) { if (!cache[n]) cache[n] = HAND[n] ? HAND[n]() : generate(n); return clone(cache[n]); }

  const api = { TAU, W, H, GAP, COLORS, norm, crossings, partners, settle, rotateCollect, slideCollect, solve, clone, getLevel, initialOK, lockedLinks, SHIPPED: 15, tryRotate, canPlace };
  if (typeof module !== 'undefined') module.exports = api; else root.TTR = api;
})(this);
