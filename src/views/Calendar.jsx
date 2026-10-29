import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  CalendarDays, ChevronLeft, ChevronRight, CalendarRange, Lightbulb, TrendingUp, TrendingDown, Target, Pencil, ListOrdered, Sun,
} from 'lucide-react';
import { Card, CardHeader, PnL, ResultBadge, DirBadge, Modal, ChartTooltip, cx } from '../components/ui';
import { PageTitle } from '../components/fx';
import { useJournal } from '../lib/useJournal';
import { chrono, dayStats, weekReports, weekdayStats, tradingInsights, weekStart, layerStats } from '../lib/calc';
import { money, pct, todayStr, addDays, fmtDate, lotsFmt, pad } from '../lib/format';

/** Short cell figure: +$84, -$1.2K. */
function shortMoney(n, cur) {
  const a = Math.abs(n);
  const body = a >= 1000 ? `${(a / 1000).toFixed(1)}K` : a >= 100 ? Math.round(a) : a.toFixed(a >= 10 ? 0 : 1);
  return `${n < 0 ? '-' : n > 0 ? '+' : ''}${cur}${body}`;
}

/** Green/red fill whose strength follows the size of the day versus the month's biggest day. */
function heat(net, max) {
  if (!net) return undefined;
  const a = 0.1 + 0.42 * Math.min(1, Math.abs(net) / (max || 1));
  return net > 0 ? `rgba(16,185,129,${a})` : `rgba(244,63,94,${a})`;
}

const range = (w) => `${fmtDate(w.from, { day: 'numeric', month: 'short' })} – ${fmtDate(addDays(w.from, 4), { day: 'numeric', month: 'short' })}`;

