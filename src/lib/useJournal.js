import { useMemo } from 'react';
import { useStore } from './store';
import { getStats, streakInfo } from './calc';
import { progression } from './xp';

/** Store plus the derived numbers almost every view needs. */
export function useJournal() {
  const ctx = useStore();
  const { trades, checkins, settings, cashflows } = ctx.state;
  const stats = useMemo(() => getStats(trades, settings, cashflows), [trades, settings, cashflows]);
  const streak = useMemo(() => streakInfo(trades, checkins, settings.countWeekends), [trades, checkins, settings.countWeekends]);
  const xp = useMemo(() => progression({ trades, checkins, settings, streak }), [trades, checkins, settings, streak]);
  return { ...ctx, ...ctx.state, stats, streak, xp, cur: settings.currency };
}
