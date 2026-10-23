// REA Explained (TikTok 9:16, 45 s): pure function of time. window.seek(t) paints frame t.
// Follows docs/shotlist.md. Timing in beats (u), 120 BPM = 0.5 s/beat, 90 beats.
// Thai text is always drawn as whole strings (shaping keeps tone marks in place); only Latin runs go per glyph.
import * as M from './lib/motion.js';

const { W, H, FORMAT, E, prog, lerp, springU, SPRING, wobble, font, layout, glyph, text, fill, cover, rrect, fitSize, shake, kf } = M;

const C = { bg: '#0B0B0D', panel: '#15151A', paper: '#F4F4F0', accent: '#E5322D', dim: '#8E8E98', line: '#2A2A32' };
const DISPLAY = 'Display', UI = 'UI', MONO = 'Mono';
const S = FORMAT.safe;
const CX = S.x + S.w / 2;

const HITS = [
  [0, 'hook line 1', 'impact'],
  [2, 'hook EX5', 'pop', { pitch: 'A5' }],
  [4, 'underline', 'whoosh', { len: 0.4 }],
  [7.5, 'whip to how', 'whoosh', { len: 0.5 }],
  [8, 'flow card lands', 'thud'],
  [11, 'zoom flow', 'tick'],
  [13.5, 'whip to hopper', 'whoosh', { len: 0.4 }],
  [14, 'hopper lands', 'thud'],
  [20, 'tag pseudocode', 'pop', { pitch: 'D6' }],
  [25.5, 'whip to use cases', 'whoosh', { len: 0.5 }],
  [26, 'title', 'impact'],
  [28, 'row 1', 'pop', { pitch: 'A5' }],
  [33, 'row 2', 'pop', { pitch: 'D6' }],
  [38, 'row 3', 'pop', { pitch: 'E6' }],
  [43, 'row 4', 'pop', { pitch: 'A6' }],
  [49.5, 'whip to terminal', 'whoosh', { len: 0.5 }],
  [51, 'cmd 1', 'tick'],
  [55, 'cmd 2', 'tick'],
  [58, 'cmd 3', 'tick'],
  [63.5, 'whip to result', 'whoosh', { len: 0.5 }],
  [70, 'unsupported highlight', 'impact'],
  [73, 'stamp 1', 'thud'],
  [75, 'stamp 2', 'thud'],
  [79.5, 'whip to end', 'whoosh', { len: 0.5 }],
  [81, 'end line 1', 'pop', { pitch: 'D6' }],
  [83, 'end line 2', 'pop', { pitch: 'A5' }],
  [86, 'end line 3', 'bell', { pitch: 'D6' }],
];

// ---------------------------------------------------------------- helpers
// a line slides up from under a mask: Thai-safe (whole string, never per glyph)
function reveal(ctx, str, x, base, size, weight, family, color, u, u0, align = 'left', dur = 0.8) {
  const p = E.outQuint(prog(u, u0, u0 + dur));
  if (p <= 0) return;
  const f = font(size, weight, family);
  ctx.save();
  ctx.font = f;
  const w = ctx.measureText(str).width;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.beginPath(); ctx.rect(x0 - 20, base - size * 1.2, w + 40, size * 1.75); ctx.clip();
  text(ctx, str, x, base + (1 - p) * size * 1.3, f, color, align);
  ctx.restore();
}
function fade(ctx, str, x, base, size, weight, family, color, u, u0, align = 'left') {
  const p = E.outCubic(prog(u, u0, u0 + 0.7));
  if (p <= 0) return;
  ctx.save(); ctx.globalAlpha = p;
  text(ctx, str, x, base + (1 - p) * 24, font(size, weight, family), color, align);
  ctx.restore();
}
function card(ctx, x, y, w, h, color = C.panel, r = 28) {
  rrect(ctx, x, y, w, h, r); ctx.fillStyle = color; ctx.fill();
}
function tag(ctx, label, x, y, u, u0, color = C.accent) {
  const k = springU(u, u0, SPRING.bouncy);
  if (k <= 0) return;
  ctx.save();
  ctx.font = font(34, 500, MONO);
  const w = ctx.measureText(label).width + 44, h = 58;
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(k, k); ctx.translate(-w / 2, -h / 2);
  rrect(ctx, 0, 0, w, h, h / 2); ctx.fillStyle = color; ctx.fill();
  text(ctx, label, 22, 41, font(34, 500, MONO), C.paper);
  ctx.restore();
}
const bg = (ctx) => fill(ctx, C.bg);