export function TargetBar({ week, cur, onEdit }) {
  if (!week.target) {
    return (
      <button type="button" onClick={onEdit} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.1] py-2.5 text-xs text-zinc-500 hover:text-zinc-200">
        <Target size={14} /> Set a weekly growth target
      </button>
    );
  }
  const p = Math.max(0, Math.min(100, week.targetPct || 0));
  const hit = (week.targetPct || 0) >= 100;
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5"><Target size={12} className={hit ? 'text-emerald-300' : 'text-amber-300'} /> Target +{week.target}%</span>
        <button type="button" onClick={onEdit} className="flex items-center gap-1 hover:text-zinc-200">
          {week.growthPct == null ? '—' : `${week.growthPct >= 0 ? '+' : ''}${week.growthPct.toFixed(2)}%`} of {week.target}% <Pencil size={10} />
        </button>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={cx('h-full rounded-full transition-all', hit ? 'bg-gradient-to-r from-emerald-400 to-lime-300 shadow-[0_0_12px_#34d399]' : 'bg-gradient-to-r from-amber-400 to-orange-300')} style={{ width: `${p}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-zinc-500">{hit ? 'Target hit. Protect the week.' : `${money(Math.max(0, (week.target / 100) * week.open - week.net), cur)} to go`}</div>
    </div>
  );
}

function Stat({ label, children, className }) {
  return (
    <div className={cx('rounded-xl bg-black/20 px-3 py-2.5', className)}>
      <div className="eyebrow">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function CalendarView({ navigate }) {
  const { trades, settings, cur, cashflows, dispatch } = useJournal();
  const today = todayStr();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [weekKey, setWeekKey] = useState(weekStart());
  const [openDay, setOpenDay] = useState(null);
  const [targetOpen, setTargetOpen] = useState(false);
  const [targetDraft, setTargetDraft] = useState('');

  const days = useMemo(() => dayStats(trades, settings), [trades, settings]);
  const weeks = useMemo(() => weekReports(trades, cashflows, settings), [trades, cashflows, settings]);
  const weekMap = useMemo(() => new Map(weeks.map((w) => [w.key, w])), [weeks]);
  const weekdays = useMemo(() => weekdayStats(trades, settings), [trades, settings]);
  const insights = useMemo(() => tradingInsights(trades, settings, weeks, cur), [trades, settings, weeks, cur]);

  const showWeekend = settings.countWeekends || [...days.keys()].some((d) => [0, 6].includes(new Date(`${d}T00:00`).getDay()));
  const cols = showWeekend ? 7 : 5;

  // Weeks (Monday keys) overlapping the shown month.
  const grid = useMemo(() => {
    const first = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const last = `${month}-${pad(new Date(y, m, 0).getDate())}`;
    const rows = [];
    for (let w = weekStart(first); w <= last; w = addDays(w, 7)) {
      const cells = [];
      for (let i = 0; i < cols; i++) cells.push(addDays(w, i));
      rows.push({ key: w, cells });
    }
    return rows;
  }, [month, cols]);
  const monthMax = useMemo(() => Math.max(1, ...grid.flatMap((r) => r.cells).map((d) => Math.abs(days.get(d)?.net || 0))), [grid, days]);
  const monthNet = useMemo(() => [...days.values()].filter((d) => d.date.startsWith(month)).reduce((a, d) => a + d.net, 0), [days, month]);

  const shiftMonth = (n) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  const week = weekMap.get(weekKey) || weeks[weeks.length - 1];
  const history = useMemo(() => [...weeks].filter((w) => w.trades || w.withdrawn || w.deposited).reverse(), [weeks]);
  const chartWeeks = useMemo(() => weeks.filter((w) => w.trades).slice(-12).map((w) => ({ ...w, label: fmtDate(w.from, { day: 'numeric', month: 'short' }), g: w.growthPct ?? 0 })), [weeks]);
  const growthMax = Math.max(1, ...history.map((w) => Math.abs(w.growthPct || 0)));
  const wdShown = weekdays.slice(0, cols);
  const wdMax = Math.max(1, ...wdShown.map((r) => Math.abs(r.avg || 0)));
  const dayTrades = openDay ? chrono(trades).filter((t) => t.date === openDay) : [];

  const editTarget = () => {
    setTargetDraft(String(settings.weeklyTargetPct || ''));
    setTargetOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageTitle eyebrow={`Weekly desk · week of ${range({ from: weekStart() })}`} title="Calendar" accent="acc-emerald">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setMonth(today.slice(0, 7));
            setWeekKey(weekStart());
          }}
        >
          <CalendarRange size={16} /> This week
        </button>
      </PageTitle>

      {/* P&L calendar */}
      <Card className="acc-emerald p-3 md:p-5">
        <CardHeader
          icon={CalendarDays}
          eyebrow="P&L calendar"
          title={fmtDate(`${month}-01`, { month: 'long', year: 'numeric' })}
          right={
            <div className="flex items-center gap-1">
              <span className="mr-2 hidden sm:inline"><PnL value={monthNet} cur={cur} className="text-sm font-semibold" /></span>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
            </div>
          }
        />
        <div className="mt-4 grid gap-1 md:gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr)) minmax(0, 1.25fr)` }}>
          {weekdays.slice(0, cols).map((w) => (
            <div key={w.i} className="pb-1 text-center font-mono text-[10px] uppercase tracking-wider text-zinc-500">{w.short}</div>
          ))}
          <div className="pb-1 text-center font-mono text-[10px] uppercase tracking-wider text-emerald-300/80">Week</div>

          {grid.map((row) => {
            const w = weekMap.get(row.key);
            const selected = row.key === week?.key;
            return [
              ...row.cells.map((d) => {
                const s = days.get(d);
                const inMonth = d.startsWith(month);
                const future = d > today;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!s}
                    onClick={() => setOpenDay(d)}
                    title={s ? `${fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' })} · ${money(s.net, cur, { sign: true })} · ${s.trades} trade${s.trades > 1 ? 's' : ''}` : undefined}
                    className={cx(
                      'relative flex min-h-[54px] flex-col items-start justify-between rounded-lg border p-1 text-left transition md:min-h-[78px] md:rounded-xl md:p-2',
                      s ? 'border-white/[0.08] hover:-translate-y-0.5 hover:border-white/25' : 'border-white/[0.04] bg-white/[0.015]',
                      !inMonth && 'opacity-35',
                      d === today && 'ring-1 ring-amber-300/70',
                      selected && 'border-emerald-400/20',
                    )}
                    style={{ background: s ? heat(s.net, monthMax) : undefined }}
                  >
                    <span className={cx('font-mono text-[10px] md:text-[11px]', d === today ? 'text-amber-200' : future ? 'text-zinc-700' : 'text-zinc-400')}>{Number(d.slice(8))}</span>
                    {s && (
                      <span className="w-full">
                        <span className={cx('num block truncate font-mono text-[10.5px] font-semibold md:text-sm', s.net > 0 ? 'text-emerald-100' : s.net < 0 ? 'text-rose-100' : 'text-zinc-200')}>{shortMoney(s.net, cur)}</span>
                        <span className="hidden font-mono text-[10px] text-white/60 md:block">{s.trades}t · {Math.round((s.wins / s.trades) * 100)}%</span>
                      </span>
                    )}
                  </button>
                );
              }),
              <button
                key={`w-${row.key}`}
                type="button"
                onClick={() => setWeekKey(row.key)}
                className={cx(
                  'flex min-h-[54px] flex-col justify-between rounded-lg border p-1 text-left transition md:min-h-[78px] md:rounded-xl md:p-2',
                  selected ? 'border-emerald-400/50 bg-emerald-400/[0.08] shadow-[0_0_18px_-6px_#34d399]' : 'border-white/[0.06] bg-white/[0.03] hover:border-white/20',
                )}
              >
                {w && (w.trades || w.withdrawn || w.deposited) ? (
                  <>
                    <PnL value={w.net} cur={cur} className="block truncate text-[10.5px] font-semibold md:text-sm" />
                    <span className={cx('font-mono text-[10px] md:text-[11px]', (w.growthPct || 0) >= 0 ? 'text-emerald-300/80' : 'text-rose-300/80')}>
                      {w.growthPct == null ? '' : `${w.growthPct >= 0 ? '+' : ''}${w.growthPct.toFixed(1)}%`}
                    </span>
                    {w.withdrawn > 0 && <span className="hidden truncate font-mono text-[10px] text-amber-300/80 md:block">out {money(w.withdrawn, cur)}</span>}
                  </>
                ) : (
                  <span className="font-mono text-[10px] text-zinc-700">—</span>
                )}
              </button>,
            ];
          })}
        </div>
        <p className="mt-3 text-[11px] text-zinc-500">Tap a day to see its trades. Tap a week total to open its report below. Brighter colour = bigger day.</p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Selected week report */}
        {week && (
          <Card className={cx('overflow-hidden p-4 md:p-5 lg:col-span-3', week.net >= 0 ? 'acc-lime' : 'acc-rose')}>
            <CardHeader
              icon={week.net >= 0 ? TrendingUp : TrendingDown}
              eyebrow={week.key === weekStart() ? 'This week' : 'Week report'}
              title={range(week)}
              right={
                <div className="flex items-center gap-1">
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-30" disabled={week.key === weeks[0]?.key} onClick={() => setWeekKey(addDays(week.key, -7))} aria-label="Previous week"><ChevronLeft size={18} /></button>
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-30" disabled={week.key >= weekStart()} onClick={() => setWeekKey(addDays(week.key, 7))} aria-label="Next week"><ChevronRight size={18} /></button>
                </div>
              }
            />
            <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1">
              <PnL value={week.net} cur={cur} className="display text-4xl font-bold" />
              <span className={cx('font-mono text-sm font-semibold', (week.growthPct || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                {week.growthPct == null ? '' : `${week.growthPct >= 0 ? '+' : ''}${week.growthPct.toFixed(2)}%`}
              </span>
            </div>
            <div className="mt-1 font-mono text-xs text-zinc-500">
              start <span className="text-zinc-300">{money(week.open, cur)}</span> → end <span className="text-zinc-300">{money(week.close, cur)}</span>
              {week.withdrawn > 0 && <> · out <span className="text-amber-300">{money(week.withdrawn, cur)}</span></>}
              {week.deposited > 0 && <> · in <span className="text-emerald-300">{money(week.deposited, cur)}</span></>}
            </div>

            <div className="-mx-1 mt-3 h-24">
              {week.curve.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={week.curve} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="wkEq" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={week.net >= 0 ? '#34d399' : '#fb7185'} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={week.net >= 0 ? '#34d399' : '#fb7185'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <Tooltip content={<ChartTooltip cur={cur} labelFmt={(l, p) => (p[0]?.payload.date ? `${l} · ${fmtDate(p[0].payload.date, { weekday: 'short', day: 'numeric' })}` : 'Start')} />} />
                    <Area type="monotone" dataKey="balance" name="Balance" stroke={week.net >= 0 ? '#34d399' : '#fb7185'} strokeWidth={2.25} fill="url(#wkEq)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center rounded-xl border border-dashed border-white/[0.08] text-sm text-zinc-500">No closed trades this week yet</div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Trades">
                <span className="num font-mono text-sm text-white">{week.trades}</span>
                <span className="ml-2 font-mono text-xs"><span className="text-emerald-400">{week.wins}W</span> / <span className="text-rose-400">{week.losses}L</span></span>
              </Stat>
              <Stat label="Win rate"><span className="num font-mono text-sm text-white">{pct(week.winRate, 0)}</span></Stat>
              <Stat label="Discipline">
                <span className={cx('num font-mono text-sm', week.discipline == null ? 'text-zinc-400' : week.discipline >= 80 ? 'text-emerald-300' : week.discipline >= 50 ? 'text-amber-300' : 'text-rose-300')}>{pct(week.discipline, 0)}</span>
                <span className="ml-1 text-[10px] text-zinc-500">clean</span>
              </Stat>
              <Stat label="Best day">
                {week.bestDay ? <><PnL value={week.bestDay.net} cur={cur} className="text-sm" /> <span className="text-xs text-zinc-500">{fmtDate(week.bestDay.date, { weekday: 'short' })}</span></> : <span className="text-sm text-zinc-500">—</span>}
              </Stat>
              <Stat label="Worst day">
                {week.worstDay ? <><PnL value={week.worstDay.net} cur={cur} className="text-sm" /> <span className="text-xs text-zinc-500">{fmtDate(week.worstDay.date, { weekday: 'short' })}</span></> : <span className="text-sm text-zinc-500">—</span>}
              </Stat>
              <Stat label="Costliest habit">
                {week.worstTag ? <span className="text-sm text-rose-300">{week.worstTag.tag} <PnL value={week.worstTag.net} cur={cur} className="text-xs" /></span> : <span className="text-sm text-emerald-300/80">None</span>}
              </Stat>
            </div>
            <div className="mt-4">
              <TargetBar week={week} cur={cur} onEdit={editTarget} />
            </div>
          </Card>
        )}

        {/* Best / worst days */}
        <Card className="acc-amber p-4 md:p-5 lg:col-span-2">
          <CardHeader icon={Sun} eyebrow="Your trading days" title="Best & worst weekdays" />
          <div className="mt-4 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {wdShown.map((r) => (
              <div key={r.i} className="flex flex-col items-center gap-1 rounded-xl border border-white/[0.06] px-1 py-2.5" style={{ background: r.avg ? heat(r.avg, wdMax) : undefined }}>
                <span className="font-mono text-[10px] uppercase text-zinc-300">{r.short}</span>
                <span className={cx('num font-mono text-[11px] font-semibold', r.avg == null ? 'text-zinc-600' : r.avg >= 0 ? 'text-emerald-100' : 'text-rose-100')}>{r.avg == null ? '—' : shortMoney(r.avg, cur)}</span>
                <span className="font-mono text-[9.5px] text-white/50">{r.days ? `${r.green}/${r.days} green` : 'no data'}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">Average P&L per traded day, across all your weeks.</p>

          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400"><Lightbulb size={14} className="text-amber-300" /> Insights</div>
            {insights.length === 0 && <p className="text-sm text-zinc-500">Log a couple of weeks of trades and patterns about your days will show up here.</p>}
            {insights.map((x) => (
              <div key={x.text} className={cx('rounded-xl border px-3 py-2 text-sm leading-snug', x.tone === 'good' ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-100' : 'border-rose-500/20 bg-rose-500/[0.06] text-rose-100')}>
                {x.text}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Week by week */}
      <Card className="acc-cyan p-4 md:p-5">
        <CardHeader icon={ListOrdered} eyebrow="Week by week" title="Weekly growth" />
        {chartWeeks.length > 0 && (
          <div className="-mx-1 mt-4 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartWeeks} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
                {settings.weeklyTargetPct > 0 && <ReferenceLine y={Number(settings.weeklyTargetPct)} stroke="#fbbf24" strokeDasharray="4 4" />}
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip cur={cur} labelFmt={(l, p) => `Week of ${range(p[0]?.payload || { from: weekStart() })}`} valueFmt={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`} />} />
                <Bar dataKey="g" name="Growth" radius={[6, 6, 6, 6]} maxBarSize={36} onClick={(d) => setWeekKey(d.key)} className="cursor-pointer">
                  {chartWeeks.map((w) => (
                    <Cell key={w.key} fill={w.g >= 0 ? '#10b981' : '#f43f5e'} fillOpacity={w.key === week?.key ? 1 : 0.55} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3 divide-y divide-white/[0.05]">
          {history.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Your weeks appear here once you log trades.</p>}
          {history.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => {
                setWeekKey(w.key);
                setMonth(w.from.slice(0, 7));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={cx('-mx-2 grid w-[calc(100%+1rem)] grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl px-2 py-3 text-left transition hover:bg-white/[0.03] sm:grid-cols-[150px_1fr_auto_auto]', w.key === week?.key && 'bg-white/[0.04]')}
            >
              <div>
                <div className="text-sm font-semibold text-zinc-100">{range(w)}</div>
                <div className="font-mono text-[11px] text-zinc-500">{w.trades} trades · {pct(w.winRate, 0)} win</div>
              </div>
              <div className="order-last col-span-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05] sm:order-none sm:col-span-1">
                <div className={cx('h-full rounded-full', (w.growthPct || 0) >= 0 ? 'bg-emerald-400' : 'bg-rose-400')} style={{ width: `${(Math.abs(w.growthPct || 0) / growthMax) * 100}%` }} />
              </div>
              <div className="hidden text-right font-mono text-[11px] text-zinc-500 sm:block">
                {money(w.open, cur)} → {money(w.close, cur)}
                {w.withdrawn > 0 && <div className="text-amber-300/80">out {money(w.withdrawn, cur)}</div>}
              </div>
              <div className="text-right">
                <PnL value={w.net} cur={cur} className="block text-sm font-semibold" />
                <span className={cx('font-mono text-[11px]', (w.growthPct || 0) >= 0 ? 'text-emerald-300/80' : 'text-rose-300/80')}>{w.growthPct == null ? '' : `${w.growthPct >= 0 ? '+' : ''}${w.growthPct.toFixed(1)}%`}</span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Day detail */}
      <Modal open={!!openDay} onClose={() => setOpenDay(null)} title={openDay ? fmtDate(openDay, { weekday: 'long', day: 'numeric', month: 'long' }) : ''}>
        {openDay && days.get(openDay) && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Net"><PnL value={days.get(openDay).net} cur={cur} className="text-sm font-semibold" /></Stat>
              <Stat label="Trades"><span className="num font-mono text-sm text-white">{days.get(openDay).trades}</span></Stat>
              <Stat label="Win rate"><span className="num font-mono text-sm text-white">{pct((days.get(openDay).wins / days.get(openDay).trades) * 100, 0)}</span></Stat>
            </div>
            <div className="mt-3 divide-y divide-white/[0.05]">
              {dayTrades.map((t) => {
                const ls = layerStats(t.layers);
                return (
                  <button key={t.id} type="button" onClick={() => navigate('history', { open: t.id })} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-white/[0.03]">
                    <span className={cx('h-9 w-1 shrink-0 rounded-full', t.pnl == null ? 'bg-amber-400/70' : t.pnl >= 0 ? 'bg-emerald-500' : 'bg-rose-500')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100">{t.pair}</span>
                        <DirBadge dir={t.direction} />
                        {t.time && <span className="font-mono text-[11px] text-zinc-500">{t.time}</span>}
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {[ls.count ? `${ls.count} layer${ls.count === 1 ? '' : 's'} · ${lotsFmt(ls.lots)} lots` : '', t.setup, t.tags.join(', ')].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="text-right">
                      <PnL value={t.pnl} cur={cur} className="block text-sm font-semibold" />
                      <ResultBadge result={t.pnl == null ? 'OPEN' : t.pnl > 0 ? 'WIN' : t.pnl < 0 ? 'LOSS' : 'BE'} className="mt-1" />
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Modal>

      {/* Weekly target */}
      <Modal open={targetOpen} onClose={() => setTargetOpen(false)} title="Weekly growth target">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(targetDraft);
            dispatch({ type: 'SETTINGS', patch: { weeklyTargetPct: Number.isFinite(v) && v > 0 ? v : 0 } });
            setTargetOpen(false);
          }}
        >
          <p className="text-sm text-zinc-400">Growth you aim for each week, measured from the week's starting balance. Leave empty to turn it off.</p>
          <div className="mt-4 flex items-center gap-2">
            <input autoFocus inputMode="decimal" className="input-mono flex-1" placeholder="e.g. 10" value={targetDraft} onChange={(e) => setTargetDraft(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Weekly target percent" />
            <span className="font-mono text-zinc-400">%</span>
          </div>
          {week && Number(targetDraft) > 0 && <p className="mt-2 text-xs text-zinc-500">This week that is {money((Number(targetDraft) / 100) * week.open, cur)} on a {money(week.open, cur)} start.</p>}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" className="btn-ghost" onClick={() => setTargetOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
