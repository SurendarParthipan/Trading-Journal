import { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { TrendingUp, Brain, CalendarRange, Crosshair, Flame, BarChart3 } from 'lucide-react';
import { Card, CardHeader, ChartTooltip, EmptyState, PnL, Segmented, cx } from '../components/ui';
import { useJournal } from '../lib/useJournal';
import { byKey, equitySeries, getStats, monthly, tagCosts, tagTimeline } from '../lib/calc';
import { addDays, fmtDate, money, monthLabel, parseDay, pct, todayStr } from '../lib/format';

const LINE_COLORS = ['#f43f5e', '#fb923c', '#facc15', '#a78bfa', '#38bdf8'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const axisMoney = (cur) => (v) => {
  const a = Math.abs(v);
  const body = a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : a.toFixed(0);
  return `${v < 0 ? '-' : ''}${cur}${body}`;
};

function Stat({ label, children, tone }) {
  return (
    <div className="card acc-violet px-3.5 py-3">
      <div className="eyebrow !text-[9.5px]">{label}</div>
      <div className={cx('num mt-1 font-display text-lg font-bold md:text-xl', tone || 'text-white')}>{children}</div>
    </div>
  );
}

export default function Analytics() {
  const { trades: all, settings, cur } = useJournal();
  const [range, setRange] = useState('all');
  const [eqMode, setEqMode] = useState('balance');

  const trades = useMemo(() => {
    if (range === 'all') return all;
    const today = todayStr();
    const lo = range === 'ytd' ? `${today.slice(0, 4)}-01-01` : addDays(today, -Number(range) + 1);
    return all.filter((t) => t.date >= lo);
  }, [all, range]);

  // Balance at the start of the window, so a filtered equity curve still shows the true account level.
  const startBal = useMemo(() => {
    if (range === 'all' || !trades.length) return Number(settings.startingCapital) || 0;
    const first = trades.reduce((m, t) => (t.date < m ? t.date : m), trades[0].date);
    return (Number(settings.startingCapital) || 0) + all.filter((t) => t.date < first && t.pnl != null).reduce((a, t) => a + t.pnl, 0);
  }, [all, trades, range, settings.startingCapital]);

  const stats = useMemo(() => getStats(trades, { ...settings, startingCapital: startBal }), [trades, settings, startBal]);
  const equity = useMemo(() => equitySeries(trades, startBal), [trades, startBal]);
  const months = useMemo(() => monthly(trades).map((m) => ({ ...m, label: monthLabel(m.key) })), [trades]);
  const costs = useMemo(() => tagCosts(trades, settings), [trades, settings]);
  const badTags = useMemo(() => costs.filter((c) => c.kind === 'bad' && c.net < 0).slice(0, 5).map((c) => c.tag), [costs]);
  const timeline = useMemo(() => tagTimeline(trades, badTags), [trades, badTags]);
  const setups = useMemo(() => byKey(trades, (t) => t.setup || 'No setup'), [trades]);
  const weekdays = useMemo(() => {
    const rows = byKey(trades, (t) => WEEKDAYS[parseDay(t.date).getDay()]);
    return WEEKDAYS.slice(1, 6).concat(rows.some((r) => r.key === 'Sat' || r.key === 'Sun') ? ['Sat', 'Sun'] : []).map((d) => rows.find((r) => r.key === d) || { key: d, net: 0, trades: 0, wins: 0 });
  }, [trades]);
  const longShort = useMemo(() => byKey(trades, (t) => (t.direction === 'BUY' ? 'Long' : 'Short')), [trades]);

  const totalMistakeCost = costs.filter((c) => c.kind === 'bad').reduce((a, c) => a + Math.min(0, c.net), 0);
  const up = stats.net >= 0;
  const eqKey = eqMode === 'balance' ? 'balance' : 'net';

  if (!all.length) {
    return (
      <Card>
        <EmptyState icon={BarChart3} title="Analytics unlock with data" body="Log a few closed trades to see your equity curve, habit costs and edge by setup." />
      </Card>
    );
  }

  return (
    <div className="stagger space-y-4">
      <div className="flex justify-end">
        <Segmented size="sm" value={range} onChange={setRange} options={[{ value: '30', label: '30D' }, { value: '90', label: '90D' }, { value: 'ytd', label: 'YTD' }, { value: 'all', label: 'All time' }]} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Expectancy" tone={stats.expectancy >= 0 ? 'text-gain' : 'text-loss'}>{money(stats.expectancy, cur, { sign: true })}</Stat>
        <Stat label="Avg win" tone="text-gain">{money(stats.avgWin, cur)}</Stat>
        <Stat label="Avg loss" tone="text-loss">{money(stats.avgLoss, cur)}</Stat>
        <Stat label="Avg R" tone={stats.avgR >= 0 ? 'text-gain' : 'text-loss'}>{stats.avgR == null ? '—' : `${stats.avgR >= 0 ? '+' : ''}${stats.avgR.toFixed(2)}R`}</Stat>
        <Stat label="Max drawdown" tone="text-loss">{stats.maxDD ? `-${pct(stats.maxDDPct)}` : '—'}</Stat>
        <Stat label="Best / worst">
          <span className="text-gain">{money(stats.largestWin, cur, { compact: true })}</span>
          <span className="text-zinc-600"> / </span>
          <span className="text-loss">{money(stats.largestLoss, cur, { compact: true })}</span>
        </Stat>
      </div>

      {/* Equity curve */}
      <Card className="acc-lime p-4 md:p-5">
        <CardHeader
          icon={TrendingUp}
          eyebrow="Equity curve"
          title={<PnL value={stats.net} cur={cur} className="text-base" />}
          right={<Segmented size="sm" value={eqMode} onChange={setEqMode} options={[{ value: 'balance', label: 'Balance' }, { value: 'net', label: 'Cumulative P&L' }]} />}
        />
        <div className="-ml-2 mt-4 h-64 md:h-80">
          {equity.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equity} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={up ? '#10b981' : '#f43f5e'} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={up ? '#10b981' : '#f43f5e'} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="n" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(n) => (n === 0 ? 'Start' : `#${n}`)} />
                <YAxis tickLine={false} axisLine={false} width={56} domain={['auto', 'auto']} tickFormatter={axisMoney(cur)} />
                <ReferenceLine y={eqMode === 'balance' ? startBal : 0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ stroke: 'rgba(255,255,255,0.15)' }}
                  content={<ChartTooltip cur={cur} labelFmt={(l, p) => (p[0]?.payload.date ? `Trade #${l} · ${p[0].payload.pair} · ${fmtDate(p[0].payload.date)}` : 'Start')} />}
                />
                <Area type="monotone" dataKey={eqKey} name={eqMode === 'balance' ? 'Balance' : 'Net P&L'} stroke={up ? '#10b981' : '#f43f5e'} strokeWidth={2.2} fill="url(#eqFill)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center text-sm text-zinc-500">No closed trades in this range</div>
          )}
        </div>
        {equity.length > 1 && stats.maxDD > 0 && (
          <div className="-ml-2 mt-2 h-20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equity} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="n" hide />
                <YAxis width={56} tickLine={false} axisLine={false} tickFormatter={axisMoney(cur)} tickCount={2} />
                <Tooltip content={<ChartTooltip cur={cur} labelFmt={(l) => (l ? `Trade #${l}` : 'Start')} />} />
                <Area type="stepAfter" dataKey="dd" name="Drawdown" stroke="#f43f5e" strokeWidth={1} fill="url(#ddFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Psychology tag cost */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="acc-pink p-4 md:p-5">
          <CardHeader
            icon={Brain}
            eyebrow="Psychology tag cost analysis"
            title={totalMistakeCost < 0 ? <span>Mistakes cost <PnL value={totalMistakeCost} cur={cur} /></span> : 'Net P&L per tag'}
          />
          {costs.length ? (
            <div className="mt-4" style={{ height: Math.max(180, costs.length * 38) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costs} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={axisMoney(cur)} />
                  <YAxis type="category" dataKey="tag" width={128} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <ReferenceLine x={0} stroke="rgba(255,255,255,0.2)" />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    content={<ChartTooltip cur={cur} labelFmt={(l, p) => `${l} · ${p[0]?.payload.count} trades · ${p[0]?.payload.wins} wins`} />}
                  />
                  <Bar dataKey="net" name="Net P&L" radius={[4, 4, 4, 4]} maxBarSize={22}>
                    {costs.map((c) => (
                      <Cell key={c.tag} fill={c.net >= 0 ? '#10b981' : '#f43f5e'} fillOpacity={c.kind === 'bad' ? 1 : 0.6} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Tag trades with emotions and mistakes to see what each habit costs.</p>
          )}
        </Card>

        <Card className="acc-orange p-4 md:p-5">
          <CardHeader icon={Flame} eyebrow="Cost of bad habits over time" title="Cumulative P&L of mistake-tagged trades" />
          {timeline.length ? (
            <div className="-ml-2 mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={(d) => fmtDate(d, { day: 'numeric', month: 'short' })} />
                  <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={axisMoney(cur)} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Tooltip content={<ChartTooltip cur={cur} labelFmt={(d) => fmtDate(d)} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  {badTags.map((tag, i) => (
                    <Line key={tag} type="monotone" dataKey={tag} name={tag} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">No losing mistake tags in this range. That is the goal.</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="acc-cyan p-4 md:p-5 lg:col-span-2">
          <CardHeader icon={CalendarRange} eyebrow="Monthly P&L" />
          <div className="-ml-2 mt-4 h-56">
            {months.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={axisMoney(cur)} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip cur={cur} labelFmt={(l, p) => `${l} · ${p[0]?.payload.trades} trades · ${pct((p[0]?.payload.wins / p[0]?.payload.trades) * 100, 0)} win`} />} />
                  <Bar dataKey="net" name="Net P&L" radius={[6, 6, 6, 6]} maxBarSize={44}>
                    {months.map((m) => (
                      <Cell key={m.key} fill={m.net >= 0 ? '#10b981' : '#f43f5e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-zinc-500">No closed trades in this range</div>
            )}
          </div>
        </Card>

        <Card className="acc-violet p-4 md:p-5">
          <CardHeader icon={Crosshair} eyebrow="By day & direction" />
          <div className="mt-4 space-y-2">
            {weekdays.map((d) => {
              const max = Math.max(1, ...weekdays.map((x) => Math.abs(x.net)));
              return (
                <div key={d.key} className="flex items-center gap-3 font-mono text-xs">
                  <span className="w-8 text-zinc-500">{d.key}</span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-white/[0.03]">
                    <div className={cx('absolute inset-y-0 left-0 rounded-md', d.net >= 0 ? 'bg-emerald-500/60' : 'bg-rose-500/60')} style={{ width: `${(Math.abs(d.net) / max) * 100}%` }} />
                  </div>
                  <span className={cx('num w-20 text-right', d.net > 0 ? 'text-gain' : d.net < 0 ? 'text-loss' : 'text-zinc-600')}>{d.trades ? money(d.net, cur, { sign: true, compact: true }) : '—'}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-4">
            {['Long', 'Short'].map((k) => {
              const r = longShort.find((x) => x.key === k);
              return (
                <div key={k} className="rounded-xl bg-white/[0.03] p-3">
                  <div className={cx('eyebrow', k === 'Long' ? 'text-emerald-400/80' : 'text-rose-400/80')}>{k}</div>
                  <PnL value={r?.net ?? 0} cur={cur} className="mt-1 block text-sm font-semibold" />
                  <div className="font-mono text-[11px] text-zinc-500">{r ? `${r.trades} · ${pct((r.wins / r.trades) * 100, 0)} win` : 'no trades'}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="acc-amber overflow-hidden">
        <div className="p-4 md:p-5">
          <CardHeader icon={BarChart3} eyebrow="Edge by setup" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-y border-white/[0.06] bg-white/[0.02] font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Setup</th>
                <th className="px-3 py-2.5 text-right font-medium">Trades</th>
                <th className="px-3 py-2.5 text-right font-medium">Win rate</th>
                <th className="px-3 py-2.5 text-right font-medium">Avg</th>
                <th className="px-5 py-2.5 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {setups.map((s) => (
                <tr key={s.key} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-2.5 text-zinc-200">{s.key}</td>
                  <td className="num px-3 py-2.5 text-right font-mono text-zinc-400">{s.trades}</td>
                  <td className="num px-3 py-2.5 text-right font-mono text-zinc-400">{pct((s.wins / s.trades) * 100, 0)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <PnL value={s.net / s.trades} cur={cur} className="text-xs" />
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <PnL value={s.net} cur={cur} className="font-semibold" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
