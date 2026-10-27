import { useMemo, useState } from 'react';
import { Flame, Trophy, CalendarCheck, ShieldCheck, Target, Brain, CheckCircle2, Plus, ListChecks, Zap } from 'lucide-react';
import { Card, CardHeader, Ring, cx } from '../components/ui';
import CheckInModal from '../components/CheckIn';
import { Beam, CountNum, XpBar, PageTitle } from '../components/fx';
import { BadgeTile } from '../components/Badge';
import { useJournal } from '../lib/useJournal';
import { cleanTradeStreak, disciplineScore, newestFirst } from '../lib/calc';
import { MILESTONES, isMistake } from '../lib/constants';
import { addDays, fmtDate, isWeekend, money, parseDay, pct, relDay, todayStr } from '../lib/format';

const WEEKS = 20;

function motivation(streak) {
  if (streak.todayDone && streak.current >= 7) return `${streak.current} days strong. This is how professionals are built.`;
  if (streak.todayDone) return 'Today is in the books. Come back tomorrow and add another link to the chain.';
  if (streak.atRisk && streak.current > 0) return `Your ${streak.current}-day streak is on the line. Log a trade or check in before midnight.`;
  if (streak.current > 0) return `${streak.current} days and counting. No market today, so your streak is safe.`;
  if (streak.best > 0) return `Your best run was ${streak.best} days. Start a new one today.`;
  return 'Journal every trading day, even when you do not trade. Consistency compounds faster than profit.';
}