// ---------------------------------------------------------------- S1 hook (u 0..8)
function sceneHook(ctx, u) {
  bg(ctx);
  shake(ctx, u, 0, 10);
  const y1 = H * 0.36;
  const line1 = 'AI ส่องไส้ในโปรแกรมได้';
  const s1 = fitSize(ctx, line1, 800, DISPLAY, S.w, 92);
  reveal(ctx, line1, CX, y1, s1, 800, DISPLAY, C.paper, u, -0.5, 'center');
  const line2 = 'แต่ไม่ใช่';
  const s2 = 92;
  reveal(ctx, line2, S.x + 4, y1 + 190, s2, 800, DISPLAY, C.paper, u, 0.5, 'left');
  // "EX5" per glyph (Latin only)
  const big = 300, f = font(big, 800, DISPLAY);
  const L = layout(ctx, 'EX5', f, -0.03 * big);
  const bx = S.x, base = y1 + 190 + 280;
  L.glyphs.forEach((g, j) => {
    const k = springU(u, 2 + j * 0.15, SPRING.bouncy);
    if (k <= 0) return;
    glyph(ctx, g.ch, bx + g.cx, base + (1 - k) * 220, f, C.accent, k, k);
  });
  // underline sweeps across
  const sw = E.outExpo(prog(u, 4, 5.2));
  ctx.fillStyle = C.accent; ctx.fillRect(S.x, base + 34, S.w * sw, 14);
  fade(ctx, 'REA · Reverse Engineer Anything', S.x + 4, base + 140, 36, 500, MONO, C.dim, u, 5.4);
}

// ---------------------------------------------------------------- S2 how it works (u 8..26)
function sceneHow(ctx, u, IMG) {
  bg(ctx);
  // headline
  reveal(ctx, 'AI สั่งงานผ่าน MCP', S.x + 4, S.y + 110, 72, 800, DISPLAY, C.paper, u, 7.5);
  reveal(ctx, 'REA ส่งต่อให้ Ghidra / Hopper / IDA', S.x + 4, S.y + 200, 46, 500, UI, C.dim, u, 7.9);

  const cw = S.w, ch = 800, cx = S.x, cy = S.y + 300;
  if (u < 14) {
    // real REA investigation-flow figure: camera walks across it
    const k = springU(u, 7.6, SPRING.gentle);
    const [fx, fy, z] = [
      kf(u, [[8, 0.5], [10.5, 0.5], [11.5, 0.17], [12.7, 0.5], [13.2, 0.86]], E.inOutCubic),
      0.55,
      kf(u, [[8, 1.0], [10.5, 1.0], [11.5, 2.1], [12.7, 2.1], [13.2, 2.1]], E.inOutCubic),
    ];
    const h = 720, y = lerp(H, cy + 40, k);
    card(ctx, cx - 8, y - 8, cw + 16, h + 16, C.paper, 30);
    if (IMG.flow) cover(ctx, IMG.flow, cx, y, cw, h, { fx, fy, zoom: z, radius: 24 });
  } else {
    // real Hopper screenshot from REA's README
    const k = springU(u, 13.6, SPRING.gentle);
    const y = lerp(H, cy, k);
    card(ctx, cx - 8, y - 8, cw + 16, ch + 16, C.line, 30);
    const drift = kf(u, [[14, 0.04], [26, 0.2]], E.inOutSine);
    if (IMG.hopper) cover(ctx, IMG.hopper, cx, y, cw, ch, { fx: drift, fy: 0.5, zoom: 2.6, radius: 24 });
    tag(ctx, 'assembly', cx + 24, y + 24, u, 17);
    tag(ctx, 'pseudocode', cx + 24 + 250, y + 24, u, 20);
    fade(ctx, 'ไม่ใช่ source ต้นฉบับ', CX, cy + ch + 130, 64, 800, DISPLAY, C.accent, u, 21.5, 'center');
  }
}

