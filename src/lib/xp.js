// Gamification derived purely from journal data, so it never drifts out of sync and survives import/export.
import { cleanTradeStreak, monthly, validLayers } from './calc';
import { isMistake } from './constants';

export const RANKS = [
  { level: 1, title: 'Intern' },
  { level: 3, title: 'Junior Trader' },
  { level: 5, title: 'Trader' },
  { level: 8, title: 'Senior Trader' },
  { level: 12, title: 'Desk Head' },
  { level: 16, title: 'Portfolio Manager' },
  { level: 21, title: 'Fund Manager' },
  { level: 27, title: 'Managing Director' },
  { level: 35, title: 'Partner' },
  { level: 45, title: 'Chairman' },
];

/** XP needed to reach `level` (level 1 = 0 XP). Each level costs 60 more than the last. */
export const xpForLevel = (level) => 30 * (level - 1) * level;

export function tradeXp(t, settings) {
  let xp = 10;
  if (t.notes?.trim().length >= 20) xp += 5;
  if (t.image || t.imageLink) xp += 5;
  if (t.sl != null) xp += 5;
  if (t.tags.length && !t.tags.some((g) => isMistake(g, settings))) xp += 15;
  return xp;
}

export function checkinXp(c) {
  return 15 + (c.rulesFollowed || 0) * 3 + (c.note ? 5 : 0);
}

export const BADGES = [
  { id: 'first', name: 'First Entry', desc: 'Log your first trade', icon: 'Sparkles', test: (d) => d.trades.length >= 1 },
  { id: 't10', name: 'Logger', desc: 'Log 10 trades', icon: 'NotebookPen', test: (d) => d.trades.length >= 10 },
  { id: 't50', name: 'Archivist', desc: 'Log 50 trades', icon: 'Library', test: (d) => d.trades.length >= 50 },
  { id: 't100', name: 'Centurion', desc: 'Log 100 trades', icon: 'Shield', test: (d) => d.trades.length >= 100 },
  { id: 's3', name: 'Warming Up', desc: '3-day journal streak', icon: 'Flame', test: (d) => d.streak.best >= 3 },
  { id: 's7', name: 'On Fire', desc: '7-day journal streak', icon: 'Flame', test: (d) => d.streak.best >= 7 },
  { id: 's30', name: 'Unbreakable', desc: '30-day journal streak', icon: 'Crown', test: (d) => d.streak.best >= 30 },
  { id: 'clean5', name: 'Clean Hands', desc: '5 trades in a row without a mistake tag', icon: 'ShieldCheck', test: (d) => d.clean >= 5 },
  { id: 'sl10', name: 'Risk Manager', desc: '10 trades with a stop loss', icon: 'ShieldAlert', test: (d) => d.trades.filter((t) => t.sl != null).length >= 10 },
  { id: 'chart10', name: 'Chart Keeper', desc: '10 trades with a chart attached', icon: 'Image', test: (d) => d.trades.filter((t) => t.image || t.imageLink).length >= 10 },
  { id: 'layer10', name: 'Grid Architect', desc: 'A trade with 10+ layers', icon: 'Layers', test: (d) => d.trades.some((t) => validLayers(t.layers).length >= 10) },
  { id: 'ck10', name: 'Reflective', desc: '10 daily check-ins', icon: 'CalendarCheck', test: (d) => Object.keys(d.checkins).length >= 10 },
  { id: 'green', name: 'Green Month', desc: 'Finish a month in profit', icon: 'TrendingUp', test: (d) => monthly(d.trades).some((m) => m.net > 0 && m.trades >= 5) },
];

export function progression({ trades, checkins, settings, streak }) {
  const fromTrades = trades.reduce((a, t) => a + tradeXp(t, settings), 0);
  const fromCheckins = Object.values(checkins).reduce((a, c) => a + checkinXp(c), 0);
  const fromStreak = streak.best * 10;
  const xp = fromTrades + fromCheckins + fromStreak;

  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const title = [...RANKS].reverse().find((r) => level >= r.level).title;

  const data = { trades, checkins, streak, clean: cleanTradeStreak(trades, settings) };
  const badges = BADGES.map((b) => ({ ...b, unlocked: b.test(data) }));

  return { xp, level, title, into: xp - base, span: next - base, pct: ((xp - base) / (next - base)) * 100, badges };
}
