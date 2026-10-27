export const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD (never UTC, so late-night IST trades land on the right day). */
export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowTime(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDay(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

export function isWeekend(s) {
  const g = parseDay(s).getDay();
  return g === 0 || g === 6;
}

export function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** '' / null / garbage -> null, otherwise a finite number. */
export function num(v) {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function money(n, cur = '$', { sign = false, compact = false } = {}) {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  let body;
  if (compact && abs >= 10000) body = abs >= 1e6 ? `${(abs / 1e6).toFixed(2)}M` : `${(abs / 1e3).toFixed(1)}K`;
  else body = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const s = n < 0 ? '-' : sign && n > 0 ? '+' : '';
  return `${s}${cur}${body}`;
}

export const pct = (n, d = 1) => (n == null || !Number.isFinite(n) ? '—' : `${n.toFixed(d)}%`);

export function priceFmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 5 });
}

export function lotsFmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

export function fmtDate(s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!s) return '—';
  return parseDay(s).toLocaleDateString('en-GB', opts);
}

export function relDay(s) {
  const t = todayStr();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  return fmtDate(s, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function monthLabel(key, opts = { month: 'short', year: '2-digit' }) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', opts);
}

export function uid() {
  if (globalThis.crypto?.randomUUID) {
    try { return crypto.randomUUID(); } catch { /* insecure context (phone over LAN) */ }
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function timeAgo(iso) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
