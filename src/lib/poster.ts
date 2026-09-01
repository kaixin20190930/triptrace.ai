// Ported from public/app.js downloadMemoryPoster() + helpers (wrapText, computeTagWrap,
// colorMix, hexToRgb, roundRect, loadImage, slugify). Layout logic kept 1:1 — this canvas
// code went through many rounds of tuning (header/title overlap, orphan punctuation,
// fixed-vs-dynamic height) and should not be "simplified" without re-testing each case.
import type { Memory } from "./memory-types";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_load_failed"));
    image.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, _lineHeight: number, font: string): string[] {
  ctx.font = font;
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines: string[] = [];
  let current = words.shift()!;
  words.forEach((word) => {
    const next = `${current} ${word}`;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      return;
    }
    lines.push(current);
    current = word;
  });
  lines.push(current);

  const chunked: string[] = [];
  lines.forEach((line) => {
    if (ctx.measureText(line).width <= maxWidth) {
      chunked.push(line);
      return;
    }
    let currentLine = "";
    Array.from(line).forEach((char) => {
      const next = `${currentLine}${char}`;
      if (ctx.measureText(next).width <= maxWidth) {
        currentLine = next;
        return;
      }
      if (currentLine) chunked.push(currentLine);
      currentLine = char;
    });
    if (currentLine) chunked.push(currentLine);
  });
  return chunked;
}

function computeTagWrap(ctx: CanvasRenderingContext2D, tags: string[], maxWidth: number) {
  const lines: string[][] = [];
  let current: string[] = [];
  let currentWidth = 0;
  tags.forEach((tag) => {
    const width = ctx.measureText(tag).width + 44;
    if (current.length && currentWidth + width > maxWidth) {
      lines.push(current);
      current = [];
      currentWidth = 0;
    }
    current.push(tag);
    currentWidth += width + 12;
  });
  if (current.length) lines.push(current);
  return { lines, height: Math.max(lines.length, 1) * 52 };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function hexToRgb(hex: string) {
  const normalized = String(hex || "").replace("#", "").trim();
  const value = normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized;
  const parsed = Number.parseInt(value || "0", 16);
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 };
}

function colorMix(base: string, mix: string, ratio: number): string {
  const baseRgb = hexToRgb(base);
  const mixRgb = hexToRgb(mix);
  const blend = (a: number, b: number) => Math.round(a * ratio + b * (1 - ratio));
  return `rgb(${blend(baseRgb.r, mixRgb.r)}, ${blend(baseRgb.g, mixRgb.g)}, ${blend(baseRgb.b, mixRgb.b)})`;
}

export function slugify(value: string): string {
  return (
    String(value || "triptrace-memory")
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "triptrace-memory"
  );
}

function collectPosterPhotos(memory: Memory): string[] {
  const urls = [...(memory.photoUrls || []), memory.coverPhotoUrl].filter(
    (src): src is string => Boolean(src),
  );
  return [...new Set(urls)].slice(0, 4);
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  ctx.restore();
}

function drawPhotoCollage(
  ctx: CanvasRenderingContext2D,
  images: HTMLImageElement[],
  width: number,
  height: number,
) {
  const gap = 4;
  if (images.length === 1) {
    drawCoverImage(ctx, images[0], 0, 0, width, height);
    return;
  }
  if (images.length === 2) {
    const cellWidth = (width - gap) / 2;
    drawCoverImage(ctx, images[0], 0, 0, cellWidth, height);
    drawCoverImage(ctx, images[1], cellWidth + gap, 0, cellWidth, height);
    return;
  }
  if (images.length === 3) {
    const leadWidth = Math.round(width * 0.62);
    const sideWidth = width - leadWidth - gap;
    const sideHeight = (height - gap) / 2;
    drawCoverImage(ctx, images[0], 0, 0, leadWidth, height);
    drawCoverImage(ctx, images[1], leadWidth + gap, 0, sideWidth, sideHeight);
    drawCoverImage(ctx, images[2], leadWidth + gap, sideHeight + gap, sideWidth, sideHeight);
    return;
  }

  const cellWidth = (width - gap) / 2;
  const cellHeight = (height - gap) / 2;
  images.slice(0, 4).forEach((image, index) => {
    drawCoverImage(
      ctx,
      image,
      (index % 2) * (cellWidth + gap),
      Math.floor(index / 2) * (cellHeight + gap),
      cellWidth,
      cellHeight,
    );
  });
}

