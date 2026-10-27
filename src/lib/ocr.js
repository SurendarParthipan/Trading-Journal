// Reads a broker trade-history screenshot (MT4/MT5 mobile style) into layers.
// OCR runs fully in the browser with tesseract.js; the English model is fetched once from its CDN and cached.
import { round } from './format';

let workerPromise;

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const w = await createWorker('eng', 1, {
        logger: (m) => m.status === 'recognizing text' && onProgress?.(m.progress),
      });
      await w.setParameters({
        tessedit_pageseg_mode: '6', // one uniform block of text
        tessedit_char_whitelist: '0123456789.,-+>/: ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
        preserve_interword_spaces: '1',
      });
      return w;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = url;
  });
}

/**
 * Broker apps draw white/red/blue text on black. Tesseract wants dark text on white,
 * so take each pixel's brightest channel (keeps coloured text bright), invert, threshold and upscale.
 */
async function preprocess(file) {
  const img = await loadImage(file);
  const scale = Math.max(1, Math.min(3, 2400 / img.width));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
  const dark = sum / (px.length / 4) / 3 < 128;
  for (let i = 0; i < px.length; i += 4) {
    let v = dark ? Math.max(px[i], px[i + 1], px[i + 2]) : Math.min(px[i], px[i + 1], px[i + 2]);
    if (dark) v = 255 - v;
    v = v < 150 ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

const PRICE_PAIR = /(\d{2,6}[.,]\d{1,5})[^\d]{1,8}?(\d{2,6}[.,]\d{1,5})/;
const HEADER = /([A-Za-z]{3,}[A-Za-z0-9._#-]*)?\s*\b(buy|sell)\b\s*(\d+[.,]\d+)?(.*)$/i;
const toNum = (s) => (s == null ? null : Number(String(s).replace(',', '.')));

export function normalizePair(symbol) {
  if (!symbol) return null;
  const base = symbol.split(/[._#-]/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{6}$/.test(base) ? `${base.slice(0, 3)}/${base.slice(3)}` : base || null;
}

/** MT4/MT5 print "2026.10.19 07:14:12"; also accept - or / separators. */
function parseWhen(s) {
  const m = s.match(/(20\d{2})[.\-/](\d{2})[.\-/](\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;
  const date = `${y}-${mo}-${d}`;
  const time = `${hh.padStart(2, '0')}:${mm}`;
  return { date, time, ts: new Date(+y, +mo - 1, +d, +hh, +mm, +(ss || 0)).getTime() };
}

/**
 * Splits scanned rows into separate trades:
 * - buys and sells are never in the same trade;
 * - layers of one setup close together, so rows whose exits sit within ~0.08% of price stay together
 *   (≈3 points on gold), and a cluster closing elsewhere becomes its own trade;
 * - rows of one cluster that are more than `gapMin` minutes apart are split as well.
 * Returns an array of row-index arrays, in screenshot order.
 */
export function groupRows(rows, { gapMin = 120 } = {}) {
  const groups = [];
  for (const dir of ['SELL', 'BUY']) {
    const idx = rows.map((r, i) => i).filter((i) => rows[i].direction === dir);
    if (!idx.length) continue;
    const withExit = idx.filter((i) => rows[i].exit != null).sort((a, b) => rows[a].exit - rows[b].exit);
    const clusters = [];
    for (const i of withExit) {
      const cur = clusters[clusters.length - 1];
      const prev = cur && rows[cur[cur.length - 1]];
      const tol = Math.max(rows[i].exit * 0.0008, 1e-6);
      if (cur && rows[i].exit - prev.exit <= tol) cur.push(i);
      else clusters.push([i]);
    }
    const noExit = idx.filter((i) => rows[i].exit == null);
    if (noExit.length) (clusters[0] || clusters[clusters.push([]) - 1]).push(...noExit);
    for (const c of clusters) {
      const timed = c.filter((i) => rows[i].ts != null).sort((a, b) => rows[a].ts - rows[b].ts);
      if (timed.length < 2) {
        groups.push(c);
        continue;
      }
      let part = [];
      timed.forEach((i, k) => {
        if (k && rows[i].ts - rows[timed[k - 1]].ts > gapMin * 60000) {
          groups.push(part);
          part = [];
        }
        part.push(i);
      });
      part.push(...c.filter((i) => rows[i].ts == null));
      groups.push(part);
    }
  }
  return groups.map((g) => [...g].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
}

/** Turns OCR text into rows of { symbol, direction, lots, entry, exit, profit, date, time }. */
export function parseBrokerText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(HEADER);
    if (!h) continue;
    // The price line is usually the next one; tolerate one junk line in between.
    let prices = null;
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      if (HEADER.test(lines[j])) break;
      const m = lines[j].match(PRICE_PAIR);
      if (m) {
        prices = m;
        break;
      }
    }
    if (!prices) continue;
    const tail = h[4] || '';
    const profitMatch = tail.match(/([-+]?\s?\d[\d ,]*[.,]\d{2})\s*$/);
    const when = parseWhen(`${lines[i]} ${prices.input}`);
    rows.push({
      date: when?.date || null,
      time: when?.time || null,
      ts: when?.ts ?? null,
      symbol: h[1] || null,
      direction: h[2].toLowerCase() === 'sell' ? 'SELL' : 'BUY',
      lots: toNum(h[3]) || null,
      entry: toNum(prices[1]),
      exit: toNum(prices[2]),
      profit: profitMatch ? toNum(profitMatch[1].replace(/[\s]/g, '').replace(/,(?=\d{3})/g, '')) : null,
    });
  }
  return rows;
}

/** Contract size implied by the broker's own profit figures (median across rows). */
export function impliedContract(rows) {
  const vals = rows
    .filter((r) => r.profit != null && r.lots && r.entry != null && r.exit != null && r.exit !== r.entry)
    .map((r) => r.profit / ((r.exit - r.entry) * (r.direction === 'SELL' ? -1 : 1) * r.lots))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (!vals.length) return null;
  return round(vals[Math.floor(vals.length / 2)], 2);
}

export async function readTradesFromImage(file, onProgress) {
  const [worker, canvas] = await Promise.all([getWorker(onProgress), preprocess(file)]);
  const { data } = await worker.recognize(canvas);
  return { rows: parseBrokerText(data.text), text: data.text };
}
