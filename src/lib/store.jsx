import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { idbGet, idbSet } from './idb';
import { normalizeTrade, normalizeCashflow } from './calc';
import { DEFAULT_SETTINGS } from './constants';
import { useCloudSync } from './sync';

const KEY = 'state-v1';
const MIRROR = 'sj-mirror-v1';

const emptyState = () => ({
  trades: [],
  cashflows: [],
  checkins: {},
  settings: { ...DEFAULT_SETTINGS },
  meta: { lastBackupAt: null, createdAt: new Date().toISOString() },
});

export function hydrate(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const settings = { ...base.settings, ...(raw.settings || {}) };
  return {
    trades: (Array.isArray(raw.trades) ? raw.trades : []).map((t) => normalizeTrade(t, settings.contractSize)),
    cashflows: (Array.isArray(raw.cashflows) ? raw.cashflows : []).map(normalizeCashflow).filter(Boolean),
    checkins: raw.checkins && typeof raw.checkins === 'object' ? raw.checkins : {},
    settings,
    meta: { ...base.meta, ...(raw.meta || {}) },
  };
}

function reducer(s, a) {
  switch (a.type) {
    case 'LOAD':
      return a.state;
    case 'SAVE_TRADE': {
      const exists = s.trades.some((t) => t.id === a.trade.id);
      return { ...s, trades: exists ? s.trades.map((t) => (t.id === a.trade.id ? a.trade : t)) : [...s.trades, a.trade] };
    }
    case 'DELETE_TRADE':
      return { ...s, trades: s.trades.filter((t) => t.id !== a.id) };
    case 'ADD_CASHFLOW':
      return { ...s, cashflows: [...s.cashflows, a.entry] };
    case 'DELETE_CASHFLOW':
      return { ...s, cashflows: s.cashflows.filter((c) => c.id !== a.id) };
    case 'CHECKIN':
      return { ...s, checkins: { ...s.checkins, [a.date]: a.entry } };
    case 'REMOVE_CHECKIN': {
      const c = { ...s.checkins };
      delete c[a.date];
      return { ...s, checkins: c };
    }
    case 'SETTINGS':
      return { ...s, settings: { ...s.settings, ...a.patch } };
    case 'META':
      return { ...s, meta: { ...s.meta, ...a.patch } };
    case 'IMPORT': {
      const inc = hydrate(a.data);
      if (a.mode === 'replace') return { ...inc, meta: { ...inc.meta, lastBackupAt: s.meta.lastBackupAt } };
      const byId = new Map(s.trades.map((t) => [t.id, t]));
      for (const t of inc.trades) {
        const cur = byId.get(t.id);
        if (!cur || (t.updatedAt || '') > (cur.updatedAt || '')) byId.set(t.id, t);
      }
      const cf = new Map(s.cashflows.map((c) => [c.id, c]));
      for (const c of inc.cashflows) if (!cf.has(c.id)) cf.set(c.id, c);
      return { ...s, trades: [...byId.values()], cashflows: [...cf.values()], checkins: { ...inc.checkins, ...s.checkins } };
    }
    case 'CLOUD_MERGE': {
      const byId = new Map(s.trades.map((t) => [t.id, t]));
      for (const raw of a.trades) {
        const t = normalizeTrade(raw, raw.contractSize || s.settings.contractSize);
        const cur = byId.get(t.id);
        if (!cur || (t.updatedAt || '') >= (cur.updatedAt || '')) byId.set(t.id, cur?.image && !t.image && raw.imageLocalOnly ? { ...t, image: cur.image } : t);
      }
      const cf = new Map(s.cashflows.map((c) => [c.id, c]));
      for (const raw of a.cashflows) {
        const c = normalizeCashflow(raw);
        if (c && !cf.has(c.id)) cf.set(c.id, c);
      }
      const next = { ...s, trades: [...byId.values()], cashflows: [...cf.values()] };
      if (a.user) {
        next.settings = { ...DEFAULT_SETTINGS, ...(a.user.settings || {}) };
        next.checkins = { ...s.checkins, ...(a.user.checkins || {}) };
        next.meta = { ...s.meta, backupRequestedAt: a.user.meta?.backupRequestedAt || s.meta.backupRequestedAt || null };
      }
      return next;
    }
    case 'CLOUD_TRADE': {
      const t = normalizeTrade(a.trade, a.trade.contractSize || s.settings.contractSize);
      const cur = s.trades.find((x) => x.id === t.id);
      if (cur && (cur.updatedAt || '') > (t.updatedAt || '')) return s;
      const keep = cur?.image && !t.image && a.trade.imageLocalOnly ? { ...t, image: cur.image } : t;
      return { ...s, trades: cur ? s.trades.map((x) => (x.id === t.id ? keep : x)) : [...s.trades, keep] };
    }
    case 'CLOUD_CASHFLOW': {
      const c = normalizeCashflow(a.entry);
      if (!c || s.cashflows.some((x) => x.id === c.id)) return s;
      return { ...s, cashflows: [...s.cashflows, c] };
    }
    case 'CLOUD_USER':
      return {
        ...s,
        settings: { ...DEFAULT_SETTINGS, ...(a.user.settings || {}) },
        checkins: a.user.checkins || {},
        meta: { ...s.meta, backupRequestedAt: a.user.meta?.backupRequestedAt || null },
      };
    case 'RESET':
      return emptyState();
    default:
      return s;
  }
}

const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, emptyState);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [persisted, setPersisted] = useState(null);
  const lsOnly = useRef(false);
  const skipFirst = useRef(true);

  useEffect(() => {
    (async () => {
      let raw = null;
      try {
        raw = await idbGet(KEY);
      } catch {
        lsOnly.current = true;
      }
      if (!raw) {
        try {
          raw = JSON.parse(localStorage.getItem(MIRROR) || 'null');
        } catch { /* ignore */ }
      }
      dispatch({ type: 'LOAD', state: hydrate(raw) });
      setReady(true);
      try {
        setPersisted(await navigator.storage?.persist?.());
      } catch { /* not supported */ }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    setSaveStatus('saving');
    // Small mirror without uploaded images: a second copy in case IndexedDB is ever wiped.
    try {
      const lite = lsOnly.current
        ? state
        : { ...state, trades: state.trades.map((t) => (t.image?.startsWith('data:') ? { ...t, image: null } : t)) };
      localStorage.setItem(MIRROR, JSON.stringify(lite));
    } catch { /* quota */ }
    if (lsOnly.current) {
      setSaveStatus('saved');
      return;
    }
    idbSet(KEY, state)
      .then(() => setSaveStatus('saved'))
      .catch(() => setSaveStatus('error'));
  }, [state, ready]);

  const sync = useCloudSync(state, dispatch, ready);
  const value = useMemo(() => ({ state, dispatch, ready, saveStatus, persisted, sync }), [state, ready, saveStatus, persisted, sync]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);
