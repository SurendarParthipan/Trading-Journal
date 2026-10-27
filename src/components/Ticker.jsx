import { useMemo } from 'react';
import { Flame, Zap } from 'lucide-react';
import { useJournal } from '../lib/useJournal';
import { newestFirst } from '../lib/calc';
import { money, pct } from '../lib/format';
import { cx } from './ui';

/** Scrolling tape of recent trades and headline stats, like a market ticker. */
export default function Ticker() {
  const { trades, stats, streak, xp, cur } = useJournal();
  const items = useMemo(() => {
    const out = [
      { k: 'equity', label: 'EQUITY', value: money(stats.capital, cur), tone: stats.net >= 0 ? 'up' : 'down' },
      { k: 'wr', label: 'WIN RATE', value: pct(stats.winRate, 0) },
      { k: 'streak', label: 'STREAK', value: `${streak.current}D`, icon: Flame },
      { k: 'lvl', label: `LVL ${xp.level}`, value: xp.title.toUpperCase(), icon: Zap },
    ];
    for (const t of newestFirst(trades).slice(0, 12)) {
      out.push({
        k: t.id,
        label: `${t.pair} ${t.direction === 'BUY' ? '▲' : '▼'}`,
        value: t.pnl == null ? 'OPEN' : money(t.pnl, cur, { sign: true }),
        tone: t.pnl == null ? 'open' : t.pnl >= 0 ? 'up' : 'down',
      });
    }
    return out;
  }, [trades, stats, streak, xp, cur]);

  if (!trades.length) return null;
  const row = items.map((it, i) => {
    const Icon = it.icon;
    return (
      <span key={`${it.k}-${i}`} className="flex shrink-0 items-center gap-2 px-5 font-mono text-[11px] tracking-wider">
        {Icon && <Icon size={12} className="text-orange-400" />}
        <span className="text-zinc-500">{it.label}</span>
        <span className={cx('font-semibold', it.tone === 'up' ? 'text-emerald-400' : it.tone === 'down' ? 'text-rose-400' : it.tone === 'open' ? 'text-amber-300' : 'text-zinc-200')}>{it.value}</span>
        <span className="ml-3 h-1 w-1 rounded-full bg-zinc-700" />
      </span>
    );
  });

  return (
    <div className="relative overflow-hidden border-b border-white/[0.06] bg-ink-950/70 py-2 backdrop-blur [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
      <div className="ticker-track" style={{ '--ticker-speed': `${Math.max(30, items.length * 4)}s` }}>
        <div className="flex">{row}</div>
        <div className="flex" aria-hidden>{row}</div>
      </div>
    </div>
  );
}
