# ForgeOps Fulfillment & Planning Console — Design Document

## 1. Overview

ForgeOps is an offline-first Single Page Application for a fabrication-and-delivery team. It manages customer collaboration leads, BOM-based build plans, delivery scheduling, internal escrow-style settlement, and in-app notifications — all running entirely in the browser with no backend server. All persistence is via IndexedDB (primary data store) and LocalStorage (session flags, UI preferences). All business logic lives in a TypeScript service layer.

---

## 2. Architecture

```
Browser (Svelte SPA)
  │
  ├── Router (hash-based client-side routing)
  │     ├── Route Guards (RBAC enforcement)
  │     └── Routes: Login, LeadInbox, PlanWorkspace, DeliveryCalendar, Ledger, NotificationCenter, AuditLog, ShareView
  │
  ├── Component Layer (Svelte components)
  │     ├── AppShell (layout: sidebar + topbar + main)
  │     ├── Common: Table, Drawer, Modal, Toast, Badge, ProgressBar
  │     └── Domain: leads/, plans/, deliveries/, ledger/, notifications/, jobs/
  │
  ├── Service Layer (TypeScript classes, no network calls)
  │     ├── auth.service       → PBKDF2 hashing, session, RBAC
  │     ├── lead.service       → lead CRUD, round-robin, SLA
  │     ├── plan.service       → plan CRUD, versioning, BOM diff
  │     ├── delivery.service   → scheduling, freight calc, POD
  │     ├── ledger.service     → escrow operations, invoices
  │     ├── notification.service → dispatch, DND, retry queue
  │     ├── backup.service     → AES-256 export/import
  │     ├── audit.service      → immutable audit log
  │     ├── delivery-api.service → adapter interface + offline stub
  │     └── job.service        → Web Worker job queue
  │
  ├── Svelte Stores (reactive state)
  │     └── session, leads, plans, deliveries, ledger, notifications, jobs
  │
  ├── Web Workers (offloaded computation)
  │     ├── bom-compare.worker
  │     ├── bulk-delivery.worker
  │     └── ledger-reconcile.worker
  │
  └── Persistence
        ├── IndexedDB (primary data store)
        └── LocalStorage (session token, UI prefs, idle timestamp)
```

---

## 3. Technology Stack

| Layer | Choice |
|---|---|
| UI framework | Svelte 4 + TypeScript |
| Build tool | Vite |
| Routing | svelte-routing (hash mode) |
| Persistence | IndexedDB (idb library) + LocalStorage |
| Crypto | WebCrypto API (PBKDF2, AES-256-GCM, SHA-256) |
| Async jobs | Web Workers (native browser API) |
| Testing | Vitest + @testing-library/svelte |
| Styling | CSS custom properties (no external CSS framework) |

---

## 4. Module Responsibilities

| Module | Responsibility |
|---|---|
| `auth.service` | Pseudo-login, PBKDF2 hash/verify, session idle timeout, RBAC, anomaly detection |
| `lead.service` | Lead CRUD, round-robin assignment, SLA tracking, status transitions |
| `plan.service` | Plan CRUD, BOM editing, version snapshots, diff, rollback, share tokens |
| `delivery.service` | Delivery scheduling, coverage/distance check, freight calculation, POD, exceptions |
| `ledger.service` | Escrow accounts, freeze/unfreeze, settlements, refunds, withdrawals, invoice/voucher |
| `notification.service` | Template rendering, DND check, dispatch, read/delivery receipts, retry queue |
| `backup.service` | Full export to JSON Blob, AES-256-GCM encrypted backup, import + fingerprint validation |
| `audit.service` | Append-only audit log, 180-day retention purge |
| `delivery-api.service` | Adapter interface, offline stub, local API call queue |
| `job.service` | Web Worker lifecycle, job queue, progress tracking, pause/resume, error rate monitoring |
| `db.ts` | IndexedDB schema init, typed store accessors |

---

## 5. Data Model (IndexedDB Stores)

### users
```
id              string (uuid)  PK
username        string         UNIQUE
passwordHash    string         — PBKDF2 derived key (base64)
salt            string         — random salt (base64)
role            string         — administrator | sales_coordinator | planner | dispatcher | auditor
isActive        boolean        — inactive users excluded from round-robin
createdAt       number         — epoch ms
updatedAt       number
```

