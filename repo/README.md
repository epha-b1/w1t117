# ForgeOps Fulfillment & Planning Console

**Project Type:** web

An offline-first, single-page web application for a fabrication-and-delivery team: lead intake with round-robin assignment, BOM-based plan management with versioning and share links, delivery scheduling with freight calculation and proof-of-delivery capture, an internal escrow ledger with invoice/voucher printing, in-app notifications with DND and retry, an append-only audit log, encrypted backup/restore, a pluggable delivery-API adapter with exportable local queue, and Web Worker-backed async jobs with checkpoint persistence. No backend. All persistence is via IndexedDB + LocalStorage in the browser.

## Architecture & Tech Stack

* **Frontend:** Svelte 4 + TypeScript, bundled with Vite 5
* **Backend:** None — the app is a fully client-side SPA
* **Database:** IndexedDB (via `idb`) + LocalStorage in the user's browser
* **Async Jobs:** Dedicated Web Workers (BOM compare, bulk delivery generation, ledger reconciliation) with checkpointed pause/resume
* **Crypto:** WebCrypto (PBKDF2 for password hashing, AES-256-GCM for encrypted backups)
* **Testing:** Vitest + jsdom + fake-indexeddb, Testing Library for Svelte components
* **Containerization:** Docker & Docker Compose (Required)

## Project Structure

```text
.
├── src/
│   ├── components/         # Reusable Svelte components (layout, common, per-feature)
│   ├── routes/             # Route-level pages (LeadInbox, PlanWorkspace, DeliveryCalendar, ...)
│   ├── services/           # Business-logic services (authz, leads, plans, deliveries, ledger, jobs, ...)
│   ├── workers/            # Web Worker entry points + main↔worker protocol
│   ├── stores/             # Svelte stores (session, toasts)
│   ├── guards/             # Route guards (defence-in-depth over service-layer RBAC)
│   ├── types/              # Shared TypeScript types incl. IndexedDB schema
│   └── utils/              # Crypto, BOM diff, distance, formatting, sanitize, uid
├── tests/
│   ├── unit/               # Pure-function unit tests
│   ├── integration/        # Service + DB + RBAC integration tests
│   └── component/          # Svelte component tests
├── public/                 # Static assets served as-is
├── scripts/                # Build / tooling scripts
├── Dockerfile              # Multi-stage build (runtime + test targets) — MANDATORY
├── docker-compose.yml      # Multi-container orchestration — MANDATORY
├── run_tests.sh            # Standardized test execution script — MANDATORY
└── README.md               # Project documentation — MANDATORY
```

## Prerequisites

