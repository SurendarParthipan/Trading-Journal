// Cloud sync through Firestore. The local IndexedDB copy stays the source the UI reads from;
// this layer mirrors it to users/{uid} (+ trades / cashflows subcollections) and merges remote changes back.
// Firestore's own offline cache queues writes made without signal and sends them later.
import { useCallback, useEffect, useRef, useState } from 'react';
import { firebaseConfig } from './firebaseConfig';

export const syncAvailable = !!firebaseConfig;

let fbPromise;
export function loadFirebase() {
  if (!fbPromise) {
    fbPromise = (async () => {
      const [{ initializeApp }, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
      const app = initializeApp(firebaseConfig);
      const auth = A.getAuth(app);
      const db = F.initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
      });
      return { app, auth, db, A, F };
    })();
  }
  return fbPromise;
}

/** JSON with sorted keys, so the same data always hashes the same regardless of key order. */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

export const userDocOf = (s) => ({
  settings: s.settings,
  checkins: s.checkins,
  meta: { backupRequestedAt: s.meta.backupRequestedAt || null },
});
const userHash = (d) => stable({ settings: d.settings || {}, checkins: d.checkins || {}, req: d.meta?.backupRequestedAt || null });

/** Firestore documents max out at 1 MiB; a huge screenshot stays on this device only. */
function forCloud(t) {
  if (t.image && t.image.length > 850000) return { ...t, image: null, imageLocalOnly: true };
  return t;
}

