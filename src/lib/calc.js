import { num, round, todayStr, addDays, isWeekend, uid } from './format';
import { isMistake } from './constants';

export const dirSign = (d) => (d === 'SELL' ? -1 : 1);

export function validLayers(layers = []) {
  return layers.filter((l) => num(l.price) != null && num(l.lots) > 0);
}

export function layerStats(layers) {
  const v = validLayers(layers);
  const lots = v.reduce((a, l) => a + num(l.lots), 0);
  const avg = lots ? v.reduce((a, l) => a + num(l.price) * num(l.lots), 0) / lots : null;
  return { lots: round(lots, 4), avg, count: v.length };
}

/** P&L of one layer in account currency; null while it has no exit price. */
export function layerPnl(layer, trade, contract) {
  const exit = num(layer.exit) ?? num(trade.exitPrice);
  if (exit == null || num(layer.price) == null || !num(layer.lots)) return null;
  return (exit - num(layer.price)) * num(layer.lots) * contract * dirSign(trade.direction);
}

/** Net P&L after fees, or null for an open trade. */
export function computePnl(trade, contract) {
  if (trade.pnlMode === 'manual') {
    const v = num(trade.pnlManual);
    return v == null ? null : round(v, 2);
  }
  const v = validLayers(trade.layers);
  if (!v.length) return null;
  let total = 0;
  for (const l of v) {
    const p = layerPnl(l, trade, contract);
    if (p == null) return null;
    total += p;
  }
  return round(total - (num(trade.fees) || 0), 2);
}

export function riskPlan(trade, contract, capital) {
  const { lots, avg } = layerStats(trade.layers);
  const sl = num(trade.sl);
  const tp = num(trade.tp);
  const s = dirSign(trade.direction);
  const risk = avg != null && sl != null ? (avg - sl) * s * lots * contract : null;
  const reward = avg != null && tp != null ? (tp - avg) * s * lots * contract : null;
  const rr = risk > 0 && reward != null && reward > 0 ? reward / risk : null;
  const riskPct = risk > 0 && capital > 0 ? (risk / capital) * 100 : null;
  return { lots, avg, risk, reward, rr, riskPct, slWrongSide: risk != null && risk <= 0, tpWrongSide: reward != null && reward <= 0 };
}

export function resultOf(t) {
  if (t.pnl == null) return 'OPEN';
  if (t.pnl > 0) return 'WIN';
  if (t.pnl < 0) return 'LOSS';
  return 'BE';
}

const sortKey = (t) => `${t.date}T${t.time || '00:00'}|${t.createdAt || ''}`;
export const chrono = (trades) => [...trades].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
export const newestFirst = (trades) => chrono(trades).reverse();

