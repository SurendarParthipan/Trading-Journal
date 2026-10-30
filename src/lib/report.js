import { layerStats, layerPnl, resultOf, chrono } from './calc';
import { isMistake } from './constants';
import { money, pct, priceFmt, lotsFmt, fmtDate, round, todayStr } from './format';
import { imageSrc } from './image';

/**
 * Plain black-on-white trade report built from the same fields as the Trade Ledger.
 * One HTML builder feeds both outputs: the print window (Save as PDF) and a Word .doc
 * (MHTML, so screenshots travel inside the file).
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const RESULT_LABEL = { WIN: 'Win', LOSS: 'Loss', BE: 'Break-even', OPEN: 'Open' };

/** Lot-weighted exit across layers (each layer may close at its own price), else the trade's exit. */
function avgExit(t) {
  let lots = 0;
  let sum = 0;
  for (const l of t.layers) {
    const x = l.exit ?? t.exitPrice;
    if (x == null || !(l.lots > 0)) continue;
    lots += l.lots;
    sum += x * l.lots;
  }
  return lots ? round(sum / lots, 3) : t.exitPrice;
}

const CSS = `
  body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; color: #111; font-size: 10.5pt; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 2pt; }
  h2 { font-size: 13pt; margin: 18pt 0 6pt; padding-bottom: 3pt; border-bottom: 1.5pt solid #111; }
  h3 { font-size: 11.5pt; margin: 0 0 6pt; }
  .sub { color: #555; font-size: 9.5pt; margin: 0; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 8pt; }
  th, td { border: 0.75pt solid #9a9a9a; padding: 3pt 5pt; text-align: left; vertical-align: top; }
  th { background: #efefef; font-weight: bold; font-size: 9pt; }
  td.r, th.r { text-align: right; }
  td.k { background: #f7f7f7; color: #444; width: 17%; font-size: 9pt; }
  td.v { width: 16%; }
  tfoot td { font-weight: bold; background: #f7f7f7; }
  .pos { color: #0a6b2b; }
  .neg { color: #b3141b; }
  .trade { margin: 0 0 16pt; page-break-inside: avoid; break-inside: avoid; }
  .label { font-size: 8.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5pt; color: #555; margin: 8pt 0 3pt; }
  .notes { border: 0.75pt solid #9a9a9a; padding: 5pt 7pt; white-space: pre-wrap; margin: 0; }
  .muted { color: #777; font-style: italic; }
  .shot { display: block; max-width: 100%; height: auto; border: 0.75pt solid #9a9a9a; margin-top: 2pt; }
  .day { background: #e4e4e4; font-weight: bold; }
  .foot { color: #777; font-size: 8.5pt; margin-top: 18pt; }
`;

function summaryOf(trades) {
  const closed = trades.filter((t) => t.pnl != null);
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const net = closed.reduce((a, t) => a + t.pnl, 0);
  const gross = (list) => list.reduce((a, t) => a + t.pnl, 0);
  const lots = trades.reduce((a, t) => a + layerStats(t.layers).lots, 0);
  const layers = trades.reduce((a, t) => a + layerStats(t.layers).count, 0);
  const best = closed.reduce((b, t) => (b == null || t.pnl > b.pnl ? t : b), null);
  const worst = closed.reduce((b, t) => (b == null || t.pnl < b.pnl ? t : b), null);
  return {
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    be: closed.length - wins.length - losses.length,
    open: trades.length - closed.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    net,
    avgWin: wins.length ? gross(wins) / wins.length : null,
    avgLoss: losses.length ? gross(losses) / losses.length : null,
    profitFactor: losses.length ? gross(wins) / Math.abs(gross(losses)) : null,
    lots: round(lots, 3),
    avgLayers: trades.length ? layers / trades.length : null,
    best,
    worst,
  };
}