### sessions (LocalStorage only)
```
userId          string
role            string
expiresAt       number         — epoch ms (now + 15 min, refreshed on activity)
```

### leads
```
id              string (uuid)  PK
title           string
requirements    string
budget          number
availabilityStart  number      — epoch ms
availabilityEnd    number      — epoch ms
contactName     string
contactPhone    string
contactEmail    string
status          string         — new | in_discussion | quoted | confirmed | closed
assignedTo      string         — userId of assigned Sales Coordinator
lastUpdatedAt   number         — epoch ms (used for SLA check)
slaFlagged      boolean
createdAt       number
updatedAt       number
history         array          — [{timestamp, actor, fromStatus, toStatus, note}]
```

### plans
```
id              string (uuid)  PK
title           string
status          string         — draft | active | archived
tags            string[]
notes           string
currentVersion  number
createdBy       string         — userId
createdAt       number
updatedAt       number
```

### plan_versions
```
id              string (uuid)  PK
planId          string         FK plans
version         number
bom             BomItem[]      — snapshot of BOM at this version
savedBy         string         — userId
savedAt         number
changeNote      string
```

### bom_items (live working copy, separate from version snapshots)
```
id              string (uuid)  PK
planId          string         FK plans
partNumber      string
description     string
quantity        number
unit            string
unitCost        number
sortOrder       number
```

### share_tokens
```
id              string (uuid)  PK
planId          string         FK plans
token           string         UNIQUE
createdBy       string         — userId
expiresAt       number         — epoch ms
revoked         boolean
createdAt       number
```

### deliveries
```
id              string (uuid)  PK
leadId          string         FK leads (nullable)
planId          string         FK plans (nullable)
recipientName   string
recipientAddress string
recipientZip    string
depotId         string
scheduledDate   string         — YYYY-MM-DD
scheduledSlot   string         — HH:MM (30-min slot, 08:00–17:30)
status          string         — scheduled | in_transit | delivered | exception
freightCost     number         — calculated cents
distanceMiles   number
hasOversizeItem boolean
assignedDriver  string
createdAt       number
updatedAt       number
```

### delivery_pods (proof-of-delivery)
```
id              string (uuid)  PK
deliveryId      string         FK deliveries
signatureName   string
timestamp       number         — epoch ms
photoBase64     string         — optional, base64 encoded image
createdAt       number
```

### delivery_exceptions
```
id              string (uuid)  PK
deliveryId      string         FK deliveries
type            string         — reschedule | refused | loss_damage
reason          string
timestamp       number
reportedBy      string         — userId
```

### delivery_api_queue
```
id              string (uuid)  PK
operation       string         — scheduleDelivery | cancelDelivery | getStatus
payload         object
mockResponse    object
queuedAt        number
exportedAt      number         — nullable
```

### depots
```
id              string (uuid)  PK
name            string
lat             number
lng             number
zipRanges       string[]       — e.g. ["10001-10099", "10200"]
```

### ledger_accounts
```
id              string (uuid)  PK
referenceId     string         — leadId or orderId
referenceType   string         — lead | order
balance         number         — cents
frozenAmount    number         — cents
status          string         — active | closed
bankRef         string         — masked to last 4 digits in UI
createdAt       number
updatedAt       number
```

### ledger_entries
```
id              string (uuid)  PK
accountId       string         FK ledger_accounts
type            string         — freeze | unfreeze | settlement | refund | withdrawal
amount          number         — cents (positive = credit, negative = debit)
milestoneLabel  string         — for milestone settlements
status          string         — pending | completed | reversed
createdBy       string         — userId
createdAt       number
note            string
```

### notifications
```
id              string (uuid)  PK
templateId      string
eventType       string
variables       object         — key-value for template substitution
recipientId     string         — userId
status          string         — queued | dispatched | failed | read
dispatchedAt    number
readAt          number
retryCount      number
createdAt       number
```

### notification_subscriptions
```
userId          string         PK (composite)
eventType       string         PK (composite)
subscribed      boolean
```

### notification_dnd
```
userId          string         PK
startHour       number         — 0–23 (default 21)
startMinute     number         — 0 or 30
endHour         number         — 0–23 (default 7)
endMinute       number         — 0 or 30
enabled         boolean
```