export default function Discipline({ navigate }) {
  const { trades, checkins, settings, streak, cur, xp } = useJournal();
  const [checkinDate, setCheckinDate] = useState(null);

  const score = useMemo(() => disciplineScore(trades, checkins, settings), [trades, checkins, settings]);
  const clean = useMemo(() => cleanTradeStreak(trades, settings), [trades, settings]);

  const tradesByDay = useMemo(() => {
    const m = new Map();
    for (const t of trades) {
      const e = m.get(t.date) || { n: 0, net: 0 };
      e.n += 1;
      e.net += t.pnl || 0;
      m.set(t.date, e);
    }
    return m;
  }, [trades]);

  const grid = useMemo(() => {
    const today = todayStr();
    const dow = (parseDay(today).getDay() + 6) % 7; // Monday = 0
    const start = addDays(today, -dow - (WEEKS - 1) * 7);
    const cols = [];
    for (let w = 0; w < WEEKS; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(start, w * 7 + d);
        col.push({ date, future: date > today });
      }
      cols.push(col);
    }
    return cols;
  }, []);

  const mistakes30 = useMemo(() => {
    const lo = addDays(todayStr(), -29);
    const m = new Map();
    for (const t of trades) {
      if (t.date < lo) continue;
      for (const tag of t.tags) {
        if (!isMistake(tag, settings)) continue;
        const e = m.get(tag) || { tag, n: 0, net: 0 };
        e.n += 1;
        e.net += t.pnl || 0;
        m.set(tag, e);
      }
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [trades, settings]);

  const recentCheckins = useMemo(
    () => Object.entries(checkins).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 6),
    [checkins],
  );

  const nextMilestone = MILESTONES.find((m) => m > streak.current);
  const scoreColor = score.score == null ? '#52525b' : score.score >= 75 ? '#10b981' : score.score >= 50 ? '#facc15' : '#f43f5e';

  return (
    <div className="stagger space-y-5">
      <PageTitle eyebrow="The boss keeps the rules" title="Discipline" accent="acc-orange">
        <button type="button" className="btn-primary" onClick={() => setCheckinDate(todayStr())}>
          <CalendarCheck size={16} /> {checkins[todayStr()] ? 'Edit today’s check-in' : 'Daily check-in'}
        </button>
      </PageTitle>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Streak hero */}
        <Card className="acc-orange overflow-hidden p-5 md:p-6 lg:col-span-2">
          {streak.current > 0 && <Beam from="#fb923c" to="#fde68a" speed={9} />}
          <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-orange-500/15 blur-3xl" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className={cx('grid h-28 w-28 shrink-0 place-items-center rounded-3xl border', streak.current ? 'border-orange-500/30 bg-gradient-to-b from-orange-500/20 to-rose-500/5' : 'border-white/[0.06] bg-white/[0.03]')}>
              <Flame size={56} className={streak.current ? 'animate-flicker text-orange-400 drop-shadow-[0_0_18px_rgba(251,146,60,.8)]' : 'text-zinc-700'} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="eyebrow">Journaling streak</div>
              <div className="mt-1 flex items-baseline gap-2">
                <CountNum value={streak.current} display className="text-7xl font-bold tracking-tight text-orange-100 [text-shadow:0_0_40px_rgba(251,146,60,.7)]" />
                <span className="text-lg text-zinc-400">day{streak.current === 1 ? '' : 's'}</span>
              </div>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">{motivation(streak)}</p>
              {nextMilestone && (
                <div className="mt-4 max-w-sm">
                  <div className="mb-1 flex justify-between font-mono text-[11px] text-zinc-500">
                    <span>Next badge</span>
                    <span>{streak.current}/{nextMilestone} days</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300 transition-all" style={{ width: `${(streak.current / nextMilestone) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="relative mt-6 grid grid-cols-3 gap-2">
            {[
              ['Best streak', `${streak.best}d`],
              ['30-day consistency', pct(streak.consistency, 0)],
              ['Days journaled', streak.totalDays],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div className="eyebrow !text-[9.5px]">{k}</div>
                <div className="num mt-0.5 font-mono text-lg font-semibold text-white">{v}</div>
              </div>
            ))}
          </div>
          {!streak.todayDone && (
            <div className="relative mt-4 grid grid-cols-2 gap-2 sm:max-w-sm">
              <button type="button" className="btn-primary" onClick={() => navigate('new')}>
                <Plus size={16} /> Log trade
              </button>
              <button type="button" className="btn-ghost" onClick={() => setCheckinDate(todayStr())}>
                <CalendarCheck size={16} /> Check in
              </button>
            </div>
          )}
        </Card>

        {/* Discipline score */}
        <Card className="acc-lime flex flex-col p-5">
          <CardHeader icon={ShieldCheck} eyebrow="Discipline score" />
          <div className="my-4 flex items-center gap-5">
            <Ring value={score.score} size={104} stroke={9} color={scoreColor}>
              <div className="text-center">
                <div className="num font-mono text-2xl font-semibold text-white">{score.score == null ? '—' : Math.round(score.score)}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">/ 100</div>
              </div>
            </Ring>
            <div className="space-y-2.5 text-xs">
              <div>
                <div className="text-zinc-500">Clean trades</div>
                <div className="num font-mono text-sm text-zinc-100">{score.tradeScore == null ? '—' : pct(score.tradeScore, 0)}</div>
              </div>
              <div>
                <div className="text-zinc-500">Rules followed</div>
                <div className="num font-mono text-sm text-zinc-100">{score.ruleScore == null ? '—' : pct(score.ruleScore, 0)}</div>
              </div>
            </div>
          </div>
          <div className="mt-auto rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] p-3">
            <div className="flex items-center gap-2 text-sm text-emerald-200">
              <Target size={15} className="text-emerald-400" />
              <span className="num font-mono font-semibold">{clean}</span> clean trade{clean === 1 ? '' : 's'} in a row
            </div>
            <div className="mt-1 text-xs text-zinc-500">Trades without any mistake tag. Based on your last {score.sample || 0} trades and check-ins.</div>
          </div>
        </Card>
      </div>

      {/* Heatmap */}
      <Card className="acc-emerald p-4 md:p-5">
        <CardHeader
          icon={CalendarCheck}
          eyebrow={`Journal consistency · last ${WEEKS} weeks`}
          right={
            <div className="hidden items-center gap-3 font-mono text-[10px] text-zinc-500 sm:flex">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-500" /> trade</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-500/35" /> check-in</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-zinc-800" /> missed</span>
            </div>
          }
        />
        <div className="no-scrollbar mt-4 overflow-x-auto">
          <div className="flex min-w-max gap-[5px]">
            <div className="mr-1 flex flex-col gap-[5px] pt-0 font-mono text-[9px] text-zinc-600">
              {['M', '', 'W', '', 'F', '', 'S'].map((d, i) => (
                <span key={i} className="flex h-[15px] items-center">{d}</span>
              ))}
            </div>
            {grid.map((col, i) => (
              <div key={i} className="flex flex-col gap-[5px]">
                {col.map(({ date, future }) => {
                  const td = tradesByDay.get(date);
                  const ck = checkins[date];
                  const counted = settings.countWeekends || !isWeekend(date);
                  const cls = future
                    ? 'bg-transparent'
                    : td
                      ? 'bg-emerald-500 shadow-[0_0_8px_-1px_rgba(16,185,129,.7)]'
                      : ck
                        ? 'bg-emerald-500/35'
                        : counted
                          ? 'bg-zinc-800/80'
                          : 'bg-zinc-900 ring-1 ring-inset ring-white/[0.03]';
                  const title = `${fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}${td ? ` · ${td.n} trade${td.n > 1 ? 's' : ''} · ${money(td.net, cur, { sign: true })}` : ''}${ck ? ' · checked in' : ''}`;
                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={future}
                      title={title}
                      aria-label={title}
                      onClick={() => setCheckinDate(date)}
                      className={cx('h-[15px] w-[15px] rounded-[4px] transition hover:ring-2 hover:ring-white/30', cls, date === todayStr() && 'ring-1 ring-amber-400/70')}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          {settings.countWeekends ? 'Weekends count toward your streak.' : 'Weekends never break your streak (markets closed).'} Tap a day to check in retroactively.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Rank */}
        <Card className="acc-violet overflow-hidden p-4 md:p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/15 blur-3xl" />
          <CardHeader icon={Zap} eyebrow="Trader rank" />
          <div className="mt-4 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 font-mono text-lg font-bold text-emerald-200 shadow-glow-em">{xp.level}</div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-white">{xp.title}</div>
              <XpBar pct={xp.pct} className="mt-1.5" />
              <div className="mt-1 font-mono text-[11px] text-zinc-500">{xp.into}/{xp.span} XP · next: Lvl {xp.level + 1}</div>
            </div>
          </div>
          <div className="mt-4 space-y-1.5 text-xs text-zinc-400">
            {[
              ['Log a trade', '+10'],
              ['Notes, chart, stop loss', '+5 each'],
              ['Clean trade (good tags only)', '+15'],
              ['Daily check-in', '+15, +3/rule'],
              ['Each day of best streak', '+10'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="font-mono text-emerald-300">{v}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Mistake frequency */}
        <Card className="acc-rose p-4 md:p-5">
          <CardHeader icon={Brain} eyebrow="Mistakes · last 30 days" />
          {mistakes30.length ? (
            <div className="mt-4 space-y-2.5">
              {mistakes30.slice(0, 6).map((m) => (
                <div key={m.tag} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 truncate text-zinc-300">{m.tag}</span>
                  <span className="num rounded-md bg-rose-500/10 px-1.5 py-0.5 font-mono text-[11px] text-rose-300">{m.n}×</span>
                  <span className={cx('num w-20 text-right font-mono text-xs', m.net < 0 ? 'text-loss' : 'text-zinc-400')}>{money(m.net, cur, { sign: true })}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] p-3 text-sm text-emerald-200">
              <CheckCircle2 size={16} className="text-emerald-400" /> No mistakes tagged in 30 days.
            </div>
          )}
        </Card>

        {/* Recent check-ins */}
        <Card className="acc-cyan p-4 md:p-5">
          <CardHeader icon={ListChecks} eyebrow="Recent check-ins" />
          {recentCheckins.length ? (
            <div className="mt-3 divide-y divide-white/[0.05]">
              {recentCheckins.map(([date, c]) => (
                <button key={date} type="button" onClick={() => setCheckinDate(date)} className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-white/[0.03]">
                  <span className="mt-0.5 font-mono text-xs text-zinc-500">{relDay(date).replace(/, \d{4}$/, '')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-zinc-300">{c.note || <span className="italic text-zinc-600">No reflection</span>}</span>
                    {c.mood && <span className="text-[11px] text-sky-300/80">{c.mood}</span>}
                  </span>
                  {c.rulesTotal > 0 && (
                    <span className={cx('num shrink-0 font-mono text-xs', c.rulesFollowed === c.rulesTotal ? 'text-gain' : 'text-amber-300')}>
                      {c.rulesFollowed}/{c.rulesTotal}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Check in daily to rate how well you followed your rules. Even on days you don&apos;t trade.</p>
          )}
        </Card>
      </div>

      <Card className="acc-amber p-4 md:p-5">
        <CardHeader
          icon={Trophy}
          eyebrow="Achievements"
          right={<span className="font-mono text-xs text-amber-200">{xp.badges.filter((b) => b.unlocked).length}/{xp.badges.length} unlocked</span>}
        />
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[...xp.badges].sort((a, b) => Number(b.unlocked) - Number(a.unlocked)).map((b) => (
            <BadgeTile key={b.id} badge={b} />
          ))}
        </div>
      </Card>

      <CheckInModal open={!!checkinDate} date={checkinDate || todayStr()} onClose={() => setCheckinDate(null)} />
    </div>
  );
}