export type PosterOptions = {
  moodLabel: string;
  language: "zh" | "en";
  isDark: boolean;
};

export async function downloadMemoryPoster(memory: Memory, opts: PosterOptions): Promise<void> {
  const title = memory.title || "一段值得保存的人生旅迹";
  const story = memory.story || "";
  const tags = (memory.tags || []).slice(0, 5);
  const place = memory.place || "";
  const moodLabel = opts.moodLabel;
  const date = memory.date || new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  const photos = collectPosterPhotos(memory);
  const isDark = opts.isDark;

  const bgWarm = isDark ? "#12100c" : "#f2ece0";
  const surface = isDark ? "#1c1a14" : "#fffdf9";
  const ink = isDark ? "#f0e8d8" : "#1a1712";
  const muted = isDark ? "#968a7a" : "#7a6f62";
  const lineClr = isDark ? "#2e2a22" : "#ddd4c4";
  const brand = "#b07d3a";
  const brandStrong = "#8a5f26";
  const goldLight = "rgba(201,168,76,0.18)";
  const goldStroke = "rgba(176,125,58,0.45)";

  const W = 1080;
  const pad = 80;
  const photoH = photos.length ? Math.round(W * 0.42) : 0;

  const tmpC = document.createElement("canvas");
  tmpC.width = W;
  tmpC.height = 200;
  const tmp = tmpC.getContext("2d")!;

  await Promise.all([
    document.fonts.load(`700 72px "Noto Serif SC"`),
    document.fonts.load(`400 36px "Noto Sans SC"`),
    document.fonts.load(`600 28px "Noto Sans SC"`),
  ]).catch(() => {});

  const serifFont = (sz: number) =>
    `700 ${sz}px "Noto Serif SC", "Source Han Serif SC", "STSong", "SimSun", "Songti SC", Georgia, serif`;
  const sansFont = (sz: number, w = 400) =>
    `${w} ${sz}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "WenQuanYi Micro Hei", "Hiragino Sans GB", Inter, system-ui, sans-serif`;

  const TITLE_STEPS = [
    { size: 72, lineH: 92 },
    { size: 60, lineH: 78 },
    { size: 50, lineH: 66 },
  ];
  let titleFontSize = 72;
  let titleLineH = 92;
  let titleLines: string[] = [];
  for (const step of TITLE_STEPS) {
    titleFontSize = step.size;
    titleLineH = step.lineH;
    titleLines = wrapText(tmp, title, W - pad * 2, step.size, serifFont(step.size));
    if (titleLines.length <= 2) break;
  }

  const bodyFontSize = 34;
  const bodyLineH = 60;
  const headerH = 110;
  const footerH = 90;

  const rawBodyLines = wrapText(tmp, story, W - pad * 2, bodyFontSize, sansFont(bodyFontSize));
  const bodyLines = rawBodyLines.reduce<string[]>((acc, line, i) => {
    const trimmed = line.trim();
    const leadMatch = trimmed.match(/^[。！？…、，；：」』】〕〉》）]+/);
    if (i > 0 && leadMatch) {
      acc[acc.length - 1] += leadMatch[0];
      const rest = trimmed.slice(leadMatch[0].length);
      if (rest) acc.push(rest);
    } else {
      acc.push(trimmed || line);
    }
    return acc;
  }, []);

  tmp.font = sansFont(28, 600);
  const tagWrap = computeTagWrap(tmp, tags, W - pad * 2);
  const tagsH = tags.length ? tagWrap.height + 44 : 0;

  let H: number;
  let titleBaselineY: number;
  let MAX_BODY_LINES: number;

  if (photos.length) {
    H = 1350;
    titleBaselineY = photoH + titleFontSize + 36;
    const afterTitle = titleBaselineY + titleLines.length * titleLineH + 40;
    const space = H - footerH - afterTitle - tagsH - 44 - bodyLineH;
    MAX_BODY_LINES = Math.max(3, Math.floor(space / bodyLineH));
  } else {
    MAX_BODY_LINES = 7;
    const estBodyLines = Math.min(bodyLines.length, MAX_BODY_LINES);
    const estTruncated = bodyLines.length > MAX_BODY_LINES;
    const contentH =
      titleLines.length * titleLineH + 40 + estBodyLines * bodyLineH + (estTruncated ? bodyLineH : 0) + 44 + tagsH;
    const available = Math.max(contentH + 80, 800);
    H = headerH + available + footerH;
    const topPad = (available - contentH) / 2;
    titleBaselineY = headerH + topPad + titleFontSize;
  }

  const truncated = bodyLines.length > MAX_BODY_LINES;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  ctx.fillStyle = bgWarm;
  ctx.fillRect(0, 0, W, H);

  if (photos.length) {
    try {
      const images = await Promise.all(photos.map(loadImage));
      drawPhotoCollage(ctx, images, W, photoH);

      const grad = ctx.createLinearGradient(0, photoH * 0.35, 0, photoH);
      grad.addColorStop(0, "rgba(18,10,0,0)");
      grad.addColorStop(1, "rgba(18,10,0,0.78)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, photoH);

      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = serifFont(30);
      ctx.fillText("TripTrace.ai", pad, pad + 8);

      ctx.fillStyle = "rgba(255,255,255,0.80)";
      ctx.font = sansFont(26);
      const metaParts = [place && `⌖ ${place}`, moodLabel, date].filter(Boolean).join("   ·   ");
      ctx.fillText(metaParts, pad, photoH - 44);
    } catch {
      // fall through to no-photo path below if the image fails to load
    }
  }

  ctx.fillStyle = surface;
  ctx.fillRect(0, photoH, W, H - photoH);

  if (photos.length) {
    ctx.fillStyle = brand;
    ctx.fillRect(pad, photoH + 16, 56, 3);
  }

  if (!photos.length) {
    const hGrad = ctx.createLinearGradient(0, 0, W, 0);
    hGrad.addColorStop(0, brandStrong);
    hGrad.addColorStop(1, brand);
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, W, 110);

    ctx.fillStyle = "rgba(255,255,255,0.93)";
    ctx.font = serifFont(32);
    ctx.fillText("TripTrace.ai", pad, 72);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = sansFont(26);
    const dateW = ctx.measureText(date).width;
    ctx.fillText(date, W - pad - dateW, 72);
  }

  let y = titleBaselineY;
  ctx.fillStyle = ink;
  titleLines.forEach((line) => {
    ctx.font = serifFont(titleFontSize);
    ctx.fillText(line, pad, y);
    y += titleLineH;
  });

  y += 52;
  ctx.fillStyle = muted;
  const visibleBody = bodyLines.slice(0, MAX_BODY_LINES);
  visibleBody.forEach((line) => {
    ctx.font = sansFont(bodyFontSize);
    ctx.fillText(line, pad, y);
    y += bodyLineH;
  });
  if (truncated) {
    ctx.fillStyle = colorMix(surface, muted, 0.55);
    ctx.font = sansFont(32);
    ctx.fillText("……", pad, y);
    y += bodyLineH;
  }

  if (tags.length) {
    y += 36;
    ctx.font = sansFont(28, 600);
    tagWrap.lines.forEach((items) => {
      let x = pad;
      items.forEach((tag) => {
        const tw = ctx.measureText(tag).width + 44;
        ctx.fillStyle = goldLight;
        roundRect(ctx, x, y - 34, tw, 52, 26);
        ctx.fill();
        ctx.strokeStyle = goldStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = brandStrong;
        ctx.font = sansFont(28, 600);
        ctx.fillText(tag, x + 22, y);
        x += tw + 14;
      });
      y += 66;
    });
  }

  const footerY = H - footerH;
  ctx.strokeStyle = lineClr;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, footerY + 16);
  ctx.lineTo(W - pad, footerY + 16);
  ctx.stroke();

  ctx.fillStyle = brand;
  ctx.font = serifFont(28);
  ctx.fillText("TripTrace.ai", pad, footerY + 55);

  const tagline = opts.language === "zh" ? "人生是一段旅程，留下你的 Trace" : "Life is a journey. Leave your Trace.";
  ctx.fillStyle = muted;
  ctx.font = sansFont(24);
  const tlW = ctx.measureText(tagline).width;
  ctx.fillText(tagline, W - pad - tlW, footerY + 55);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob_failed"))), "image/png");
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(title)}-triptrace.png`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
