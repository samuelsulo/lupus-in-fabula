import * as THREE from "three";

/** Tiny deterministic generator so the textures look the same on every client. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 2;
  return texture;
}

function shade(base: [number, number, number], delta: number): string {
  const [r, g, b] = base.map((c) => Math.max(0, Math.min(255, Math.round(c + delta))));
  return `rgb(${r},${g},${b})`;
}

function grain(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(40, 22, 10, ${0.05 + random() * 0.1})`;
    const gy = y + random() * h;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.bezierCurveTo(
      x + w * 0.3,
      gy + (random() - 0.5) * 4,
      x + w * 0.7,
      gy + (random() - 0.5) * 4,
      x + w,
      gy,
    );
    ctx.stroke();
  }
}

/** Warm wooden floor boards. */
export function floorTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512);
  const random = prng(11);
  const rows = 8;
  const base: [number, number, number] = [150, 100, 58];
  for (let row = 0; row < rows; row++) {
    const y = (row * 512) / rows;
    const h = 512 / rows;
    let x = -random() * 200;
    while (x < 512) {
      const w = 180 + random() * 160;
      ctx.fillStyle = shade(base, (random() - 0.5) * 36);
      ctx.fillRect(x, y, w, h);
      grain(ctx, random, x, y, w, h);
      ctx.fillStyle = "rgba(30, 16, 8, 0.55)";
      ctx.fillRect(x, y, 2, h);
      x += w;
    }
    ctx.fillStyle = "rgba(30, 16, 8, 0.6)";
    ctx.fillRect(0, y, 512, 2);
  }
  return toTexture(canvas, 5, 4);
}

/** Horizontal log-cabin wall. */
export function logWallTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512);
  const random = prng(5);
  const rows = 5;
  const base: [number, number, number] = [128, 84, 48];
  for (let row = 0; row < rows; row++) {
    const y = (row * 512) / rows;
    const h = 512 / rows;
    const tone = (random() - 0.5) * 24;
    const gradient = ctx.createLinearGradient(0, y, 0, y + h);
    gradient.addColorStop(0, shade(base, tone - 38));
    gradient.addColorStop(0.35, shade(base, tone + 14));
    gradient.addColorStop(0.7, shade(base, tone));
    gradient.addColorStop(1, shade(base, tone - 46));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y, 512, h);
    grain(ctx, random, 0, y, 512, h);
    for (let knot = 0; knot < 2; knot++) {
      if (random() < 0.5) continue;
      const kx = random() * 512;
      ctx.strokeStyle = "rgba(35, 18, 8, 0.45)";
      ctx.beginPath();
      ctx.ellipse(kx, y + h / 2, 9, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return toTexture(canvas, 3, 1.4);
}

/** Irregular fieldstone for the chimney. */
export function stoneTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512);
  const random = prng(23);
  ctx.fillStyle = "#3b3631";
  ctx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) {
    let x = -random() * 60;
    const h = 64;
    while (x < 512) {
      const w = 60 + random() * 70;
      const tone = 96 + random() * 50;
      ctx.fillStyle = `rgb(${tone + 12},${tone + 4},${tone - 8})`;
      ctx.beginPath();
      // Older browsers lack roundRect: plain rectangles still read as stones.
      if (ctx.roundRect) ctx.roundRect(x + 3, row * h + 3, w - 6, h - 6, 12);
      else ctx.rect(x + 3, row * h + 3, w - 6, h - 6);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x + 8, row * h + 7, w - 18, 6);
      x += w;
    }
  }
  return toTexture(canvas, 1.5, 2);
}

/** Woven rug: rings of red, cream and green around a diamond. */
export function rugTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512);
  const c = 256;
  const rings: [number, string][] = [
    [256, "#4a1d1a"],
    [244, "#a8442f"],
    [226, "#e9d9b5"],
    [214, "#2f5a3a"],
    [190, "#a8442f"],
    [168, "#e9d9b5"],
    [160, "#7a2c24"],
  ];
  ctx.clearRect(0, 0, 512, 512);
  for (const [radius, color] of rings) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#e9d9b5";
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const r = i % 2 === 0 ? 120 : 60;
    ctx.lineTo(c + Math.cos(angle) * r, c + Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2f5a3a";
  ctx.beginPath();
  ctx.arc(c, c, 34, 0, Math.PI * 2);
  ctx.fill();
  // Fringe of fine weave lines.
  const random = prng(2);
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(0,0,0,${random() * 0.07})`;
    ctx.fillRect(random() * 512, random() * 512, 18, 1);
  }
  const texture = toTexture(canvas, 1, 1);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** A soft fabric weave used for sofas and armchairs. */
export function fabricTexture(color: string): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 128; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  return toTexture(canvas, 2, 2);
}
