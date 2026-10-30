import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, SlidersHorizontal, ChevronDown, Pencil, Trash2, Copy, ExternalLink, Maximize2, Layers, Brain, ImageIcon,
  ShieldAlert, X, ListFilter, Plus, FileText, FileDown,
} from 'lucide-react';
import { Card, PnL, ResultBadge, DirBadge, Segmented, Modal, ConfirmModal, EmptyState, cx, useToast } from '../components/ui';
import Analytics from './Analytics';
import { PageTitle } from '../components/fx';
import { useJournal } from '../lib/useJournal';
import { layerStats, layerPnl, newestFirst, resultOf } from '../lib/calc';
import { isMistake } from '../lib/constants';
import { money, pct, priceFmt, lotsFmt, relDay, todayStr, addDays, fmtDate, round } from '../lib/format';
import { imageSrc } from '../lib/image';
import { openPdfReport, downloadWordReport } from '../lib/report';

const RANGES = [
  { value: 'all', label: 'All' },
  { value: '7', label: '7D' },
  { value: '30', label: '30D' },
  { value: 'month', label: 'Month' },
  { value: 'custom', label: 'Custom' },
];

function TradeCard({ t, open, onToggle, onEdit, onCopy, onDelete, onReport, cur, settings }) {
  const ls = layerStats(t.layers);
  const res = resultOf(t);
  const img = imageSrc(t);
  const [zoom, setZoom] = useState(false);
  const ref = useRef(null);
  const rMultiple = t.pnl != null && t.risk > 0 ? t.pnl / t.risk : null;

  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [open]);

  return (
    <Card className={cx('overflow-hidden transition', res === 'WIN' ? 'acc-lime' : res === 'LOSS' ? 'acc-rose' : res === 'OPEN' ? 'acc-amber' : 'acc-violet', open ? 'is-open' : 'card-hover')}>
      <div ref={ref} className="scroll-mt-24" />
      <button type="button" onClick={onToggle} className="flex w-full items-stretch gap-3 p-3.5 text-left md:p-4" aria-expanded={open}>
        <span className={cx('w-1 shrink-0 rounded-full', res === 'WIN' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : res === 'LOSS' ? 'bg-rose-500 shadow-[0_0_10px_#f43f5e]' : res === 'OPEN' ? 'bg-amber-400' : 'bg-zinc-500')} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">{t.pair}</span>
            <DirBadge dir={t.direction} />
            {img && <ImageIcon size={13} className="text-zinc-500" />}
          </div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">
            {t.time || '--:--'} · {ls.count}× layer{ls.count === 1 ? '' : 's'} · {lotsFmt(ls.lots)} lots{t.setup ? ` · ${t.setup}` : ''}
          </div>
          {t.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {t.tags.slice(0, open ? 99 : 3).map((tag) => (
                <span key={tag} className={cx('rounded-md px-1.5 py-0.5 text-[10.5px] font-medium', isMistake(tag, settings) ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300')}>
                  {tag}
                </span>
              ))}
              {!open && t.tags.length > 3 && <span className="px-1 text-[10.5px] text-zinc-500">+{t.tags.length - 3}</span>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between gap-1">
          <PnL value={t.pnl} cur={cur} className={cx('font-display text-lg font-bold md:text-xl', t.pnl > 0 ? 'text-grad-gain' : t.pnl < 0 ? 'text-grad-loss' : '')} />
          <div className="flex items-center gap-1.5">
            <ResultBadge result={res} />
            <ChevronDown size={16} className={cx('text-zinc-500 transition', open && 'rotate-180')} />
          </div>
        </div>
      </button>

      {open && (
        <div className="animate-expand border-t border-white/[0.06] bg-ink-950/40 p-3.5 md:p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 font-mono text-xs sm:grid-cols-4">
                {[
                  ['Avg entry', ls.avg == null ? '—' : priceFmt(round(ls.avg, 3))],
                  ['Exit', priceFmt(t.exitPrice)],
                  ['Stop loss', priceFmt(t.sl)],
                  ['Take profit', priceFmt(t.tp)],
                  ['Risk', t.risk ? money(t.risk, cur) : '—'],
                  ['Planned R:R', t.rr ? `1:${t.rr.toFixed(2)}` : '—'],
                  ['R multiple', rMultiple == null ? '—' : `${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(2)}R`],
                  ['Fees', t.fees ? money(t.fees, cur) : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-white/[0.03] px-2.5 py-2">
                    <div className="text-[10px] text-zinc-500">{k}</div>
                    <div className="num mt-0.5 text-zinc-100">{v}</div>
                  </div>
                ))}
              </div>

              {t.layers.length > 0 && (
                <div>
                  <div className="eyebrow mb-2 flex items-center gap-1.5">
                    <Layers size={12} /> Layer breakdown
                  </div>
                  <div className="overflow-hidden rounded-xl border border-white/[0.06]">
                    <table className="w-full font-mono text-xs">
                      <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-zinc-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">#</th>
                          <th className="px-3 py-2 text-right font-medium">Entry</th>
                          <th className="px-3 py-2 text-right font-medium">Lots</th>
                          <th className="px-3 py-2 text-right font-medium">Exit</th>
                          <th className="px-3 py-2 text-right font-medium">P&L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {t.layers.map((l, i) => {
                          const lp = layerPnl(l, t, t.contractSize);
                          return (
                            <tr key={l.id} className="num">
                              <td className="px-3 py-1.5 text-zinc-600">{i + 1}</td>
                              <td className="px-3 py-1.5 text-right text-zinc-200">{priceFmt(l.price)}</td>
                              <td className="px-3 py-1.5 text-right text-zinc-400">{lotsFmt(l.lots)}</td>
                              <td className="px-3 py-1.5 text-right text-zinc-400">{priceFmt(l.exit ?? t.exitPrice)}</td>
                              <td className={cx('px-3 py-1.5 text-right', lp == null ? 'text-zinc-500' : lp >= 0 ? 'text-gain' : 'text-loss')}>{lp == null ? '—' : money(lp, cur, { sign: true })}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t border-white/[0.08] bg-white/[0.02]">
                        <tr className="num">
                          <td className="px-3 py-2 text-zinc-500">Σ</td>
                          <td className="px-3 py-2 text-right text-zinc-200">{ls.avg == null ? '—' : priceFmt(round(ls.avg, 3))}</td>
                          <td className="px-3 py-2 text-right text-zinc-200">{lotsFmt(ls.lots)}</td>
                          <td />
                          <td className="px-3 py-2 text-right">
                            <PnL value={t.pnl} cur={cur} />
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {t.pnlMode === 'manual' && <p className="mt-1.5 text-[11px] text-zinc-500">Net P&L entered manually.</p>}
                </div>
              )}

              {t.capitalBefore != null && (
                <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5 font-mono text-xs">
                  <span className="text-zinc-500">Capital</span>
                  <span className="num text-zinc-300">
                    {money(t.capitalBefore, cur)} → <span className="text-zinc-100">{t.pnl == null ? '—' : money(t.capitalBefore + t.pnl, cur)}</span>
                    {t.pnl != null && t.capitalBefore > 0 && <span className={t.pnl >= 0 ? 'text-gain' : 'text-loss'}> ({pct((t.pnl / t.capitalBefore) * 100, 2)})</span>}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <div className="eyebrow mb-2 flex items-center gap-1.5">
                  <Brain size={12} /> Psychology notes
                </div>
                <p className={cx('whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm leading-relaxed', t.notes ? 'text-zinc-300' : 'italic text-zinc-600')}>
                  {t.notes || 'No notes written for this trade.'}
                </p>
              </div>
              <div>
                <div className="eyebrow mb-2 flex items-center gap-1.5">
                  <ImageIcon size={12} /> Chart
                </div>
                {img ? (
                  <button type="button" onClick={() => setZoom(true)} className="group relative block w-full overflow-hidden rounded-xl border border-white/[0.08] bg-black">
                    <img src={img} alt={`${t.pair} chart`} loading="lazy" className="max-h-72 w-full object-contain transition group-hover:scale-[1.02]" />
                    <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-black/70 text-zinc-300 opacity-0 backdrop-blur transition group-hover:opacity-100">
                      <Maximize2 size={14} />
                    </span>
                  </button>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/[0.08] p-4 text-center text-xs text-zinc-600">No screenshot attached</div>
                )}
                {t.imageLink && (
                  <a href={t.imageLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300">
                    Open on TradingView <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
            <button type="button" className="btn-ghost" onClick={onEdit}>
              <Pencil size={15} /> Edit
            </button>
            <button type="button" className="btn-ghost" onClick={onCopy}>
              <Copy size={15} /> Duplicate
            </button>
            <button type="button" className="btn-ghost" onClick={onReport}>
              <FileText size={15} /> PDF
            </button>
            <button type="button" className="btn-danger ml-auto" onClick={onDelete}>
              <Trash2 size={15} /> Delete
            </button>
          </div>
          <Modal open={zoom} onClose={() => setZoom(false)} title={`${t.pair} · ${fmtDate(t.date)}`} wide>
            <img src={img} alt={`${t.pair} chart full size`} className="w-full rounded-xl" />
          </Modal>
        </div>
      )}
    </Card>
  );
}

export default function HistoryView({ navigate, params }) {
  const { trades, settings, cur, dispatch } = useJournal();
  const toast = useToast();
  const [tab, setTab] = useState(params.tab === 'analytics' ? 'analytics' : 'history');
  const [q, setQ] = useState('');
  const [asset, setAsset] = useState('all');
  const [result, setResult] = useState('all');
  const [dir, setDir] = useState('all');
  const [range, setRange] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [openId, setOpenId] = useState(params.open || null);
  const [toDelete, setToDelete] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [shots, setShots] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.open) setOpenId(params.open);
    if (params.tab) setTab(params.tab);
  }, [params.open, params.tab]);

  const assets = useMemo(() => [...new Set(trades.map((t) => t.pair))].sort(), [trades]);

  const filtered = useMemo(() => {
    const today = todayStr();
    let lo = '';
    let hi = '';
    if (range === '7') lo = addDays(today, -6);
    else if (range === '30') lo = addDays(today, -29);
    else if (range === 'month') lo = `${today.slice(0, 7)}-01`;
    else if (range === 'custom') {
      lo = from;
      hi = to;
    }
    const needle = q.trim().toLowerCase();
    return newestFirst(trades).filter((t) => {
      if (asset !== 'all' && t.pair !== asset) return false;
      if (result !== 'all' && resultOf(t) !== result) return false;
      if (dir !== 'all' && t.direction !== dir) return false;
      if (lo && t.date < lo) return false;
      if (hi && t.date > hi) return false;
      if (needle) {
        const hay = `${t.pair} ${t.setup} ${t.notes} ${t.tags.join(' ')} ${t.date} ${t.direction}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [trades, q, asset, result, dir, range, from, to]);

  const summary = useMemo(() => {
    const closed = filtered.filter((t) => t.pnl != null);
    const net = closed.reduce((a, t) => a + t.pnl, 0);
    const wins = closed.filter((t) => t.pnl > 0).length;
    return { net, count: filtered.length, winRate: closed.length ? (wins / closed.length) * 100 : null };
  }, [filtered]);

  const groups = useMemo(() => {
    const m = new Map();
    for (const t of filtered) {
      if (!m.has(t.date)) m.set(t.date, []);
      m.get(t.date).push(t);
    }
    return [...m.entries()];
  }, [filtered]);

  const activeFilters = [asset !== 'all', result !== 'all', dir !== 'all', range !== 'all'].filter(Boolean).length;
  const clearFilters = () => {
    setAsset('all');
    setResult('all');
    setDir('all');
    setRange('all');
    setFrom('');
    setTo('');
    setQ('');
  };

  const rangeLabel = range === 'all' ? '' : range === 'custom' ? 'Custom range' : range === 'month' ? 'This month' : `Last ${range} days`;
  const reportOpts = { settings, cur, screenshots: shots, label: rangeLabel };
  const exportPdf = (list = filtered) => {
    if (!openPdfReport(list, reportOpts)) toast('Pop-up blocked, so the report was downloaded instead. Open it and choose Save as PDF.', { duration: 6000 });
    setReportOpen(false);
  };
  const exportWord = async () => {
    setBusy(true);
    try {
      await downloadWordReport(filtered, reportOpts);
      toast('Word report downloaded');
      setReportOpen(false);
    } catch (e) {
      toast(`Could not build the Word file: ${e.message}`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = (t) => {
    dispatch({ type: 'DELETE_TRADE', id: t.id });
    toast(`Deleted ${t.pair} trade`, { action: { label: 'Undo', onClick: () => dispatch({ type: 'SAVE_TRADE', trade: t }) }, duration: 6000 });
  };

  return (
    <div className="space-y-5">
      <PageTitle eyebrow={`${trades.length} trades on record`} title={tab === 'analytics' ? 'Performance Report' : 'Trade Ledger'} accent="acc-violet">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'history', label: 'History' }, { value: 'analytics', label: 'Analytics' }]} className="w-full sm:w-auto" />
      </PageTitle>

      {tab === 'analytics' ? (
        <div key="analytics" className="animate-view">
          <Analytics />
        </div>
      ) : (
        <div key="history" className="animate-view space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input className="input !pl-10" placeholder="Search pair, setup, tag, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
              {q && (
                <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-zinc-500 hover:text-white" aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>
            <button type="button" onClick={() => setShowFilters((v) => !v)} className={cx('btn-ghost relative !px-3.5', showFilters && 'border-emerald-500/30 text-emerald-300')} aria-label="Filters">
              <SlidersHorizontal size={17} />
              <span className="hidden sm:inline">Filters</span>
              {activeFilters > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 font-mono text-[10px] font-bold text-ink-950">{activeFilters}</span>}
            </button>
            <button type="button" onClick={() => setReportOpen(true)} disabled={!filtered.length} className="btn-ghost !px-3.5" aria-label="Export report">
              <FileDown size={17} />
              <span className="hidden sm:inline">Report</span>
            </button>
          </div>

          {showFilters && (
            <Card className="animate-expand space-y-3 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label>
                  <span className="label">Asset</span>
                  <select className="input" value={asset} onChange={(e) => setAsset(e.target.value)}>
                    <option value="all">All assets</option>
                    {assets.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </label>
                <div>
                  <span className="label">Result</span>
                  <Segmented size="sm" className="w-full" value={result} onChange={setResult} options={[{ value: 'all', label: 'All' }, { value: 'WIN', label: 'Win' }, { value: 'LOSS', label: 'Loss' }, { value: 'BE', label: 'BE' }, { value: 'OPEN', label: 'Open' }]} />
                </div>
                <div>
                  <span className="label">Direction</span>
                  <Segmented size="sm" className="w-full" value={dir} onChange={setDir} options={[{ value: 'all', label: 'All' }, { value: 'BUY', label: 'Long' }, { value: 'SELL', label: 'Short' }]} />
                </div>
              </div>
              <div>
                <span className="label">Date</span>
                <Segmented size="sm" className="w-full sm:w-auto" value={range} onChange={setRange} options={RANGES} />
                {range === 'custom' && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input type="date" className="input-mono" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
                    <input type="date" className="input-mono" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
                  </div>
                )}
              </div>
              {activeFilters > 0 && (
                <button type="button" onClick={clearFilters} className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-200 hover:underline">
                  Reset all filters
                </button>
              )}
            </Card>
          )}

          {trades.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="card px-3 py-2.5">
                <div className="eyebrow !text-[9.5px]">Showing</div>
                <div className="num font-mono text-base font-semibold text-white">{summary.count}</div>
              </div>
              <div className="card px-3 py-2.5">
                <div className="eyebrow !text-[9.5px]">Net</div>
                <PnL value={summary.net} cur={cur} className="text-base font-semibold" compact />
              </div>
              <div className="card px-3 py-2.5">
                <div className="eyebrow !text-[9.5px]">Win rate</div>
                <div className="num font-mono text-base font-semibold text-white">{pct(summary.winRate, 0)}</div>
              </div>
            </div>
          )}

          {trades.length === 0 ? (
            <Card>
              <EmptyState
                icon={ListFilter}
                title="No trades yet"
                body="Every trade you log shows up here with its layers, notes and chart."
                action={
                  <button type="button" className="btn-primary" onClick={() => navigate('new')}>
                    <Plus size={16} /> Log a trade
                  </button>
                }
              />
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <EmptyState icon={Search} title="Nothing matches" body="Try a different search or loosen the filters." action={<button type="button" className="btn-ghost" onClick={clearFilters}>Reset filters</button>} />
            </Card>
          ) : (
            <div className="space-y-5">
              {groups.map(([date, list]) => {
                const dayNet = list.reduce((a, t) => a + (t.pnl || 0), 0);
                return (
                  <section key={date}>
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-xs font-medium text-zinc-400">{relDay(date)}</span>
                      <PnL value={dayNet} cur={cur} className="text-xs" />
                    </div>
                    <div className="space-y-2">
                      {list.map((t) => (
                        <TradeCard
                          key={t.id}
                          t={t}
                          cur={cur}
                          settings={settings}
                          open={openId === t.id}
                          onToggle={() => setOpenId(openId === t.id ? null : t.id)}
                          onEdit={() => navigate('new', { edit: t.id })}
                          onCopy={() => navigate('new', { copy: t.id })}
                          onDelete={() => setToDelete(t)}
                          onReport={() => exportPdf([t])}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Export trade report">
        <p className="text-sm text-zinc-400">
          {filtered.length} trade{filtered.length === 1 ? '' : 's'} {activeFilters || q ? 'matching your filters' : 'in total'}
          {filtered.length > 0 && <> · {fmtDate(filtered.at(-1).date)} to {fmtDate(filtered[0].date)}</>}. Use Filters first to pick a week, month or date range.
        </p>
        <p className="mt-2 text-xs text-zinc-500">White, printable report: summary, a table of every trade, then each trade with its layers, tags, notes and chart.</p>
        <label className="mt-4 flex items-center gap-2.5 text-sm text-zinc-300">
          <input type="checkbox" checked={shots} onChange={(e) => setShots(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
          Include chart screenshots
        </label>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" className="btn-primary" onClick={() => exportPdf()}>
            <FileText size={16} /> PDF
          </button>
          <button type="button" className="btn-ghost" onClick={exportWord} disabled={busy}>
            <FileDown size={16} /> {busy ? 'Building…' : 'Word'}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-zinc-500">PDF opens the report and the print window: choose "Save as PDF". On phone, PDF works best.</p>
      </Modal>

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => doDelete(toDelete)}
        title="Delete this trade?"
        body={toDelete ? `${toDelete.pair} ${toDelete.direction} on ${fmtDate(toDelete.date)} (${toDelete.pnl == null ? 'open' : money(toDelete.pnl, cur, { sign: true })}). You can undo right after.` : ''}
      />
    </div>
  );
}