### notification_reads
```
id              string (uuid)  PK
notificationId  string         FK notifications
userId          string         FK users
readAt          number         — epoch ms
```

### jobs
```
id              string (uuid)  PK
type            string         — bom_compare | bulk_delivery | ledger_reconcile
status          string         — queued | running | paused | completed | failed
progress        number         — 0–100
inputRef        string         — reference to input data in IndexedDB
resultRef       string         — reference to cached result in IndexedDB
startedAt       number
completedAt     number
errorMessage    string
runtimeMs       number
```

### audit_log
```
id              string (uuid)  PK
actor           string         — userId
action          string
resourceType    string
resourceId      string
detail          object
timestamp       number         — epoch ms
```

---

## 6. Key Flows

### Pseudo-Login

```
1. User submits username + password
2. Look up user record in IndexedDB by username
3. Derive key from password + stored salt using PBKDF2 (WebCrypto)
4. Compare derived key to stored passwordHash
5. On match: write session to LocalStorage {userId, role, expiresAt: now+15min}
6. On failure: increment failed_login_count in LocalStorage; if > 10 in 5 min → anomaly alert
7. Route guard reads session on every navigation; if expired → redirect to login
```

### Lead Round-Robin Assignment

```
1. POST lead (Sales Coordinator or Admin)
2. Query users where role = 'sales_coordinator' AND isActive = true
3. Sort by last assignment timestamp ascending (stored in LocalStorage or IndexedDB)
4. Assign lead to first user in sorted list
5. Update assignment timestamp for that user
6. Emit "lead_assigned" notification to assignee
```

### Freight Calculation

```
freightCost(distanceMiles, items):
  base = $45.00
  if distanceMiles > 20:
    base += (distanceMiles - 20) * $1.25
  if any item.length > 8ft:
    base += $75.00 (oversize surcharge, applied once)
  return base
```

### BOM Diff Algorithm

```
diff(versionA.bom, versionB.bom):
  added   = items in B not in A (matched by partNumber)
  removed = items in A not in B
  modified = items in both where quantity, unitCost, or description changed
  return {added, removed, modified}
```

### Share Token Flow

```
1. Planner clicks "Generate Share Link"
2. Service generates UUID token, stores {planId, token, expiresAt: now+(validDays*86400000), revoked: false}
3. UI shows link: /#/share/{token}
4. ShareView route: extract token from URL, look up in IndexedDB
5. Validate: token exists, not revoked, expiresAt > now
6. Render read-only plan view (no auth required)
7. Revoke: set revoked=true in IndexedDB
```

### AES-256-GCM Backup

```
Export:
1. Serialize all IndexedDB stores to JSON string
2. Compute SHA-256 of JSON string (WebCrypto)
3. Generate random salt, derive AES key from user passphrase + salt using PBKDF2 (WebCrypto)
4. Encrypt JSON with AES-256-GCM; get {iv, ciphertext}
5. Bundle: {version: "1", sha256: <hex>, salt: <base64>, iv: <base64>, data: <base64>}
6. Download as Blob

Restore:
1. Upload file, parse JSON bundle
2. Validate {version, sha256, salt, iv, data} fields present
3. Derive AES key from passphrase + bundle.salt
4. Decrypt data → plaintext JSON
5. Compute SHA-256 of plaintext; compare to bundle.sha256
6. On match: clear IndexedDB stores, restore from JSON
7. On mismatch: reject with error
```

### Web Worker Job Flow

```
1. job.service.enqueue({type, input}) → writes job record to IndexedDB, posts message to worker
2. Worker receives message, starts computation, posts progress updates: {jobId, progress, partial?}
3. job.service receives progress → updates job record, updates jobs.store (reactive)
4. If runtime > 30s: job.service triggers in-app alert
5. On complete: worker posts {jobId, result}; job.service caches result in IndexedDB
6. On pause: main thread posts {cmd: 'pause', jobId}; worker checks flag before each chunk
7. Error rate: job.service tracks last 50 job outcomes; if failed/total > 2% → alert
```

### DND Notification Queuing