/** Turns raw/imported/form data into a clean, fully-computed trade record. */
export function normalizeTrade(r, fallbackContract = 100) {
  const srcLayers = Array.isArray(r.layers) && r.layers.length
    ? r.layers
    : r.entryPrice != null || r.entry != null
      ? [{ price: r.entryPrice ?? r.entry, lots: r.lots ?? r.lotSize ?? r.volume ?? 0.01 }]
      : [];
  const now = new Date().toISOString();
  const t = {
    id: r.id ? String(r.id) : uid(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : todayStr(r.date ? new Date(r.date) : new Date()),
    time: r.time || '',
    pair: String(r.pair || r.symbol || r.asset || 'XAU/USD').toUpperCase().trim(),
    direction: /sell|short/i.test(String(r.direction || r.side || r.type || '')) ? 'SELL' : 'BUY',
    setup: r.setup || r.strategy || '',
    capitalBefore: num(r.capitalBefore),
    layers: srcLayers.map((l) => ({
      id: l.id || uid(),
      price: num(l.price ?? l.entry),
      lots: num(l.lots ?? l.lot ?? l.size),
      exit: num(l.exit),
    })),
    exitPrice: num(r.exitPrice ?? r.exit),
    sl: num(r.sl ?? r.stopLoss),
    tp: num(r.tp ?? r.takeProfit),
    fees: num(r.fees) || 0,
    pnlMode: r.pnlMode === 'manual' ? 'manual' : 'auto',
    pnlManual: num(r.pnlManual),
    tags: Array.isArray(r.tags)
      ? r.tags.map(String)
      : typeof r.tags === 'string' ? r.tags.split(/[;,|]/).map((s) => s.trim()).filter(Boolean) : [],
    notes: r.notes || '',
    image: r.image || null,
    imageLink: r.imageLink || '',
    contractSize: num(r.contractSize) || fallbackContract,
    createdAt: r.createdAt || now,
    updatedAt: r.updatedAt || r.createdAt || now,
  };
  // A record that only carries a P&L figure (e.g. from another journal) keeps it as a manual value.
  if (t.pnlMode === 'auto' && !validLayers(t.layers).length && num(r.pnl) != null) {
    t.pnlMode = 'manual';
    t.pnlManual = num(r.pnl);
  }
  t.pnl = computePnl(t, t.contractSize);
  const plan = riskPlan(t, t.contractSize);
  t.risk = plan.risk > 0 ? round(plan.risk, 2) : null;
  t.rr = plan.rr != null ? round(plan.rr, 2) : null;
  return t;
}

/** Signed balance effect of a deposit (+), withdrawal (−) or balance correction (±). */
export const cashSigned = (c) => (c.type === 'withdrawal' ? -Math.abs(c.amount) : c.type === 'deposit' ? Math.abs(c.amount) : c.amount);

export function normalizeCashflow(r) {
  const amount = num(r?.amount);
  if (!r || amount == null) return null;
  const type = ['deposit', 'withdrawal', 'adjustment'].includes(r.type) ? r.type : 'adjustment';
  return {
    id: r.id ? String(r.id) : uid(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : todayStr(),
    type,
    amount: type === 'adjustment' ? round(amount, 2) : round(Math.abs(amount), 2),
    note: r.note || '',
    createdAt: r.createdAt || new Date().toISOString(),
  };
}

/** Monday of the current (or given) week, as YYYY-MM-DD. Forex weeks run Mon–Fri. */
export function weekStart(d = todayStr()) {
  const dow = (new Date(`${d}T00:00`).getDay() + 6) % 7;
  return addDays(d, -dow);
}

export function getStats(trades, settings, cashflows = []) {
  const start = Number(settings.startingCapital) || 0;
  const closed = chrono(trades).filter((t) => t.pnl != null);
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const net = round(grossWin - grossLoss, 2);

  let bal = start;
  let peak = start;
  let maxDD = 0;
  let maxDDPct = 0;
  for (const t of closed) {
    bal += t.pnl;
    peak = Math.max(peak, bal);
    const dd = peak - bal;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDPct = peak > 0 ? (dd / peak) * 100 : 0;
    }
  }
  const withR = closed.filter((t) => t.risk > 0);
  return {
    total: trades.length,
    closed: closed.length,
    open: trades.length - closed.length,
    wins: wins.length,
    losses: losses.length,
    be: closed.length - wins.length - losses.length,
    net,
    grossWin,
    grossLoss,
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? -grossLoss / losses.length : null,
    expectancy: closed.length ? net / closed.length : null,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.pnl)) : null,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.pnl)) : null,
    avgR: withR.length ? withR.reduce((a, t) => a + t.pnl / t.risk, 0) / withR.length : null,
    maxDD,
    maxDDPct,
    start,
    deposited: round(cashflows.filter((c) => c.type === 'deposit').reduce((a, c) => a + c.amount, 0), 2),
    withdrawn: round(cashflows.filter((c) => c.type === 'withdrawal').reduce((a, c) => a + c.amount, 0), 2),
    cashNet: round(cashflows.reduce((a, c) => a + cashSigned(c), 0), 2),
    capital: round(start + net + cashflows.reduce((a, c) => a + cashSigned(c), 0), 2),
    growthPct: start ? (net / start) * 100 : null,
  };
}

export function equitySeries(trades, start) {
  let bal = Number(start) || 0;
  let peak = bal;
  const out = [{ n: 0, label: 'Start', balance: round(bal, 2), net: 0, pnl: 0, dd: 0 }];
  chrono(trades).filter((t) => t.pnl != null).forEach((t, i) => {
    bal += t.pnl;
    peak = Math.max(peak, bal);
    out.push({
      n: i + 1,
      date: t.date,
      label: `#${i + 1}`,
      pair: t.pair,
      balance: round(bal, 2),
      net: round(bal - start, 2),
      pnl: t.pnl,
      dd: round(bal - peak, 2),
    });
  });
  return out;
}

