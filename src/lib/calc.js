import { num, round, todayStr, addDays, isWeekend, uid, fmtDate } from './format';
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

/** Closed-trade totals per calendar day: Map date → { date, net, trades, wins, losses, mistakes }. */
export function dayStats(trades, settings) {
  const m = new Map();
  for (const t of trades) {
    if (t.pnl == null) continue;
    const e = m.get(t.date) || { date: t.date, net: 0, trades: 0, wins: 0, losses: 0, mistakes: 0 };
    e.net = round(e.net + t.pnl, 2);
    e.trades += 1;
    if (t.pnl > 0) e.wins += 1;
    if (t.pnl < 0) e.losses += 1;
    if (settings && t.tags.some((tag) => isMistake(tag, settings))) e.mistakes += 1;
    m.set(t.date, e);
  }
  return m;
}

/**
 * One report per trading week (Mon–Sun), oldest first, including the current week.
 * The week's start balance includes deposits/withdrawals made before its first trade,
 * so a Monday withdrawal resets the base the growth % is measured against.
 */
export function weekReports(trades, cashflows, settings) {
  const start = Number(settings.startingCapital) || 0;
  const closed = chrono(trades).filter((t) => t.pnl != null);
  const keys = new Set([weekStart()]);
  closed.forEach((t) => keys.add(weekStart(t.date)));
  cashflows.forEach((c) => keys.add(weekStart(c.date)));
  const days = dayStats(closed, settings);
  const target = Number(settings.weeklyTargetPct) || 0;

  return [...keys].sort().map((from) => {
    const to = addDays(from, 6);
    const wt = closed.filter((t) => t.date >= from && t.date <= to);
    const wc = cashflows.filter((c) => c.date >= from && c.date <= to);
    const firstTrade = wt[0]?.date;
    const before = start
      + closed.filter((t) => t.date < from).reduce((a, t) => a + t.pnl, 0)
      + cashflows.filter((c) => c.date < from).reduce((a, c) => a + cashSigned(c), 0);
    const earlyCash = wc.filter((c) => !firstTrade || c.date <= firstTrade).reduce((a, c) => a + cashSigned(c), 0);
    const open = round(before + earlyCash, 2);
    const net = round(wt.reduce((a, t) => a + t.pnl, 0), 2);
    const cash = round(wc.reduce((a, c) => a + cashSigned(c), 0), 2);
    const dayList = [];
    for (let d = from; d <= to; d = addDays(d, 1)) if (days.has(d)) dayList.push(days.get(d));
    const sortedDays = [...dayList].sort((a, b) => b.net - a.net);
    const wins = wt.filter((t) => t.pnl > 0).length;
    const clean = wt.filter((t) => !t.tags.some((tag) => isMistake(tag, settings))).length;
    const worstTag = tagCosts(wt, settings).find((x) => x.kind === 'bad' && x.net < 0) || null;
    let bal = open;
    const curve = [{ label: 'Start', balance: open }];
    wt.forEach((t, i) => {
      bal += t.pnl;
      curve.push({ label: `#${i + 1}`, date: t.date, balance: round(bal, 2) });
    });
    const growthPct = open > 0 ? (net / open) * 100 : null;
    return {
      key: from,
      from,
      to,
      open,
      close: round(before + net + cash, 2),
      net,
      growthPct,
      deposited: round(wc.filter((c) => c.type === 'deposit').reduce((a, c) => a + c.amount, 0), 2),
      withdrawn: round(wc.filter((c) => c.type === 'withdrawal').reduce((a, c) => a + c.amount, 0), 2),
      trades: wt.length,
      wins,
      losses: wt.filter((t) => t.pnl < 0).length,
      winRate: wt.length ? (wins / wt.length) * 100 : null,
      discipline: wt.length ? (clean / wt.length) * 100 : null,
      days: dayList,
      bestDay: sortedDays.length && sortedDays[0].net > 0 ? sortedDays[0] : null,
      worstDay: sortedDays.length && sortedDays[sortedDays.length - 1].net < 0 ? sortedDays[sortedDays.length - 1] : null,
      worstTag,
      curve,
      target,
      targetPct: target > 0 && growthPct != null ? (growthPct / target) * 100 : null,
    };
  });
}

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (d) => (new Date(`${d}T00:00`).getDay() + 6) % 7;