```
dispatch(notification):
  user = getUserDndSettings(notification.recipientId)
  if user.dnd.enabled AND currentTimeInDndWindow(user.dnd):
    store notification with status = 'queued'
    return
  deliver(notification)  // update status = 'dispatched', set dispatchedAt

// On DND window end (checked on app focus / timer):
  flush queued notifications for user
```

---

## 7. Security Design

- Passwords: PBKDF2 via WebCrypto, 100,000 iterations, SHA-256, random 16-byte salt
- Session: stored in LocalStorage, 15-minute idle timeout, refreshed on user interaction
- RBAC: route guards check role from session; service calls check role before mutating data
- Audit log: IndexedDB store with no delete path exposed in service layer; 180-day purge on app load
- Input sanitization: all user input stripped of HTML tags before storage; Svelte templates use `{text}` binding (auto-escaped)
- Sensitive field masking: `bankRef` displayed as `****${last4}` in all UI components
- Anomaly detection: failed login counter in LocalStorage with 5-minute sliding window
- Encrypted backup: AES-256-GCM with PBKDF2-derived key; SHA-256 fingerprint validates integrity on restore
- Share tokens: UUID, stored locally, validated on access, revocable

---

## 8. Role Permissions Matrix

| Feature | Administrator | Sales Coordinator | Planner | Dispatcher | Auditor |
|---|---|---|---|---|---|
| Lead Inbox | Full | Own + Assigned | Read | Read | — |
| Plan Workspace | Full | Read | Full | Read | — |
| Delivery Calendar | Full | Read | Read | Full | — |
| Ledger | Full | Read | Read | Read | Read-only |
| Notification Center | Full | Own | Own | Own | — |
| User Management | Full | — | — | — | — |
| Backup/Restore | Full | — | — | — | — |
| Audit Log | Full | — | — | — | Read-only |

---

## 9. IndexedDB Schema Versioning

```typescript
const DB_VERSION = 1;

db.onupgradeneeded = (event) => {
  const db = event.target.result;
  // Create all stores with keyPath and indexes
  // Future versions: add new stores or indexes in version guards
  if (event.oldVersion < 1) { /* create all v1 stores */ }
  if (event.oldVersion < 2) { /* future migrations */ }
};
```

---

## 10. Vite / Build Configuration

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [svelte()],
  worker: { format: 'es' },   // Web Workers as ES modules
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
```

Static bundle served from `dist/` — can be opened directly as `file://` or served by any static file server. No server-side rendering. No API calls.

---

## 12. User Management

Accessible only to Administrator role. Route: `/#/admin/users`.

- List all users (table: username, role, isActive, createdAt)
- Create user: username + temporary password + role assignment
- Edit user: change role, toggle isActive
- Cannot delete users (soft-disable via isActive=false)
- Every role change is written to audit_log with before/after state
- Default admin credentials shown in README; first-run banner prompts password change

---

## 13. ZIP Code Coordinate Lookup

The `distance.ts` utility requires lat/lng for a given ZIP to compute Haversine distance. Since the app is fully offline:

- A bundled static JSON lookup table (`src/data/zip-coords.json`) maps US ZIP codes to `{lat, lng}` centroids
- The table is sourced from public-domain US ZIP centroid data (GeoNames / USPS-derived)
- Only ZIPs relevant to the configured depot coverage areas need to be included; a full US table (~42k entries) is acceptable at ~2 MB
- If a ZIP is not found in the table, `checkCoverage()` returns `{covered: false, reason: "ZIP not in lookup table"}`

---

## 14. Depot Seeding

On first app load (alongside default admin creation), a default depot is seeded into IndexedDB:

```json
{
  "id": "depot-default",
  "name": "Main Depot",
  "lat": 40.7128,
  "lng": -74.0060,
  "zipRanges": ["10001-10299", "07001-07099"]
}
```

Administrators can add/edit depots via the Settings section. The depot list is used by `DeliveryService.checkCoverage()` and `calculateFreight()`.

- Unit tests (Vitest): pure functions — freight calc, BOM diff, round-robin, PBKDF2, AES, DND window check, error rate calc
- Integration tests (Vitest + fake-indexeddb): service layer against in-memory IndexedDB
- Component tests (@testing-library/svelte): form validation, route guard redirect, masked display
- No E2E tests required (offline SPA, no server)