export function useCloudSync(state, dispatch, ready) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(syncAvailable ? 'connecting' : 'off');
  const [error, setError] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const fb = useRef(null);
  const remote = useRef(null); // what the cloud is known to hold: { trades: Map id→updatedAt, cash: Set, userHash }
  const [merged, setMerged] = useState(false);

  useEffect(() => {
    if (!syncAvailable || !ready) return undefined;
    let unsub;
    loadFirebase()
      .then((f) => {
        fb.current = f;
        f.A.getRedirectResult(f.auth).catch(() => {});
        unsub = f.A.onAuthStateChanged(f.auth, (u) => {
          setUser(u);
          if (!u) setStatus('signed-out');
        });
      })
      .catch((e) => {
        setStatus('error');
        setError(e.message);
      });
    return () => unsub?.();
  }, [ready]);

  // First pull + live listeners while signed in.
  useEffect(() => {
    if (!user || !fb.current) return undefined;
    const { db, F } = fb.current;
    const base = F.doc(db, 'users', user.uid);
    const tradesCol = F.collection(base, 'trades');
    const cashCol = F.collection(base, 'cashflows');
    let cancelled = false;
    const unsubs = [];
    setStatus('syncing');
    (async () => {
      try {
        const [u, ts, cs] = await Promise.all([F.getDoc(base), F.getDocs(tradesCol), F.getDocs(cashCol)]);
        if (cancelled) return;
        const rTrades = ts.docs.map((d) => d.data());
        const rCash = cs.docs.map((d) => d.data());
        const rUser = u.exists() ? u.data() : null;
        remote.current = {
          trades: new Map(rTrades.map((t) => [t.id, t.updatedAt])),
          cash: new Set(rCash.map((c) => c.id)),
          userHash: rUser ? userHash(rUser) : null,
        };
        dispatch({ type: 'CLOUD_MERGE', trades: rTrades, cashflows: rCash, user: rUser });
        setMerged(true);
        setStatus('synced');
        setLastSyncAt(Date.now());

        unsubs.push(
          F.onSnapshot(tradesCol, (snap) => {
            const r = remote.current;
            snap.docChanges().forEach((ch) => {
              if (ch.doc.metadata.hasPendingWrites) return;
              const id = ch.doc.id;
              if (ch.type === 'removed') {
                if (r.trades.has(id)) {
                  r.trades.delete(id);
                  dispatch({ type: 'DELETE_TRADE', id });
                }
                return;
              }
              const t = ch.doc.data();
              if (r.trades.get(id) === t.updatedAt) return;
              r.trades.set(id, t.updatedAt);
              dispatch({ type: 'CLOUD_TRADE', trade: t });
            });
            setLastSyncAt(Date.now());
          }),
          F.onSnapshot(cashCol, (snap) => {
            const r = remote.current;
            snap.docChanges().forEach((ch) => {
              if (ch.doc.metadata.hasPendingWrites) return;
              const id = ch.doc.id;
              if (ch.type === 'removed') {
                if (r.cash.has(id)) {
                  r.cash.delete(id);
                  dispatch({ type: 'DELETE_CASHFLOW', id });
                }
                return;
              }
              if (r.cash.has(id)) return;
              r.cash.add(id);
              dispatch({ type: 'CLOUD_CASHFLOW', entry: ch.doc.data() });
            });
          }),
          F.onSnapshot(base, (snap) => {
            if (!snap.exists() || snap.metadata.hasPendingWrites) return;
            const d = snap.data();
            const h = userHash(d);
            if (h === remote.current.userHash) return;
            remote.current.userHash = h;
            dispatch({ type: 'CLOUD_USER', user: d });
          }),
        );
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setError(e.message);
        }
      }
    })();
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
      remote.current = null;
      setMerged(false);
    };
  }, [user, dispatch]);

  // Push local changes the cloud doesn't have yet.
  useEffect(() => {
    if (!user || !merged || !remote.current || !fb.current) return;
    const { db, F } = fb.current;
    const base = F.doc(db, 'users', user.uid);
    const r = remote.current;
    const writes = [];
    for (const t of state.trades) {
      if (r.trades.get(t.id) !== t.updatedAt) {
        r.trades.set(t.id, t.updatedAt);
        writes.push(F.setDoc(F.doc(base, 'trades', t.id), forCloud(t)));
      }
    }
    const tradeIds = new Set(state.trades.map((t) => t.id));
    for (const id of [...r.trades.keys()]) {
      if (!tradeIds.has(id)) {
        r.trades.delete(id);
        writes.push(F.deleteDoc(F.doc(base, 'trades', id)));
      }
    }
    for (const c of state.cashflows) {
      if (!r.cash.has(c.id)) {
        r.cash.add(c.id);
        writes.push(F.setDoc(F.doc(base, 'cashflows', c.id), c));
      }
    }
    const cashIds = new Set(state.cashflows.map((c) => c.id));
    for (const id of [...r.cash]) {
      if (!cashIds.has(id)) {
        r.cash.delete(id);
        writes.push(F.deleteDoc(F.doc(base, 'cashflows', id)));
      }
    }
    const ud = userDocOf(state);
    const h = userHash(ud);
    if (h !== r.userHash) {
      r.userHash = h;
      writes.push(F.setDoc(base, { ...ud, updatedAt: new Date().toISOString() }));
    }
    if (!writes.length) return;
    setStatus(navigator.onLine ? 'syncing' : 'offline');
    Promise.all(writes)
      .then(() => {
        setStatus('synced');
        setLastSyncAt(Date.now());
      })
      .catch((e) => {
        setStatus('error');
        setError(e.message);
      });
  }, [state, user, merged]);

  useEffect(() => {
    const on = () => user && setStatus((s) => (s === 'offline' ? 'syncing' : s));
    const off = () => user && setStatus('offline');
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [user]);

  const signIn = useCallback(async () => {
    const f = await loadFirebase();
    const provider = new f.A.GoogleAuthProvider();
    setError(null);
    try {
      await f.A.signInWithPopup(f.auth, provider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        await f.A.signInWithRedirect(f.auth, provider);
      } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        setError(e.message);
        throw e;
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    if (fb.current) await fb.current.A.signOut(fb.current.auth);
  }, []);

  return { available: syncAvailable, user, status, error, lastSyncAt, signIn, signOut };
}
