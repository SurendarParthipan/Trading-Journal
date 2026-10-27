import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowDownRight, ArrowUpRight, Flame, Target, Scale, Wallet, CalendarRange, Plus, CalendarCheck, CheckCircle2,
  ChevronRight, Brain, Activity, Sparkles, Pencil, Zap, Award, ArrowLeftRight,
} from 'lucide-react';
import { Card, CardHeader, PnL, ResultBadge, DirBadge, Ring, ChartTooltip, Segmented, cx } from '../components/ui';
import CashflowModal from '../components/Cashflow';
import CheckInModal from '../components/CheckIn';
import { Beam, CountMoney, CountNum, Holo, PageTitle, XpBar } from '../components/fx';
import { BadgeIcon } from '../components/Badge';
import { useJournal } from '../lib/useJournal';
import { cashSigned, equitySeries, getStats, monthly, newestFirst, resultOf, tagCosts, layerStats, weekStart } from '../lib/calc';
import { money, pct, todayStr, addDays, isWeekend, monthLabel, relDay, fmtDate, lotsFmt } from '../lib/format';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late session' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Kpi({ icon, label, children, sub, className, accent }) {
  return (
    <Card className={cx('flex flex-col justify-between gap-3 p-4 md:p-5', accent, className)}>
      <CardHeader icon={icon} eyebrow={label} />
      <div>{children}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </Card>
  );
}

