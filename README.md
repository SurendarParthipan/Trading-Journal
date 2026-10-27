# Surendar Capital (trading journal)

Trading journal built with React, Vite, Tailwind CSS, Recharts, Lucide and Firebase.

## Run it on the PC

Double-click **Start Journal.bat**, or:

```bash
npm install
npm run dev
```

Then open http://localhost:5519.

## Phone + PC sync (one-time setup)

The app is hosted free on GitHub Pages and syncs through a free Firebase project.
Your trades live in your private Firebase database behind Google sign-in; they are never in the GitHub repo.

### 1. Firebase (about 5 minutes)

1. Go to https://console.firebase.google.com → **Add project** (e.g. `surendar-capital`). Google Analytics can be off.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
3. **Build → Firestore Database → Create database** → production mode → location `asia-south1 (Mumbai)`.
   Open the **Rules** tab, replace everything with the contents of `firestore.rules` in this folder, **Publish**.
4. **Project settings (gear) → Your apps → Web `</>`** → nickname `Capital` → Register.
   Copy the `firebaseConfig = { ... }` object and paste it into `src/lib/firebaseConfig.js`.
5. After the site is published: **Authentication → Settings → Authorized domains → Add domain** → `YOURNAME.github.io`.

### 2. GitHub Pages

1. Create an empty **public** repository on github.com (free Pages needs public; your data is not in it).
2. Push this folder to it (`main` branch). The workflow in `.github/workflows/deploy.yml` builds and publishes automatically.
3. Repo **Settings → Pages → Source: GitHub Actions**.
4. The app appears at `https://YOURNAME.github.io/REPO/`.

`backups/` and `_backup_plain_ui/` are in `.gitignore`, so personal files are never uploaded.

### 3. Use it

- Open the site on PC and phone, **The Vault → Cloud sync → Sign in with Google** (same account on both).
  The first sign-in merges what is already on that device with the cloud, nothing is lost.
- Phone: Chrome → menu → **Add to Home screen** (iPhone: Safari → Share → Add to Home Screen). It opens like an app and works offline; changes upload when you're back online.

## Backups

- PC (Chrome/Edge): **The Vault → Link backup folder** once. After that the PC writes `journal-auto_<date>.json` into the folder a few seconds after every change.
  If the browser asks again for folder access after a restart, click **Allow** on the small banner.
- Phone: **The Vault → Cloud sync → Send backup to PC folder**. The request syncs to the PC, which saves `journal-backup_<time>_from-phone.json` next time the journal is open there.
- **Export JSON / CSV** still work on any device (phone saves to Downloads).

## P&L maths

Per layer: `(exit − entry) × lots × contract size × direction`, summed.
Contract size defaults to 100 (XAU/USD: 1.00 lot = 100 oz). Each trade keeps the contract size it was logged with.
Deposits, withdrawals and balance corrections change the balance but never count as trading P&L.

## Streak rules

A day counts as journaled when you log a trade dated that day **or** complete the daily check-in.
Weekends never break a streak unless "Weekends count for streak" is turned on.