// ---------------------------------------------------------------- S3 use cases (u 26..50)
const ROWS = [
  ['01', 'แอป Electron / JavaScript', 'modules · imports · IPC · source maps', 28],
  ['02', 'ไบนารี native', 'ELF · PE · Mach-O · pseudocode', 33],
  ['03', 'แอป Android APK · .NET', 'manifest · classes · CIL', 38],
  ['04', 'เว็บไซต์ · network', 'HAR · scripts · requests', 43],
];
function sceneUse(ctx, u) {
  bg(ctx);
  reveal(ctx, 'เหมาะกับงานอะไร?', S.x + 4, S.y + 120, 84, 800, DISPLAY, C.paper, u, 25.6);
  const y0 = S.y + 250, gap = 270;
  ROWS.forEach(([n, title, sub, u0], i) => {
    const k = E.outQuint(prog(u, u0, u0 + 0.9));
    if (k <= 0) return;
    const y = y0 + i * gap;
    const dir = i % 2 ? 1 : -1;
    ctx.save();
    ctx.translate(dir * (1 - k) * 700, 0); ctx.globalAlpha = Math.min(1, k * 1.5);
    card(ctx, S.x, y, S.w, 232, C.panel, 26);
    ctx.fillStyle = C.accent; ctx.fillRect(S.x, y + 28, 10, 176);
    text(ctx, n, S.x + 44, y + 100, font(64, 500, MONO), C.accent);
    const size = fitSize(ctx, title, 800, DISPLAY, S.w - 220, 62);
    text(ctx, title, S.x + 190, y + 100, font(size, 800, DISPLAY), C.paper);
    text(ctx, sub, S.x + 190, y + 170, font(32, 500, MONO), '#B4B4BE');
    ctx.restore();
  });
}

// ---------------------------------------------------------------- S4 commands (u 50..64)
const CMDS = [
  ['npx rea-agents setup', 'ติดตั้ง', 51],
  ['rea doctor', 'เช็กความพร้อม', 55],
  ['rea inspect <file>', 'วิเคราะห์ไฟล์', 58.5],
];
function typed(str, u, u0, perBeat = 7) { return str.slice(0, Math.max(0, Math.min(str.length, Math.floor((u - u0) * perBeat)))); }
function sceneCmd(ctx, u) {
  bg(ctx);
  reveal(ctx, 'ใช้งานง่ายๆ', S.x + 4, S.y + 120, 84, 800, DISPLAY, C.paper, u, 49.6);
  const px = S.x, py = S.y + 220, pw = S.w, ph = 800;
  const k = springU(u, 49.6, SPRING.gentle);
  if (k <= 0) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, k * 2);
  card(ctx, px, py + (1 - k) * 120, pw, ph, C.panel, 28);
  ctx.translate(0, (1 - k) * 120);
  // window dots
  ['#E5322D', '#6B6B74', '#6B6B74'].forEach((c, i) => { ctx.beginPath(); ctx.arc(px + 44 + i * 34, py + 44, 10, 0, 7); ctx.fillStyle = c; ctx.fill(); });
  CMDS.forEach(([cmd, label, u0], i) => {
    const y = py + 190 + i * 210;
    if (u < u0) return;
    const s = typed(cmd, u, u0);
    text(ctx, '$', px + 40, y, font(40, 500, MONO), C.accent);
    text(ctx, s, px + 90, y, font(40, 500, MONO), C.paper);
    const done = s.length === cmd.length;
    if (!done || i === CMDS.length - 1) {
      const blink = Math.floor(u * 2) % 2 === 0;
      if (blink || !done) {
        ctx.font = font(40, 500, MONO);
        const w = ctx.measureText(s).width;
        ctx.fillStyle = C.paper; ctx.fillRect(px + 92 + w, y - 36, 22, 46);
      }
    }
    if (done) fade(ctx, label, px + 90, y + 70, 44, 500, UI, C.dim, u, u0 + cmd.length / 7);
  });
  ctx.restore();
}