export default function Dashboard({ navigate }) {
  const { trades, settings, stats, streak, cur, checkins, dispatch, xp, cashflows } = useJournal();
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [equityEdit, setEquityEdit] = useState(null);
  const [period, setPeriod] = useState(() => {
    try {
      return localStorage.getItem('sj-period') || 'week';
    } catch {
      return 'week';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('sj-period', period);
    } catch { /* ignore */ }
  }, [period]);

  // Each period starts fresh from the balance at its first day (trades + deposits/withdrawals before it).
  const periodFrom = period === 'week' ? weekStart() : period === 'month' ? `${todayStr().slice(0, 7)}-01` : null;
  const periodLabel = period === 'week' ? 'This week' : period === 'month' ? 'This month' : 'All time';
  // Exact window shown under the toggle, e.g. "Mon 26 Oct → Fri 30 Oct · day 1 of 5".
  const range = useMemo(() => {
    const today = todayStr();
    const short = (d) => fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
    if (period === 'all') {
      const first = trades.length ? trades.reduce((m, t) => (t.date < m ? t.date : m), trades[0].date) : today;
      return { text: `${fmtDate(first)} → today`, tag: 'all time', day: null };
    }
    let to;
    let days;
    if (period === 'week') {
      to = addDays(periodFrom, settings.countWeekends ? 6 : 4);
      days = [];
      for (let d = periodFrom; d <= to; d = addDays(d, 1)) if (settings.countWeekends || !isWeekend(d)) days.push(d);
    } else {
      const [y, m] = today.split('-').map(Number);
      to = todayStr(new Date(y, m, 0));
      days = [];
      for (let d = periodFrom; d <= to; d = addDays(d, 1)) days.push(d);
    }
    const done = days.filter((d) => d <= today).length;
    const tag = period === 'week'
      ? `${fmtDate(periodFrom, { day: 'numeric' })}–${fmtDate(to, { day: 'numeric', month: 'short' })}`
      : fmtDate(periodFrom, { month: 'short', year: 'numeric' });
    return {
      text: `${short(periodFrom)} → ${short(to)}`,
      tag,
      day: today > to ? 'closed' : done === 0 ? 'starts soon' : `day ${done} of ${days.length}`,
    };
  }, [period, periodFrom, trades, settings.countWeekends]);
  const pTrades = useMemo(() => (periodFrom ? trades.filter((t) => t.date >= periodFrom) : trades), [trades, periodFrom]);
  const openBal = useMemo(() => {
    if (!periodFrom) return Number(settings.startingCapital) || 0;
    const before = trades.filter((t) => t.date < periodFrom && t.pnl != null).reduce((a, t) => a + t.pnl, 0);
    const cash = cashflows.filter((c) => c.date < periodFrom).reduce((a, c) => a + cashSigned(c), 0);
    return (Number(settings.startingCapital) || 0) + before + cash;
  }, [trades, cashflows, periodFrom, settings.startingCapital]);
  const pStats = useMemo(() => getStats(pTrades, { ...settings, startingCapital: openBal }), [pTrades, settings, openBal]);
  const pGrowth = openBal ? (pStats.net / openBal) * 100 : null;
  const pUp = pStats.net >= 0;

  const equity = useMemo(() => equitySeries(pTrades, openBal), [pTrades, openBal]);
  const months = useMemo(() => monthly(trades), [trades]);
  const recent = useMemo(() => newestFirst(trades).slice(0, 5), [trades]);
  const worstHabit = useMemo(() => tagCosts(trades, settings).find((t) => t.kind === 'bad' && t.net < 0), [trades, settings]);

  const thisKey = todayStr().slice(0, 7);
  const prevKey = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return todayStr(d).slice(0, 7);
  })();
  const thisM = months.find((m) => m.key === thisKey) || { net: 0, trades: 0, wins: 0 };
  const prevM = months.find((m) => m.key === prevKey);
  const last6 = useMemo(() => {
    const out = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const k = todayStr(x).slice(0, 7);
      out.push({ key: k, label: monthLabel(k, { month: 'short' }), net: months.find((m) => m.key === k)?.net || 0 });
    }
    return out;
  }, [months]);

  const week = useMemo(() => {
    const out = [];
    let d = todayStr();
    while (out.length < 7) {
      if (settings.countWeekends || !isWeekend(d)) out.unshift({ d, done: streak.days.has(d) });
      d = addDays(d, -1);
    }
    return out;
  }, [streak.days, settings.countWeekends]);

  const pf = stats.profitFactor;
  const pfText = pf == null ? '—' : pf === Infinity ? '∞' : pf.toFixed(2);
  const up = stats.net >= 0;

  return (
    <div className="space-y-5">
      <PageTitle eyebrow={`${greeting()}, Boss · Head office · ${fmtDate(todayStr(), { weekday: 'short', day: 'numeric', month: 'short' })}`} title={`${settings.traderName || 'Trader'} Capital`} accent="acc-cyan">
        <button type="button" className="btn-primary hidden md:inline-flex" onClick={() => navigate('new')}>
          <Plus size={16} /> Log trade
        </button>
      </PageTitle>

      <div className="stagger grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {/* Hero: Net P&L + equity */}
        <Card className={cx('col-span-2 overflow-hidden p-5 md:p-6 lg:row-span-2', pUp ? 'acc-lime' : 'acc-rose')}>
          <Holo />
          <div className={cx('pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl', pUp ? 'bg-lime-400/15' : 'bg-rose-500/15')} />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-indigo-600/15 blur-3xl" />
          <CardHeader
            icon={Activity}
            eyebrow={`Net P&L · ${periodLabel}`}
            right={
              <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-xs font-semibold', pUp ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300')}>
                {pUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {pGrowth == null ? '—' : pct(Math.abs(pGrowth), 2)}
              </span>
            }
          />
          <Segmented size="sm" className="mt-3" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All' }]} />
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-zinc-400">
            <CalendarRange size={12} className="text-zinc-500" />
            <span className="text-zinc-200">{range.text}</span>
            {range.day && <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">{range.day}</span>}
          </div>
          <div className="mt-3">
            <CountMoney value={pStats.closed ? pStats.net : 0} cur={cur} sign glow display className="text-5xl font-bold tracking-tight md:text-6xl" />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-zinc-500">
              <span><span className="text-zinc-300">{pStats.closed}</span> closed</span>
              <span><span className="text-emerald-400">{pStats.wins}</span>W / <span className="text-rose-400">{pStats.losses}</span>L</span>
              {pStats.open > 0 && <span><span className="text-amber-300">{pStats.open}</span> open</span>}
              <span>exp. <span className="text-zinc-300">{money(pStats.expectancy, cur)}</span>/trade</span>
              {periodFrom && <span>opening balance <span className="text-zinc-300">{money(openBal, cur)}</span></span>}
            </div>
          </div>
          <div className="-mx-2 mt-4 h-40 md:h-[230px]">
            {equity.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equity} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashEq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={pUp ? '#a3e635' : '#fb7185'} stopOpacity={0.45} />
                      <stop offset="60%" stopColor={pUp ? '#22d3ee' : '#fb923c'} stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="dashLine" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#a78bfa" />
                      <stop offset="50%" stopColor={pUp ? '#22d3ee' : '#fb923c'} />
                      <stop offset="100%" stopColor={pUp ? '#a3e635' : '#fb7185'} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={['dataMin', 'dataMax']} />
                  <Tooltip content={<ChartTooltip cur={cur} labelFmt={(l, p) => (p[0]?.payload.date ? `${p[0].payload.label} · ${fmtDate(p[0].payload.date)}` : 'Start')} />} />
                  <Area type="monotone" dataKey="net" name="Net P&L" stroke="url(#dashLine)" strokeWidth={2.75} fill="url(#dashEq)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: pUp ? '#a3e635' : '#fb7185' }} style={{ filter: `drop-shadow(0 0 8px ${pUp ? 'rgba(163,230,53,.6)' : 'rgba(251,113,133,.6)'})` }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-xl border border-dashed border-white/[0.08] text-sm text-zinc-500">
                {periodFrom ? `No closed trades ${periodLabel.toLowerCase()} yet. Fresh start.` : 'Your equity curve appears after the first closed trade'}
              </div>
            )}
          </div>
        </Card>

        <Kpi icon={Target} accent="acc-cyan" label={`Win rate · ${range.tag}`} sub={pStats.closed ? `${pStats.wins} of ${pStats.closed} trades` : 'No closed trades yet'}>
          <div className="flex items-center justify-between gap-2">
            <CountNum value={pStats.winRate} suffix="%" display className="text-4xl font-bold text-white" />
            <Ring value={pStats.winRate} size={58} stroke={6} color={pStats.winRate >= 50 ? '#22d3ee' : '#fb7185'} />
          </div>
        </Kpi>

        <Kpi icon={Scale} accent="acc-amber" label={`Profit factor · ${range.tag}`} sub={pf == null ? 'Gross win ÷ gross loss' : pf >= 1.5 ? 'Healthy edge' : pf >= 1 ? 'Marginal edge' : 'Losing more than winning'}>
          <span className={cx('num font-display text-4xl font-bold', pf == null ? 'text-zinc-400' : pf >= 1 ? 'text-amber-300 [text-shadow:0_0_24px_rgba(251,191,36,.45)]' : 'text-loss')}>{pfText}</span>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className={cx('h-full rounded-full', pf >= 1 ? 'bg-gradient-to-r from-orange-400 to-amber-300 shadow-[0_0_12px_#fbbf24]' : 'bg-rose-500')} style={{ width: `${Math.min(100, ((pf === Infinity ? 3 : pf || 0) / 3) * 100)}%` }} />
          </div>
        </Kpi>

        <Card className="acc-violet col-span-2 overflow-hidden p-4 md:p-5">
          <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" />
          <CardHeader icon={Wallet} eyebrow="Capital under management" />
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <CountMoney value={stats.capital} cur={cur} display className="text-4xl font-bold text-white [text-shadow:0_0_30px_rgba(167,139,250,.45)]" />
            <div className="text-right font-mono text-xs text-zinc-500">
              {equityEdit == null ? (
                <button type="button" onClick={() => setEquityEdit(String(stats.start))} className="inline-flex items-center gap-1 hover:text-zinc-200" title="Edit starting equity">
                  start {money(stats.start, cur)} <Pencil size={11} />
                </button>
              ) : (
                <form
                  className="flex items-center justify-end gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = Number(equityEdit);
                    if (Number.isFinite(v) && v >= 0) dispatch({ type: 'SETTINGS', patch: { startingCapital: v } });
                    setEquityEdit(null);
                  }}
                >
                  <span>start {cur}</span>
                  <input
                    autoFocus
                    inputMode="decimal"
                    aria-label="Starting equity"
                    className="w-24 rounded-md border border-emerald-500/40 bg-ink-950 px-2 py-1 text-right text-zinc-100 outline-none"
                    value={equityEdit}
                    onChange={(e) => setEquityEdit(e.target.value.replace(/[^0-9.]/g, ''))}
                    onBlur={(e) => e.currentTarget.form.requestSubmit()}
                    onKeyDown={(e) => e.key === 'Escape' && setEquityEdit(null)}
                  />
                </form>
              )}
              <div>max DD <span className="text-rose-300">{money(-stats.maxDD, cur)}</span> ({pct(stats.maxDDPct)})</div>
              {(stats.withdrawn > 0 || stats.deposited > 0) && (
                <div>
                  {stats.deposited > 0 && <>in <span className="text-emerald-300">{money(stats.deposited, cur)}</span> </>}
                  {stats.withdrawn > 0 && <>out <span className="text-amber-300">{money(-stats.withdrawn, cur)}</span></>}
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full bg-violet-400/40" style={{ width: `${stats.capital > 0 ? Math.min(100, (Math.min(stats.start, stats.capital) / Math.max(stats.start, stats.capital)) * 100) : 0}%` }} />
            <div className={cx('h-full', up ? 'bg-gradient-to-r from-cyan-400 to-lime-300 shadow-[0_0_12px_#22d3ee]' : 'bg-rose-500')} style={{ width: `${stats.capital > 0 && stats.start ? (Math.abs(stats.net) / Math.max(stats.start, stats.capital)) * 100 : 0}%` }} />
          </div>
          <button type="button" className="btn-ghost mt-4 w-full !py-2 text-xs" onClick={() => setCashOpen(true)}>
            <ArrowLeftRight size={14} /> Deposit / Withdraw
          </button>
        </Card>

        {/* Rank */}
        <Card className="acc-violet col-span-2 overflow-hidden p-4 md:p-5 lg:col-span-4">
          <div className="pointer-events-none absolute -left-10 top-1/2 h-40 w-80 -translate-y-1/2 rounded-full bg-indigo-600/15 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 top-1/2 h-40 w-72 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex flex-1 items-center gap-4">
              <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-slate-700/80 to-emerald-900/60">
                <span className="display text-2xl font-semibold text-white">{xp.level}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="eyebrow">Trader rank</div>
                <div className="display text-xl font-semibold text-white">{xp.title}</div>
                <XpBar pct={xp.pct} className="mt-2 max-w-md" />
                <div className="mt-1 font-mono text-[11px] text-zinc-500">
                  {xp.into} / {xp.span} XP to level {xp.level + 1} · {xp.xp.toLocaleString()} total
                </div>
              </div>
            </div>
            <button type="button" onClick={() => navigate('discipline')} className="flex items-center gap-2 rounded-xl p-1 text-left transition hover:bg-white/[0.03]">
              <div className="flex -space-x-2">
                {[...xp.badges.filter((b) => b.unlocked).slice(-4), ...xp.badges.filter((b) => !b.unlocked).slice(0, 4)].slice(0, 5).map((b) => (
                  <BadgeIcon key={b.id} badge={b} size="sm" />
                ))}
              </div>
              <div className="pl-2">
                <div className="flex items-center gap-1 text-sm font-semibold text-amber-200">
                  <Award size={14} /> {xp.badges.filter((b) => b.unlocked).length}/{xp.badges.length}
                </div>
                <div className="text-[11px] text-zinc-500">badges</div>
              </div>
              <ChevronRight size={16} className="text-zinc-600" />
            </button>
          </div>
        </Card>

        {/* Streak & accountability */}
        <Card className="acc-orange col-span-2 overflow-hidden p-5">
          {streak.current > 0 && <Beam from="#fb923c" to="#fde68a" speed={10} />}
          <div className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-orange-500/20 blur-3xl" />
          <CardHeader
            icon={CalendarCheck}
            eyebrow="Discipline streak & accountability"
            right={
              <button type="button" onClick={() => navigate('discipline')} className="flex items-center text-xs text-zinc-500 hover:text-zinc-200">
                Details <ChevronRight size={14} />
              </button>
            }
          />
          <div className="mt-4 flex items-center gap-4">
            <div className={cx('grid h-16 w-16 shrink-0 place-items-center rounded-2xl border', streak.current ? 'border-orange-500/30 bg-orange-500/10' : 'border-white/[0.06] bg-white/[0.03]')}>
              <Flame size={30} className={streak.current ? 'animate-flicker text-orange-400 drop-shadow-[0_0_10px_rgba(251,146,60,.7)]' : 'text-zinc-600'} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <CountNum value={streak.current} display className="text-4xl font-bold text-orange-200 [text-shadow:0_0_24px_rgba(251,146,60,.6)]" />
                <span className="text-sm text-zinc-400">day{streak.current === 1 ? '' : 's'} journaled</span>
              </div>
              <div className="text-xs text-zinc-500">
                Best {streak.best} · {pct(streak.consistency, 0)} consistency (30d)
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-1.5">
            {week.map(({ d, done }) => (
              <div key={d} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={cx(
                    'grid h-8 w-full max-w-[40px] place-items-center rounded-lg border text-[10px] transition',
                    done ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_-2px_rgba(16,185,129,.5)]' : d === todayStr() ? 'border-dashed border-amber-500/40 text-amber-400' : 'border-white/[0.06] bg-white/[0.02] text-zinc-600',
                  )}
                >
                  {done ? <CheckCircle2 size={14} /> : '·'}
                </div>
                <span className="font-mono text-[10px] text-zinc-500">{fmtDate(d, { weekday: 'narrow' })}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            {streak.todayDone ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-sm text-emerald-200">
                <CheckCircle2 size={16} className="text-emerald-400" />
                Today is journaled{checkins[todayStr()] ? ' and checked in' : ''}. Keep the chain going.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-primary" onClick={() => navigate('new')}>
                  <Plus size={16} /> Log trade
                </button>
                <button type="button" className="btn-ghost" onClick={() => setCheckinOpen(true)}>
                  <CalendarCheck size={16} /> Check in
                </button>
                {streak.atRisk && streak.current > 0 && (
                  <p className="col-span-2 text-center text-xs text-amber-300/90">Your {streak.current}-day streak ends tonight unless you journal.</p>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Monthly */}
        <Card className="col-span-2 p-5">
          <CardHeader icon={CalendarRange} eyebrow="Monthly performance" title={monthLabel(thisKey, { month: 'long', year: 'numeric' })} />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <div className="eyebrow">Net</div>
              <PnL value={thisM.net} cur={cur} className="mt-1 block text-lg font-semibold" />
            </div>
            <div>
              <div className="eyebrow">Trades</div>
              <div className="num mt-1 font-mono text-lg font-semibold text-white">{thisM.trades}</div>
            </div>
            <div>
              <div className="eyebrow">Win rate</div>
              <div className="num mt-1 font-mono text-lg font-semibold text-white">{thisM.trades ? pct((thisM.wins / thisM.trades) * 100, 0) : '—'}</div>
            </div>
          </div>
          {prevM && (
            <div className="mt-2 text-xs text-zinc-500">
              vs {monthLabel(prevKey, { month: 'long' })}: <PnL value={thisM.net - prevM.net} cur={cur} />
            </div>
          )}
          <div className="-mx-1 mt-3 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last6} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip cur={cur} labelFmt={(l, p) => monthLabel(p[0]?.payload.key || thisKey, { month: 'long', year: 'numeric' })} />} />
                <Bar dataKey="net" name="Net P&L" radius={[6, 6, 6, 6]} maxBarSize={36}>
                  {last6.map((m) => (
                    <Cell key={m.key} fill={m.net >= 0 ? '#10b981' : '#f43f5e'} fillOpacity={m.key === thisKey ? 1 : 0.55} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Recent */}
        <Card className="col-span-2 p-5 lg:col-span-3">
          <CardHeader
            icon={Sparkles}
            eyebrow="Recent trades"
            right={
              trades.length > 0 && (
                <button type="button" onClick={() => navigate('history')} className="flex items-center text-xs text-zinc-500 hover:text-zinc-200">
                  All trades <ChevronRight size={14} />
                </button>
              )
            }
          />
          <div className="mt-3 divide-y divide-white/[0.05]">
            {recent.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-sm text-zinc-500">No trades yet. Log your first one to bring this dashboard to life.</p>
                <button type="button" className="btn-primary mt-4" onClick={() => navigate('new')}>
                  <Plus size={16} /> Log first trade
                </button>
              </div>
            )}
            {recent.map((t) => {
              const ls = layerStats(t.layers);
              return (
                <button key={t.id} type="button" onClick={() => navigate('history', { open: t.id })} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-white/[0.03]">
                  <span className={cx('h-9 w-1 shrink-0 rounded-full', t.pnl == null ? 'bg-amber-400/70' : t.pnl >= 0 ? 'bg-emerald-500' : 'bg-rose-500')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-100">{t.pair}</span>
                      <DirBadge dir={t.direction} />
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      {relDay(t.date)} · {ls.count} layer{ls.count === 1 ? '' : 's'} · {lotsFmt(ls.lots)} lots{t.setup ? ` · ${t.setup}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <PnL value={t.pnl} cur={cur} className="block text-sm font-semibold" />
                    <ResultBadge result={resultOf(t)} className="mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Habit insight */}
        <Card className="col-span-2 flex flex-col p-5 lg:col-span-1">
          <CardHeader icon={Brain} eyebrow="Psychology check" />
          {worstHabit ? (
            <div className="mt-4 flex flex-1 flex-col">
              <div className="text-sm text-zinc-400">Your costliest habit</div>
              <div className="mt-1 text-xl font-semibold text-rose-300">{worstHabit.tag}</div>
              <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-3">
                <PnL value={worstHabit.net} cur={cur} className="text-2xl font-semibold" />
                <div className="mt-1 text-xs text-zinc-500">
                  across {worstHabit.count} trade{worstHabit.count === 1 ? '' : 's'}
                </div>
              </div>
              <button type="button" onClick={() => navigate('history', { tab: 'analytics' })} className="mt-auto flex items-center pt-4 text-xs text-zinc-500 hover:text-zinc-200">
                See tag cost analysis <ChevronRight size={14} />
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-relaxed text-zinc-500">
              Tag your trades with emotions like <span className="text-rose-300">FOMO</span> or <span className="text-emerald-300">Disciplined</span>. This card will show which habit costs you the most.
            </p>
          )}
        </Card>
      </div>

      <CheckInModal open={checkinOpen} onClose={() => setCheckinOpen(false)} />
      <CashflowModal open={cashOpen} onClose={() => setCashOpen(false)} />
    </div>
  );
}
