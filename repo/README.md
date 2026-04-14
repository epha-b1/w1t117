# ForgeOps Fulfillment & Planning Console

Offline-first Svelte + TypeScript SPA for a fabrication-and-delivery team: lead intake, BOM-based plan management with versioning and sharing, delivery scheduling with freight calc + POD, in-app notifications with DND, internal escrow ledger, append-only audit log, encrypted backups, a pluggable delivery-API adapter with an exportable local queue, and Web Worker-backed async jobs. No backend. All persistence is via IndexedDB + LocalStorage.

## Requirements
- Node.js 18+
- npm 9+
- (optional) Docker 24+ for containerised preview

## Setup
```
cd repo
npm install
```

## Run dev server
```
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173).

## Build
```
npm run build
```

Produces a static bundle in `dist/`. It can be served by any static server or opened directly.

## Docker
```
docker compose up --build
```

Builds the static bundle inside the image and serves it on http://localhost:5000 via `serve`. Stop with `Ctrl+C`.

## Tests
```
./run_tests.sh
```

Runs unit, integration, and component tests via Vitest (jsdom + fake-indexeddb).

## First Run
On first load, a default admin account is seeded so the app is usable out of the box:

- **Username:** `admin`
- **Password:** `Admin@12345`

A first-run banner prompts the administrator to change the password immediately. These credentials exist only for bootstrap; they are not referenced anywhere outside of the one-time seed.

## Roles
- **Administrator** — full access; manages users, permissions, backup/restore, audit log
- **Sales Coordinator** — captures leads, receives round-robin assignments
- **Planner** — creates / copies / versions build plans, runs BOM diff, shares read-only links
- **Dispatcher** — schedules deliveries, captures proof-of-delivery, logs exceptions
- **Auditor** — read-only access to Audit Log and Ledger only

## Feature Walkthrough

1. **Login** as `admin / Admin@12345`. Dismiss or complete the first-run password change.
2. **Create users** at `Users` (sidebar) with the role appropriate to each teammate.
3. **Lead Inbox** — Create a lead. With at least one active Sales Coordinator, round-robin assignment fires automatically and an in-app notification is dispatched.
4. **Plan Workspace** — Create a plan, add BOM items, save versions with a required change note. Rollback or compare any two versions side-by-side. Generate a share link (1–90 days) — visit `#/share/<token>` in a new tab to see the read-only view.
5. **Delivery Calendar** — Create a delivery for an in-coverage ZIP. Freight is computed from Haversine distance to the default depot ($45 base + $1.25/mi after 20 mi, +$75 when any item length > 8 ft). Schedule into a 30-minute slot (08:00–17:30). Capture POD with signature + optional photo. Log exceptions (reschedule / refused / loss-damage).
6. **Notification Center** — Inbox, retry queue for DND-queued / failed notifications, DND quiet hours, per-event subscriptions.
7. **Ledger** — Create an account, deposit, freeze, settle (one-time or milestone), refund, withdraw. Bank refs mask to `****NNNN`. Print invoice / voucher via browser print.
8. **Audit Log** — Every auth / lead / plan / delivery / ledger / backup action is appended immutably. Entries older than 180 days are purged on app load.
9. **Backup & Restore** — Plain JSON export with SHA-256 fingerprint check, or AES-256-GCM encrypted backup with user passphrase (PBKDF2 key derivation).
10. **Jobs** — Enqueue BOM compare / bulk delivery generation / ledger reconciliation into Web Workers. Jobs report progress, support pause/resume/cancel, alert on >30 s runtimes, and flag when the 50-job rolling error rate exceeds 2 %.

## Offline Guarantees
No network calls are made in any code path. The delivery API adapter ships as `OfflineStubAdapter` that returns mock responses and logs every call to `delivery_api_queue`; the queue can be exported as JSON for later integration testing.

## Container / submission notes
- `node_modules/` and `dist/` are git-ignored and are not part of the ZIP.
- No `.env` files are committed.
- Default credentials are disclosed here — change immediately on first login.
