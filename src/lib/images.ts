export interface ResizedImage {
  blob: Blob;
  w: number;
  h: number;
  type: string;
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(c: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image'))), type, quality));
}

/** Downscale so the longest edge is at most `max` px. Re-encodes (strips EXIF/GPS metadata). */
export async function resizeImage(file: Blob, max = 1600, type = 'image/jpeg', quality = 0.85): Promise<ResizedImage> {
  const bmp = await loadBitmap(file);
  const sw = bmp.width, sh = bmp.height;
  const k = Math.min(1, max / Math.max(sw, sh));
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, w, h);
  return { blob: await canvasToBlob(c, type, quality), w, h, type };
}

/** Center-crop to a square of `size` px. PNG keeps transparency (for emoji). */
export async function squareImage(file: Blob, size: number, type = 'image/png', quality = 0.9): Promise<ResizedImage> {
  const bmp = await loadBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - s) / 2, sy = (bmp.height - s) / 2;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, s, s, 0, 0, size, size);
  return { blob: await canvasToBlob(c, type, quality), w: size, h: size, type };
}

/** Render a text "sticker" emoji onto a square canvas. */
export async function textEmoji(text: string, bg: string, fg: string, size = 128): Promise<ResizedImage> {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  if (bg !== 'transparent') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = text.toUpperCase().split(/\n|\\n/).slice(0, 3);
  const longest = Math.max(...lines.map((l) => l.length), 1);
  let fs = Math.min(size * 0.8 / lines.length, (size * 0.92) / (longest * 0.62));
  fs = Math.max(10, Math.floor(fs));
  await document.fonts?.load(`700 ${fs}px "JetBrains Mono"`).catch(() => undefined);
  ctx.font = `700 ${fs}px "JetBrains Mono", ui-monospace, monospace`;
  const lh = fs * 1.02;
  lines.forEach((l, i) => ctx.fillText(l, size / 2, size / 2 + (i - (lines.length - 1) / 2) * lh));
  return { blob: await canvasToBlob(c, 'image/png', 1), w: size, h: size, type: 'image/png' };
}