To ensure a consistent environment, this project is designed to run entirely within containers. You must have the following installed:
* [Docker](https://docs.docker.com/get-docker/)
* [Docker Compose **v2**](https://docs.docker.com/compose/install/) — invoked as `docker compose` (space, not hyphen)

> **Note:** The legacy Python `docker-compose` v1 has a known `KeyError: 'ContainerConfig'` bug when recreating containers built with BuildKit. Use the v2 plugin (`docker compose`) instead. If you only have v1, upgrade per the link above.

No `.env` file is required — the app has no backend and makes no network calls, so there are no secrets or API keys to configure.

## Running the Application

1. **Build and Start Containers:**
   Use Docker Compose to build the image and spin up the app in detached mode.
   ```bash
   docker compose up --build -d forgeops
   ```

2. **Access the App:**
   * Frontend: `http://localhost:5000`

   The container serves the static Vite build via `serve`. There is no separate backend API or docs endpoint — all domain logic runs in the browser.

3. **Stop the Application:**
   ```bash
   docker compose down -v
   ```

## Testing

**Docker-only.** All unit, integration, and component tests execute exclusively inside the `test` compose target (the `run_tests.sh` script has no host-side npm fallback). The script fails fast with a non-zero exit code if Docker or Docker Compose v2 is not available.

Make sure the script is executable, then run it:

```bash
chmod +x run_tests.sh
./run_tests.sh
```

What the script does:
1. Verifies `docker` is on `PATH` — exits `2` otherwise.
2. Verifies the Docker daemon is reachable — exits `2` otherwise.
3. Verifies the `docker compose` v2 plugin is installed — exits `2` otherwise.
4. Runs `docker compose run --rm --build test`, which executes `npm test` (Vitest + jsdom + fake-indexeddb) inside the container.

Exit code is `0` on test success, non-zero on test failure or missing Docker prerequisites. No `npm install` or `npm test` is ever executed on the host.

## Demo Credentials (All Roles)

> **Only the Administrator account is auto-seeded.** All other role accounts must be created by the administrator before the demo. Follow the exact steps below to provision a deterministic, testable set of credentials for every role.

### 1. Auto-seeded account (available immediately after first launch)

| Role | Username | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `Admin@12345` | Full access: user admin, permissions, backup/restore, audit log. For the demo, dismiss the first-run password-change banner; for production, change immediately. |

### 2. Administrator must create the remaining four accounts

**Exact UI path:** after logging in as `admin`, click **Users** in the left sidebar → click the **+ New user** button → fill the form → click **Create**. Repeat for each row below, using these exact sample credentials so the verification steps downstream are deterministic:

| Role | Username | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Sales Coordinator** | `sales1` | `Sales@12345` | Captures leads; receives round-robin assignments. |
| **Planner** | `planner1` | `Planner@12345` | Manages plans, BOM items, versions, share links. |
| **Dispatcher** | `dispatcher1` | `Dispatcher@12345` | Schedules deliveries, captures POD, logs exceptions. |
| **Auditor** | `auditor1` | `Auditor@12345` | Read-only access to the Audit Log and Ledger. |

After creation, each user can be logged in via the login screen using the username + password above. Passwords must be at least 8 characters — all samples satisfy that requirement.

### Role capability reference

| Role | Capabilities |
| :--- | :--- |
| **Administrator** | Full access; manages users, permissions, backup/restore, audit log |
| **Sales Coordinator** | Captures leads, receives round-robin assignments |
| **Planner** | Creates / copies / versions build plans, runs BOM diff, shares read-only links |
| **Dispatcher** | Schedules deliveries, captures proof-of-delivery, logs exceptions |
| **Auditor** | Read-only access to Audit Log and Ledger |

RBAC is enforced in the service layer (`src/services/authz.service.ts`) at the top of every mutating call — route guards are kept as defence-in-depth but the service-layer check is authoritative. The action → permitted roles map lives in `ACTION_PERMISSIONS` in the same file.

## Verification (Deterministic Smoke Test)

This is a scripted, repeatable smoke test that exercises the critical user paths end-to-end. Run it after bringing up the stack (`docker compose up --build -d forgeops`) to confirm the application is functioning. Each step has an exact **Action** and **Expected Result**; stop and investigate at the first mismatch.

All steps run in the browser against a client-side SPA — there is no backend to verify. State is persisted in the browser's IndexedDB for the active origin. To start from a clean slate, open DevTools → Application → Storage → **Clear site data** before step 1.

### Step 1 — App loads

* **Action:** Open `http://localhost:5000` in a modern browser (Chrome / Firefox / Edge).
* **Expected Result:** The login screen renders with the ForgeOps logo, a "Username" field, a "Password" field, and a **Sign in** button. No console errors in DevTools.

### Step 2 — Administrator login

* **Action:** Enter username `admin`, password `Admin@12345`, click **Sign in**.
* **Expected Result:** You are redirected to the application shell. The sidebar shows all navigation items (Lead Inbox, Plan Workspace, Delivery Calendar, Ledger, Notification Center, Audit Log, Users, Jobs). A first-run banner prompts for a password change — dismiss it to continue the smoke test.

### Step 3 — Create the four non-admin accounts (one-time setup)

* **Action:** Click **Users** in the sidebar. For each row in the "Demo Credentials" table above (`sales1`, `planner1`, `dispatcher1`, `auditor1`), click **+ New user**, enter the username / password / role exactly as listed, then click **Create**.
* **Expected Result:** Each account appears in the user list with its role badge and `Active` status. Total user count on the page is `5` (admin + 4 new).

### Step 4 — Sales Coordinator creates one lead

* **Action:** Click the account menu → **Sign out**. Log in as `sales1` / `Sales@12345`. Click **Lead Inbox** → **+ New lead**. Fill:
  * Title: `Smoke Test Lead 001`
  * Customer name: `Acme Widgets`
  * Recipient ZIP: `10001`
  * Click **Create**.
* **Expected Result:** A success toast appears. The new lead shows in the Lead Inbox table with status `New`, assigned to `sales1` (round-robin picks the sole active sales coordinator). A notification is recorded in the Notification Center bell.

### Step 5 — Confirm lead appears in Lead Inbox for other roles

* **Action:** Sign out. Log in as `admin`. Click **Lead Inbox**.
* **Expected Result:** `Smoke Test Lead 001` is visible in the list with status `New`, assignee `sales1`, ZIP `10001`.

### Step 6 — Planner promotes lead and creates a plan

* **Action:** Still as `admin`, open the lead, change status to **Confirmed**, save. Sign out. Log in as `planner1` / `Planner@12345`. Click **Plan Workspace** → **+ New plan**. Fill:
  * Title: `Smoke Test Plan 001`
  * Click **Create**.
* **Expected Result:** The plan is created and selected, showing an empty BOM table. The planner can add BOM items (skip in this smoke test unless needed).

### Step 7 — Dispatcher schedules one delivery

* **Action:** Sign out. Log in as `dispatcher1` / `Dispatcher@12345`. Click **Delivery Calendar** → **+ New delivery**. Fill:
  * Recipient ZIP: `10001`
  * Scheduled date: any weekday within coverage
  * Time slot: `10:00`
  * Click **Create**.
* **Expected Result:** A success toast appears. Freight is auto-calculated (≥ $45). The delivery appears on the calendar in the chosen slot with status `Scheduled`.

### Step 8 — Confirm delivery appears in calendar/status for other roles

* **Action:** Sign out. Log in as `admin`. Click **Delivery Calendar**.
* **Expected Result:** The delivery created in Step 7 is visible on the calendar at the scheduled date and time, with status `Scheduled` and the ZIP `10001`.

### Step 9 — Auditor read-only enforcement

* **Action:** Sign out. Log in as `auditor1` / `Auditor@12345`.
* **Expected Result:** Sidebar shows only **Audit Log** and **Ledger**. Attempting any mutating action (e.g. creating a lead via deep link) is refused with an `AuthorizationError` toast — the service-layer RBAC rejects the call.

### Step 10 — Tests pass inside Docker

* **Action:** In a terminal at the repo root, run `./run_tests.sh`.
* **Expected Result:** The script builds the `test` compose target, runs the full Vitest suite (unit, integration, component), and exits with code `0` after reporting `Test Files  N passed / Tests  M passed`.

If every step matches its expected result, the application is verified.

## Feature Highlights

* **Lead Inbox** — Capture leads; round-robin assignment to active Sales Coordinators fires an in-app notification.
* **Plan Workspace** — BOM items, versioning with required change notes, rollback, side-by-side version compare (enqueues a `bom_compare` async job), share links (1–90 days) at `#/share/<token>`.
* **Delivery Calendar** — ZIP-coverage check, Haversine freight calc ($45 base + $1.25/mi after 20 mi, +$75 oversize), 30-minute scheduling slots (08:00–17:30), POD capture with signature + optional photo, exceptions (reschedule / refused / loss-damage), bulk draft generation (enqueues a `bulk_delivery` async job).
* **Ledger** — Accounts, deposit / freeze / settle (one-time or milestone) / refund / withdraw, masked bank refs (`****NNNN`), print invoice / voucher, reconciliation (enqueues a `ledger_reconcile` async job).
* **Notification Center** — Inbox, retry queue for DND-queued / failed notifications, DND quiet hours, per-event subscriptions. Job alerts (long-running > 30 s, rolling-50 error rate > 2 %) are dispatched to all active administrators, planners, and dispatchers.
* **Audit Log** — Append-only; entries older than 180 days are purged on app load.
* **Backup & Restore** — Plain JSON (SHA-256 fingerprint) or AES-256-GCM encrypted (PBKDF2 passphrase).
* **Async Jobs** — Web Worker-backed with progress reporting, pause/resume, cancel, and **checkpoint persistence**: intermediate state is written to the `job_checkpoints` IndexedDB store during progress and on pause, so jobs can resume from the latest checkpoint after a reload.
* **Delivery API adapter** — `OfflineStubAdapter` logs every schedule/cancel/status call to `delivery_api_queue`; **Delivery Calendar → "Export Delivery API Queue"** downloads the queue as JSON for later replay. RBAC-gated and audit-logged.

## Offline Guarantees

No network calls are made in any code path. The delivery API adapter ships as `OfflineStubAdapter` that returns mock responses and logs every call to `delivery_api_queue`. The queue can be exported as JSON for later integration testing against a real backend.

## Submission Notes

* `node_modules/` and `dist/` are git-ignored and are not part of the ZIP.
* No `.env` files are committed or required.
* The seeded administrator credential is disclosed above — change immediately on first login.
