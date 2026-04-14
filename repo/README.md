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

## RBAC — enforced in the service layer
Permission checks are enforced by `src/services/authz.service.ts` and run at the
top of every mutating service function (leads, plans/BOM/versions/share tokens,
deliveries / scheduling / POD / exceptions, ledger operations, user admin,
backup import/export, delivery-API queue export, notification settings, job
enqueue/cancel). Route guards in `src/guards/route-guard.ts` are kept as a
first line of defence, but the service-layer check is authoritative — an
unauthorized call throws `AuthorizationError` regardless of how it was
invoked. The action → permitted roles map lives in `ACTION_PERMISSIONS` in
`authz.service.ts`.

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
10. **Jobs** — The Jobs page is a read-only monitor for real async work.
    Jobs are enqueued from the business pages that need them:
    - **Plan Workspace → Compare versions** enqueues a `bom_compare` job and
      renders the diff when the worker completes.
    - **Delivery Calendar → "Generate bulk drafts"** enqueues a
      `bulk_delivery` job that produces delivery drafts from confirmed leads.
    - **Ledger → "Reconcile ledger"** enqueues a `ledger_reconcile` job that
      walks every ledger entry and returns per-account totals.
    Jobs report progress, support pause/resume/cancel, alert on >30 s
    runtimes, and flag when the 50-job rolling error rate exceeds 2 %.

## Delivery API adapter & queue export
Scheduling or cancelling a delivery routes through the `OfflineStubAdapter`
(`src/services/delivery-api.service.ts`), which writes a `delivery_api_queue`
entry describing the operation plus a stub response. `getStatus` does the
same. **Delivery Calendar → "Export Delivery API Queue"** downloads the
current queue as JSON so it can be hand-replayed against a real backend
later. The export is RBAC-gated and audit-logged. A notice under the
toolbar explicitly calls out that the app makes no network calls.

## Notification failure & retry
`dispatch()` produces a `failed` notification when the event type has no
template or the recipient id is missing or invalid — this is deterministic
(no randomness). Failed notifications surface in the Notification Center's
retry queue alongside DND-queued ones. **Retry** re-evaluates the recipient's
DND window: inside DND it becomes `queued` (waits for `flushQueued`); outside
DND it flips to `dispatched` and bumps `retryCount`.

## Offline Guarantees
No network calls are made in any code path. The delivery API adapter ships as `OfflineStubAdapter` that returns mock responses and logs every call to `delivery_api_queue`; the queue can be exported as JSON for later integration testing.

## Container / submission notes
- `node_modules/` and `dist/` are git-ignored and are not part of the ZIP.
- No `.env` files are committed.
- Default credentials are disclosed here — change immediately on first login.