/** Per weekday, over traded days: average day P&L, win rate, green/red day counts. */
export function weekdayStats(trades, settings) {
  const rows = WEEKDAY_NAMES.map((name, i) => ({ i, name, short: name.slice(0, 3), days: 0, green: 0, red: 0, net: 0, trades: 0, wins: 0, avg: null, winRate: null }));
  for (const d of dayStats(trades, settings).values()) {
    const r = rows[weekdayIndex(d.date)];
    r.days += 1;
    r.net = round(r.net + d.net, 2);
    r.trades += d.trades;
    r.wins += d.wins;
    if (d.net > 0) r.green += 1;
    if (d.net < 0) r.red += 1;
  }
  rows.forEach((r) => {
    r.avg = r.days ? round(r.net / r.days, 2) : null;
    r.winRate = r.trades ? (r.wins / r.trades) * 100 : null;
  });
  return rows;
}

/** Plain-language patterns from the day and week history (empty until there is enough data). */
export function tradingInsights(trades, settings, weeks, cur = '$') {
  const out = [];
  const fmt = (n) => `${n < 0 ? '-' : '+'}${cur}${Math.abs(n).toFixed(2)}`;
  const wd = weekdayStats(trades, settings).filter((r) => r.days >= 2);
  if (wd.length >= 2) {
    const best = wd.reduce((a, b) => (b.avg > a.avg ? b : a));
    const worst = wd.reduce((a, b) => (b.avg < a.avg ? b : a));
    if (best.avg > 0) out.push({ tone: 'good', text: `${best.name} is your strongest day: ${fmt(best.avg)} on average, ${best.green} of ${best.days} green.` });
    if (worst.avg < 0 && worst !== best) out.push({ tone: 'bad', text: `${worst.name} costs you the most: ${fmt(worst.avg)} on average, ${worst.red} of ${worst.days} red. Trade smaller or sit out.` });
  }
  const days = [...dayStats(trades, settings).values()];
  const green = days.filter((d) => d.net > 0);
  const red = days.filter((d) => d.net < 0);
  if (green.length >= 2 && red.length >= 2) {
    const g = green.reduce((a, d) => a + d.trades, 0) / green.length;
    const r = red.reduce((a, d) => a + d.trades, 0) / red.length;
    if (r >= g * 1.4) out.push({ tone: 'bad', text: `Red days average ${r.toFixed(1)} trades vs ${g.toFixed(1)} on green days. Losing days come from overtrading: stop after your planned setups.` });
    else if (g >= r * 1.4) out.push({ tone: 'good', text: `Green days average ${g.toFixed(1)} trades vs ${r.toFixed(1)} on red days. Your edge shows when you stay active on good setups.` });
    const redMistake = red.filter((d) => d.mistakes > 0).length;
    if (redMistake / red.length >= 0.5) out.push({ tone: 'bad', text: `${redMistake} of your ${red.length} red days had a mistake-tagged trade. Most losses are behaviour, not the market.` });
  }
  if (days.length >= 5) {
    const worst5 = [...days].sort((a, b) => a.net - b.net).slice(0, 5).filter((d) => d.net < 0);
    const counts = {};
    worst5.forEach((d) => { counts[weekdayIndex(d.date)] = (counts[weekdayIndex(d.date)] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3) out.push({ tone: 'bad', text: `${top[1]} of your ${worst5.length} worst days were ${WEEKDAY_NAMES[top[0]]}s.` });
  }
  const done = weeks.filter((w) => w.trades && w.growthPct != null);
  if (done.length >= 2) {
    const best = done.reduce((a, b) => (b.growthPct > a.growthPct ? b : a));
    const avg = done.reduce((a, w) => a + w.growthPct, 0) / done.length;
    out.push({ tone: avg >= 0 ? 'good' : 'bad', text: `Average week: ${avg >= 0 ? '+' : ''}${avg.toFixed(1)}%. Best week (${fmtDate(best.from, { day: 'numeric', month: 'short' })}) grew ${best.growthPct >= 0 ? '+' : ''}${best.growthPct.toFixed(1)}%.` });
  }
  return out;
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