export function monthly(trades) {
  const m = new Map();
  for (const t of trades) {
    if (t.pnl == null) continue;
    const k = t.date.slice(0, 7);
    const e = m.get(k) || { key: k, net: 0, trades: 0, wins: 0 };
    e.net = round(e.net + t.pnl, 2);
    e.trades += 1;
    if (t.pnl > 0) e.wins += 1;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

export function byKey(trades, keyFn) {
  const m = new Map();
  for (const t of trades) {
    if (t.pnl == null) continue;
    const k = keyFn(t) || '—';
    const e = m.get(k) || { key: k, net: 0, trades: 0, wins: 0 };
    e.net = round(e.net + t.pnl, 2);
    e.trades += 1;
    if (t.pnl > 0) e.wins += 1;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.net - a.net);
}

/** Net P&L and loss total of trades carrying each tag. */
export function tagCosts(trades, settings) {
  const m = new Map();
  for (const t of trades) {
    if (t.pnl == null) continue;
    for (const tag of t.tags) {
      const e = m.get(tag) || { tag, kind: isMistake(tag, settings) ? 'bad' : 'good', count: 0, net: 0, lost: 0, wins: 0 };
      e.count += 1;
      e.net = round(e.net + t.pnl, 2);
      if (t.pnl < 0) e.lost = round(e.lost + t.pnl, 2);
      if (t.pnl > 0) e.wins += 1;
      m.set(tag, e);
    }
  }
  return [...m.values()].sort((a, b) => a.net - b.net);
}

/** Cumulative net P&L per mistake tag, one row per trading day (for the "cost over time" chart). */
export function tagTimeline(trades, tags) {
  const run = Object.fromEntries(tags.map((t) => [t, 0]));
  const rows = [];
  for (const t of chrono(trades)) {
    if (t.pnl == null) continue;
    let touched = false;
    for (const tag of tags) {
      if (t.tags.includes(tag)) {
        run[tag] = round(run[tag] + t.pnl, 2);
        touched = true;
      }
    }
    if (!touched) continue;
    const last = rows[rows.length - 1];
    if (last && last.date === t.date) Object.assign(last, run);
    else rows.push({ date: t.date, ...run });
  }
  return rows;
}

export function journalDays(trades, checkins) {
  const s = new Set(trades.map((t) => t.date));
  Object.keys(checkins || {}).forEach((d) => s.add(d));
  return s;
}

/**
 * Journaling streak. A day "counts" when it is a weekday (or any day when weekends are on).
 * Uncounted days never break a streak but add to it when journaled.
 * Today not yet journaled keeps yesterday's streak alive ("at risk").
 */
export function streakInfo(trades, checkins, countWeekends) {
  const days = journalDays(trades, checkins);
  const today = todayStr();
  const counts = (d) => countWeekends || !isWeekend(d);
  const todayDone = days.has(today);

  let current = 0;
  let d = todayDone ? today : addDays(today, -1);
  for (let g = 0; g < 4000; g++) {
    if (days.has(d)) current++;
    else if (counts(d)) break;
    d = addDays(d, -1);
  }

  let best = 0;
  let run = 0;
  const sorted = [...days].sort();
  if (sorted.length) {
    let x = sorted[0];
    while (x <= today) {
      if (days.has(x)) best = Math.max(best, ++run);
      else if (counts(x) && x !== today) run = 0;
      x = addDays(x, 1);
    }
  }
  best = Math.max(best, current);

  let last30 = 0;
  let last30Counted = 0;
  for (let i = 0; i < 30; i++) {
    const x = addDays(today, -i);
    if (counts(x)) {
      last30Counted++;
      if (days.has(x)) last30++;
    }
  }

  return {
    current,
    best,
    todayDone,
    atRisk: !todayDone && counts(today),
    days,
    consistency: last30Counted ? (last30 / last30Counted) * 100 : 0,
    totalDays: days.size,
  };
}

/** Consecutive most-recent closed trades without any mistake tag. */
export function cleanTradeStreak(trades, settings) {
  let n = 0;
  for (const t of newestFirst(trades)) {
    if (t.tags.some((tag) => isMistake(tag, settings))) break;
    n++;
  }
  return n;
}

export function disciplineScore(trades, checkins, settings, lookback = 20) {
  const recent = newestFirst(trades).slice(0, lookback);
  const clean = recent.filter((t) => !t.tags.some((tag) => isMistake(tag, settings))).length;
  const tradeScore = recent.length ? (clean / recent.length) * 100 : null;
  const cks = Object.entries(checkins || {}).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, lookback).map(([, c]) => c);
  const withRules = cks.filter((c) => c.rulesTotal > 0);
  const ruleScore = withRules.length
    ? (withRules.reduce((a, c) => a + c.rulesFollowed / c.rulesTotal, 0) / withRules.length) * 100
    : null;
  const parts = [tradeScore, ruleScore].filter((v) => v != null);
  return {
    score: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null,
    tradeScore,
    ruleScore,
    sample: recent.length,
  };
}
