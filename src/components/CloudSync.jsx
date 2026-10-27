import { Cloud, CloudOff, LogIn, LogOut, RefreshCw, Send } from 'lucide-react';
import { Card, CardHeader, cx, useToast } from './ui';
import { useJournal } from '../lib/useJournal';
import { canLinkFolder } from '../lib/backup';
import { timeAgo } from '../lib/format';

const LABEL = {
  off: ['Not set up', 'text-zinc-400'],
  connecting: ['Connecting…', 'text-sky-300'],
  'signed-out': ['Signed out', 'text-zinc-400'],
  syncing: ['Syncing…', 'text-sky-300'],
  synced: ['Synced', 'text-emerald-300'],
  offline: ['Offline · changes queued', 'text-amber-300'],
  error: ['Sync problem', 'text-rose-300'],
};

export default function CloudSyncCard() {
  const { sync, dispatch } = useJournal();
  const toast = useToast();
  const [label, tone] = LABEL[sync.user ? sync.status : sync.available ? (sync.status === 'connecting' ? 'connecting' : 'signed-out') : 'off'];

  return (
    <Card className="acc-cyan p-4 md:p-5">
      <CardHeader
        icon={sync.user ? Cloud : CloudOff}
        eyebrow="Cloud sync · phone ⇄ PC"
        title={sync.user ? sync.user.email : 'Sync your devices'}
        right={<span className={cx('font-mono text-xs', tone)}>{label}</span>}
      />
      {!sync.available ? (
        <p className="mt-3 text-sm text-zinc-400">
          Cloud sync isn't connected yet. Once your Firebase project is added, sign in with Google here on both your PC and phone and every trade syncs automatically.
        </p>
      ) : sync.user ? (
        <>
          <p className="mt-3 text-sm text-zinc-400">
            Trades, check-ins, deposits and settings sync live between every device signed in to this account. Works offline too: changes upload when you're back online.
          </p>
          <div className="mt-2 font-mono text-[11px] text-zinc-500">Last sync {sync.lastSyncAt ? timeAgo(new Date(sync.lastSyncAt).toISOString()) : '—'}</div>
          {sync.error && <p className="mt-2 text-xs text-rose-300">{sync.error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {!canLinkFolder() && (
              <button
                type="button"
                className="btn-primary !py-2 text-sm"
                onClick={() => {
                  dispatch({ type: 'META', patch: { backupRequestedAt: new Date().toISOString() } });
                  toast('Backup request sent. Your PC saves it to the linked folder next time the journal is open there.');
                }}
              >
                <Send size={15} /> Send backup to PC folder
              </button>
            )}
            <button type="button" className="btn-ghost !py-2 text-sm" onClick={() => window.location.reload()}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button type="button" className="btn-ghost !py-2 text-sm" onClick={() => sync.signOut()}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-zinc-400">
            Sign in with the same Google account on your PC and phone. Your journal on this device is merged with the cloud copy, nothing is lost.
          </p>
          {sync.error && <p className="mt-2 text-xs text-rose-300">{sync.error}</p>}
          <button type="button" className="btn-primary mt-4" onClick={() => sync.signIn().catch(() => {})}>
            <LogIn size={16} /> Sign in with Google
          </button>
        </>
      )}
    </Card>
  );
}