// ---------------------------------------------------------------- S5 real result (u 64..80)
function sceneResult(ctx, u) {
  bg(ctx);
  shake(ctx, u, 70, 14);
  reveal(ctx, 'ทดสอบกับไฟล์ .ex5', S.x + 4, S.y + 110, 72, 800, DISPLAY, C.paper, u, 63.6);
  reveal(ctx, '(ไฟล์ทดสอบสังเคราะห์ ไม่ใช่ EA จริง)', S.x + 4, S.y + 185, 38, 500, UI, C.dim, u, 64.2);
  const px = S.x, py = S.y + 250, pw = S.w, ph = 640;
  const k = springU(u, 63.6, SPRING.gentle);
  if (k <= 0) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, k * 2);
  ctx.translate(0, (1 - k) * 100);
  card(ctx, px, py, pw, ph, C.panel, 28);
  // verbatim substrings of the real `rea inspect` output (assets/real_rea_inspect_output.json)
  const lines = [
    ['"error":', '"Analysis failed"', 65],
    ['"code":', '"target_unavailable"', 66],
    ['"message":', '"Cannot open artifact:', 67],
    ['', 'unsupported binary format', 68],
    ['', '. Check that the path exists…"', 68.5],
    ['"reason":', '"unsupported binary format"', 69],
  ];
  lines.forEach(([key, val, u0], i) => {
    const p = E.outCubic(prog(u, u0, u0 + 0.5));
    if (p <= 0) return;
    const y = py + 100 + i * 82;
    ctx.save(); ctx.globalAlpha *= p;
    if (key) text(ctx, key, px + 36, y, font(34, 500, MONO), C.dim);
    const x = key ? px + 36 + (key.length + 1) * 20.4 : px + 90;
    const hot = val.startsWith('unsupported') || key === '"reason":';
    ctx.font = font(34, 500, MONO);
    if (hot) {
      const sweep = E.outExpo(prog(u, 70, 70.8));
      const w = ctx.measureText(val).width;
      ctx.fillStyle = C.accent; ctx.fillRect(x - 10, y - 40, (w + 20) * sweep, 58);
    }
    text(ctx, val, x, y, font(34, 500, MONO), hot && u >= 70 ? C.paper : C.paper);
    ctx.restore();
  });
  ctx.restore();
  // stamps
  const sy = py + ph + 130;
  const s1 = springU(u, 73, SPRING.bouncy), s2 = springU(u, 75, SPRING.bouncy);
  const stamp = (str, y, k) => {
    if (k <= 0) return;
    ctx.save(); ctx.translate(CX, y); ctx.scale(k, k); ctx.rotate(-0.02);
    const size = fitSize(ctx, str, 800, DISPLAY, S.w, 100);
    text(ctx, str, 0, 0, font(size, 800, DISPLAY), C.accent, 'center');
    ctx.restore();
  };
  stamp('ไม่รองรับ EX5', sy, s1);
  stamp('กู้ MQ5 ไม่ได้', sy + 130, s2);
}

// ---------------------------------------------------------------- S6 end (u 80..90)
function sceneEnd(ctx, u) {
  bg(ctx);
  const y = H * 0.44;
  reveal(ctx, 'ทางที่ใช้ได้', CX, y - 130, 52, 500, UI, C.dim, u, 79.6, 'center');
  reveal(ctx, 'MQ5 ของตัวเอง', CX, y, fitSize(ctx, 'MQ5 ของตัวเอง', 800, DISPLAY, S.w, 110), 800, DISPLAY, C.paper, u, 80, 'center');
  reveal(ctx, '+ Strategy Tester', CX, y + 150, fitSize(ctx, '+ Strategy Tester', 800, DISPLAY, S.w, 100), 800, DISPLAY, C.accent, u, 83, 'center');
  reveal(ctx, '(บัญชีเดโม)', CX, y + 230, 48, 500, UI, C.dim, u, 83.6, 'center');
  const p = E.outCubic(prog(u, 86, 86.8));
  if (p > 0) {
    ctx.save(); ctx.globalAlpha = p;
    ctx.fillStyle = C.line; ctx.fillRect(S.x + 60, y + 330, S.w - 120, 3);
    text(ctx, 'ต้องมีสิทธิ์ตามข้อตกลง (EULA)', CX, y + 420, font(46, 500, UI), C.paper, 'center');
    text(ctx, 'ก่อนวิเคราะห์ซอฟต์แวร์ทุกครั้ง', CX, y + 485, font(46, 500, UI), C.paper, 'center');
    ctx.restore();
  }
}

// ---------------------------------------------------------------- scene router with whip transitions
const SCENES = [
  { a: 0, b: 8, fn: sceneHook },
  { a: 8, b: 26, fn: sceneHow },
  { a: 26, b: 50, fn: sceneUse },
  { a: 50, b: 64, fn: sceneCmd },
  { a: 64, b: 80, fn: sceneResult },
  { a: 80, b: 90.01, fn: sceneEnd },
];
const WHIP = 0.5;   // beats: A slides out as B slides in, B fully on screen at the downbeat

function draw(ctx, u, t, IMG) {
  const i = SCENES.findIndex((s) => u < s.b);
  const cur = SCENES[i < 0 ? SCENES.length - 1 : i];
  const next = SCENES[SCENES.indexOf(cur) + 1];
  if (next && u > cur.b - WHIP) {
    const p = E.inOutCubic(prog(u, cur.b - WHIP, cur.b));
    ctx.save(); ctx.translate(0, -H * p); cur.fn(ctx, u, IMG); ctx.restore();
    ctx.save(); ctx.translate(0, H * (1 - p)); next.fn(ctx, u, IMG); ctx.restore();
  } else cur.fn(ctx, u, IMG);
}

M.film({
  fonts: [font(100, 800, DISPLAY), font(40, 500, UI), font(40, 500, MONO)],
  images: { flow: 'assets/rea-investigation-flow.svg', hopper: 'assets/rea-hopper-analysis.png' },
  hits: HITS,
  draw,
});