function overviewTable(list, cur) {
  let lastDate = '';
  const rows = list.map((t, i) => {
    const ls = layerStats(t.layers);
    let dayRow = '';
    if (t.date !== lastDate) {
      lastDate = t.date;
      const day = list.filter((x) => x.date === t.date);
      const dayNet = day.reduce((a, x) => a + (x.pnl || 0), 0);
      dayRow = `<tr><td class="day" colspan="9">${esc(fmtDate(t.date, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }))}</td><td class="day r"><span class="${tone(dayNet)}">${money(dayNet, cur, { sign: true })}</span></td><td class="day">${day.length} trade${day.length === 1 ? '' : 's'}</td></tr>`;
    }
    return `${dayRow}<tr>
      <td>${i + 1}</td><td>${esc(t.time || '—')}</td><td>${esc(t.pair)}</td><td>${t.direction === 'SELL' ? 'Sell' : 'Buy'}</td>
      <td>${esc(t.setup || '—')}</td><td class="r">${ls.count}</td><td class="r">${lotsFmt(ls.lots)}</td>
      <td class="r">${ls.avg == null ? '—' : priceFmt(round(ls.avg, 3))}</td><td class="r">${priceFmt(avgExit(t))}</td>
      <td class="r"><span class="${tone(t.pnl)}">${money(t.pnl, cur, { sign: true })}</span></td><td>${RESULT_LABEL[resultOf(t)]}</td>
    </tr>`;
  });
  return `<table><thead><tr>
    <th>#</th><th>Time</th><th>Pair</th><th>Side</th><th>Setup</th><th class="r">Layers</th><th class="r">Lots</th>
    <th class="r">Avg entry</th><th class="r">Avg exit</th><th class="r">P&amp;L</th><th>Result</th>
  </tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function tradeBlock(t, n, cur, settings, img) {
  const ls = layerStats(t.layers);
  const r = t.pnl != null && t.risk > 0 ? t.pnl / t.risk : null;
  const after = t.capitalBefore != null && t.pnl != null ? t.capitalBefore + t.pnl : null;
  const growth = t.capitalBefore > 0 && t.pnl != null ? (t.pnl / t.capitalBefore) * 100 : null;
  const pairs = [
    ['Date', fmtDate(t.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })],
    ['Time', t.time || '—'],
    ['Pair', t.pair],
    ['Direction', t.direction === 'SELL' ? 'Sell (short)' : 'Buy (long)'],
    ['Setup', t.setup || '—'],
    ['Result', RESULT_LABEL[resultOf(t)]],
    ['Layers', String(ls.count)],
    ['Total lots', lotsFmt(ls.lots)],
    ['Avg entry', ls.avg == null ? '—' : priceFmt(round(ls.avg, 3))],
    ['Avg exit', priceFmt(avgExit(t))],
    ['Stop loss', priceFmt(t.sl)],
    ['Take profit', priceFmt(t.tp)],
    ['Risk', t.risk ? money(t.risk, cur) : '—'],
    ['Planned R:R', t.rr ? `1:${t.rr.toFixed(2)}` : '—'],
    ['R multiple', r == null ? '—' : `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`],
    ['Fees', t.fees ? money(t.fees, cur) : '—'],
    ['Capital before', t.capitalBefore == null ? '—' : money(t.capitalBefore, cur)],
    ['Capital after', after == null ? '—' : `${money(after, cur)}${growth == null ? '' : ` (${growth >= 0 ? '+' : ''}${pct(growth, 2)})`}`],
  ];
  const grid = [];
  for (let i = 0; i < pairs.length; i += 3) {
    grid.push(`<tr>${pairs.slice(i, i + 3).map(([k, v]) => `<td class="k">${esc(k)}</td><td class="v">${esc(v)}</td>`).join('')}</tr>`);
  }

  const layers = t.layers.length
    ? `<div class="label">Layer breakdown</div>
      <table><thead><tr><th>#</th><th class="r">Entry</th><th class="r">Lots</th><th class="r">Exit</th><th class="r">P&amp;L</th></tr></thead>
      <tbody>${t.layers.map((l, i) => {
        const lp = layerPnl(l, t, t.contractSize);
        return `<tr><td>${i + 1}</td><td class="r">${priceFmt(l.price)}</td><td class="r">${lotsFmt(l.lots)}</td><td class="r">${priceFmt(l.exit ?? t.exitPrice)}</td><td class="r"><span class="${tone(lp)}">${lp == null ? '—' : money(lp, cur, { sign: true })}</span></td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="r">${ls.avg == null ? '—' : priceFmt(round(ls.avg, 3))}</td><td class="r">${lotsFmt(ls.lots)}</td><td></td><td class="r"><span class="${tone(t.pnl)}">${money(t.pnl, cur, { sign: true })}</span></td></tr></tfoot></table>
      ${t.pnlMode === 'manual' ? '<p class="sub">Net P&amp;L entered manually.</p>' : ''}`
    : '';

  const tags = t.tags.length
    ? `<div class="label">Tags</div><p style="margin:0">${t.tags.map((g) => (isMistake(g, settings) ? `<b class="neg">${esc(g)} (mistake)</b>` : esc(g))).join(' · ')}</p>`
    : '';

  const shot = img
    ? `<div class="label">Chart screenshot</div><img class="shot" src="${esc(img.src)}"${img.w ? ` width="${img.w}" height="${img.h}"` : ''} alt="${esc(t.pair)} chart" />`
    : '<div class="label">Chart screenshot</div><p class="muted" style="margin:0">No screenshot attached.</p>';
  const link = t.imageLink ? `<p class="sub" style="margin-top:3pt">TradingView: ${esc(t.imageLink)}</p>` : '';

  return `<div class="trade">
    <h3>Trade ${n} · ${esc(t.pair)} ${t.direction === 'SELL' ? 'Sell' : 'Buy'} · <span class="${tone(t.pnl)}">${money(t.pnl, cur, { sign: true })}</span></h3>
    <table>${grid.join('')}</table>
    ${layers}
    ${tags}
    <div class="label">Notes</div>
    <p class="notes${t.notes ? '' : ' muted'}">${esc(t.notes || 'No notes written for this trade.').replace(/\r?\n/g, '<br>')}</p>
    ${shot}${link}
  </div>`;
}

/** images: Map of trade id -> { src, w, h } (w/h only needed for Word). */
function buildHtml(trades, { settings, cur, images, word, label }) {
  const list = chrono(trades);
  const s = summaryOf(list);
  const name = settings.traderName || 'Trader';
  const period = list.length ? (list[0].date === list.at(-1).date ? fmtDate(list[0].date) : `${fmtDate(list[0].date)} – ${fmtDate(list.at(-1).date)}`) : '—';
  const sumRows = [
    ['Trades', String(s.count), 'Net P&L', `<span class="${tone(s.net)}">${money(s.net, cur, { sign: true })}</span>`],
    ['Wins / Losses / BE', `${s.wins} / ${s.losses} / ${s.be}${s.open ? ` (${s.open} open)` : ''}`, 'Win rate', pct(s.winRate, 1)],
    ['Average win', `<span class="pos">${money(s.avgWin, cur, { sign: true })}</span>`, 'Average loss', `<span class="neg">${money(s.avgLoss, cur, { sign: true })}</span>`],
    ['Profit factor', s.profitFactor == null ? '—' : s.profitFactor.toFixed(2), 'Total lots', lotsFmt(s.lots)],
    ['Avg layers per trade', s.avgLayers == null ? '—' : s.avgLayers.toFixed(1), 'Best / worst trade', `<span class="pos">${money(s.best?.pnl, cur, { sign: true })}</span> / <span class="neg">${money(s.worst?.pnl, cur, { sign: true })}</span>`],
  ];
  const body = `
    <h1>${esc(name)} Capital · Trade Report</h1>
    <p class="sub">${esc(label ? `${label} · ` : '')}${esc(period)} · Generated ${esc(fmtDate(todayStr()))}</p>
    <h2>Summary</h2>
    <table>${sumRows.map(([a, b, c, d]) => `<tr><td class="k">${a}</td><td class="v">${b}</td><td class="k">${c}</td><td class="v">${d}</td></tr>`).join('')}</table>
    <h2>All trades</h2>
    ${overviewTable(list, cur)}
    <h2>Trade details</h2>
    ${list.map((t, i) => tradeBlock(t, i + 1, cur, settings, images.get(t.id))).join('')}
    <p class="foot">${esc(name)} Capital trading journal.</p>`;

  const title = `${name} Capital Trade Report`;
  if (word) {
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>${CSS} @page WordSection1 { size: 595.3pt 841.9pt; margin: 54pt 48pt 54pt 48pt; } div.WordSection1 { page: WordSection1; }</style>
</head><body><div class="WordSection1">${body}</div></body></html>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>${CSS}
  @page { size: A4; margin: 14mm 12mm; }
  body { max-width: 190mm; margin: 0 auto; padding: 12mm 0; }
  .bar { position: sticky; top: 0; display: flex; gap: 8px; justify-content: flex-end; padding: 8px 0; background: #fff; border-bottom: 1px solid #ddd; margin-bottom: 12px; }
  .bar button { font: inherit; padding: 8px 14px; border: 1px solid #111; background: #111; color: #fff; border-radius: 6px; cursor: pointer; }
  .bar button.alt { background: #fff; color: #111; }
  @media print { body { padding: 0; } .bar { display: none; } }
  @media screen and (max-width: 600px) { body { padding: 0 12px 24px; font-size: 10pt; } th, td { padding: 3px 4px; } }
</style></head><body>
<div class="bar"><button class="alt" onclick="window.close()">Close</button><button onclick="window.print()">Save as PDF</button></div>
${body}
<script>
  // Wait for screenshots before opening the print dialog, otherwise they can print blank.
  Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))
    .then(() => setTimeout(() => window.print(), 300));
</script>
</body></html>`;
}

const reportName = (trades, ext) => {
  const list = chrono(trades);
  const a = list[0]?.date || todayStr();
  const b = list.at(-1)?.date || a;
  return `Trade Report ${a === b ? a : `${a} to ${b}`}.${ext}`;
};

/** Opens the report in a new tab and starts the print dialog (choose "Save as PDF"). Call straight from a click. */
export function openPdfReport(trades, opts) {
  const images = new Map();
  if (opts.screenshots !== false) {
    for (const t of trades) {
      const src = imageSrc(t);
      if (src) images.set(t.id, { src });
    }
  }
  const html = buildHtml(trades, { ...opts, images, word: false });
  const win = window.open('', '_blank');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return true;
  }
  // Pop-ups blocked: fall back to downloading the page, which prints the same way.
  download(new Blob([html], { type: 'text/html' }), reportName(trades, 'html'));
  return false;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Reads an image (data URL or web address) as base64 JPEG/PNG plus a Word-friendly display size. */
async function embedImage(src) {
  let dataUrl = src;
  if (!src.startsWith('data:')) {
    try {
      const blob = await (await fetch(src)).blob();
      dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }
  const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.*)$/i);
  if (!m) return null;
  const size = await new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => res(null);
    img.src = dataUrl;
  });
  if (!size) return null;
  const w = Math.min(640, size.w);
  return { type: m[1], b64: m[2], w, h: Math.round((size.h * w) / size.w) };
}

const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n');
const utf8b64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** Downloads a Word document (.doc in MHTML form) with the screenshots embedded. */
export async function downloadWordReport(trades, opts) {
  const images = new Map();
  const parts = [];
  if (opts.screenshots !== false) {
    let n = 0;
    for (const t of trades) {
      const src = imageSrc(t);
      if (!src) continue;
      const e = await embedImage(src);
      if (!e) {
        images.set(t.id, { src });
        continue;
      }
      n += 1;
      const loc = `file:///C:/report_files/chart${n}.${e.type.includes('png') ? 'png' : 'jpg'}`;
      images.set(t.id, { src: loc, w: e.w, h: e.h });
      parts.push({ loc, type: e.type, b64: e.b64 });
    }
  }
  const html = buildHtml(trades, { ...opts, images, word: true });
  const B = '----=_NextPart_SurendarReport';
  const out = [
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${B}"; type="text/html"`,
    '',
    `--${B}`,
    'Content-Location: file:///C:/report.htm',
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(utf8b64(html)),
    ...parts.flatMap((p) => [`--${B}`, `Content-Location: ${p.loc}`, `Content-Type: ${p.type}`, 'Content-Transfer-Encoding: base64', '', wrap76(p.b64)]),
    `--${B}--`,
    '',
  ].join('\r\n');
  download(new Blob([out], { type: 'application/msword' }), reportName(trades, 'doc'));
}
