import { useEffect, useState } from 'react';
import { useJournal } from '../lib/useJournal';
import { money } from '../lib/format';

const KEY = 'sj-booted';

/** Short "systems online" intro, once per browser session. */
export default function BootScreen() {
  const { settings, stats, streak, cur } = useJournal();
  const [phase, setPhase] = useState(() => {
    try {
      if (sessionStorage.getItem(KEY) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'done';
    } catch { /* ignore */ }
    return 'on';
  });
  const [lines, setLines] = useState(0);

  const msgs = [
    `CEO      ${String(settings.traderName || 'Trader').toUpperCase()}`,
    `CAPITAL  ${money(stats.capital, cur)}`,
    `BOOK     ${stats.total} trades · ${streak.current}d streak`,
    'DESK     OPEN · WELCOME BACK, BOSS',
  ];

  useEffect(() => {
    if (phase !== 'on') return undefined;
    try {
      sessionStorage.setItem(KEY, '1');
    } catch { /* ignore */ }
    const timers = msgs.map((_, i) => setTimeout(() => setLines(i + 1), 180 + i * 220));
    timers.push(setTimeout(() => setPhase('out'), 1500));
    timers.push(setTimeout(() => setPhase('done'), 2000));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 'on']);

  if (phase === 'done') return null;
  return (
    <div
      className={`fixed inset-0 z-[100] grid place-items-center bg-ink-950 transition-opacity duration-500 ${phase === 'out' ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      onClick={() => setPhase('done')}
    >
      <div className="w-[min(88vw,380px)] font-mono">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-teal-300/40 bg-teal-400/10 shadow-[0_0_30px_-4px_rgba(45,212,191,.7)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#5eead4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 16l5-5 4 3.5L21 6" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold tracking-[0.2em] text-white">{String(settings.traderName || 'Trader').toUpperCase()} CAPITAL</div>
            <div className="text-[10px] tracking-[0.3em] text-teal-300/70">HEAD OFFICE · OPENING</div>
          </div>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-300 shadow-[0_0_12px_#2dd4bf] transition-[width] duration-[1300ms] ease-out" style={{ width: lines ? '100%' : '4%' }} />
        </div>
        <div className="mt-4 space-y-1.5 text-[11px] tracking-wider">
          {msgs.slice(0, lines).map((m, i) => (
            <div key={m} className={`animate-fade ${i === msgs.length - 1 ? 'text-emerald-300' : 'text-zinc-400'}`}>
              {m}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
