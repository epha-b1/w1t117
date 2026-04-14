# Business Logic Questions Log

This file records business-level ambiguities from the prompt and implementation decisions.
Each entry follows exactly: Question + My Understanding/Hypothesis + Solution.

---

## 1) Password Policy — What Algorithm and Parameters?
Question: The prompt says "salted password hashes (Argon2 or PBKDF2)." Which should be used, and with what parameters?
My Understanding/Hypothesis: Argon2 is not available in the browser's native WebCrypto API. PBKDF2 is natively supported via `crypto.subtle.deriveKey`. Using a third-party Argon2 WASM library adds significant bundle size and complexity.
Solution: Use PBKDF2 via WebCrypto with SHA-256, 100,000 iterations, and a random 16-byte salt. This is secure, dependency-free, and runs offline. The salt is stored alongside the hash in the `users` IndexedDB store.

---

## 2) Round-Robin Assignment — What Defines "Active" Sales Coordinators?
Question: The prompt says new leads auto-assign by round-robin to "active Sales Coordinators." What makes a coordinator active?
My Understanding/Hypothesis: A Sales Coordinator is active if their `isActive` flag is `true` in the `users` store. Administrators can toggle this flag. Coordinators on leave or deactivated are excluded from the round-robin pool.
Solution: `lead.service.getNextAssignee()` queries users where `role = 'sales_coordinator' AND isActive = true`, sorts by last assignment timestamp ascending (stored in a `round_robin_state` LocalStorage key), and returns the first user. If no active coordinators exist, the lead is assigned to the Administrator.

---

## 3) SLA Reminder — 24 Hours Without Update — What Counts as an Update?
Question: The prompt says SLA reminders trigger at 24 hours without an update. What constitutes an "update"?
My Understanding/Hypothesis: Any of the following resets the SLA clock: status transition, note added to lead history, any field edit on the lead record.
Solution: `leads.lastUpdatedAt` is updated on every `updateLead` or `transitionStatus` call. `checkSlaFlags()` runs on app load and every 30 minutes via `setInterval`, comparing `lastUpdatedAt` to `now - 24h`. Flagged leads get `slaFlagged = true` and trigger an in-app notification to the assignee.

---

## 4) "Key Node" Notifications — Which Status Transitions Trigger Them?
Question: The prompt says "key node" notifications on status transitions. Are all transitions key nodes, or only specific ones?
My Understanding/Hypothesis: All status transitions are significant in a fabrication pipeline. However, the most critical transitions are: New → In Discussion (engagement started), Quoted → Confirmed (deal closed), and any → Closed (pipeline end).
Solution: All status transitions emit a notification. The notification template varies by transition: `New → In Discussion` = "Lead {{leadTitle}} is now In Discussion", `Quoted → Confirmed` = "Lead {{leadTitle}} has been Confirmed — ready for planning", `* → Closed` = "Lead {{leadTitle}} has been Closed". All transitions are logged in `lead.history`.

---

## 5) Plan Versioning — When Is a New Version Created?
Question: The prompt says plan management supports versioning with per-change BOM diffs. Does every BOM edit create a version, or does the user explicitly save a version?
My Understanding/Hypothesis: Auto-versioning on every keystroke would create excessive noise. Explicit version saves give the Planner control over meaningful checkpoints.
Solution: The BOM editor works on a live working copy (`bom_items` store). The Planner clicks "Save Version" to snapshot the current BOM into `plan_versions` with a required change note. The diff view compares any two version snapshots. Rollback replaces the live `bom_items` with a version snapshot.

---

## 6) Share Link Token — "Valid for 7 Days" — Is This Configurable?
Question: The prompt says share links are "valid for 7 days." Is this a fixed value or configurable per token?
My Understanding/Hypothesis: The prompt uses "e.g., valid for 7 days" suggesting it's an example, not a hard requirement. Allowing the Planner to choose the validity period is more useful.
Solution: The "Generate Share Link" modal has a `validDays` input (default 7, min 1, max 90). The token's `expiresAt` is set to `now + validDays * 86400000`. The ShareView validates `expiresAt > Date.now()` before rendering.

---

## 7) Delivery Coverage — ZIP Ranges + 120-Mile Limit — How Are Both Applied?
Question: The prompt specifies both ZIP code ranges and a 120-mile maximum distance from a depot. Are both conditions required, or is either sufficient?
My Understanding/Hypothesis: Both conditions must be satisfied: the recipient ZIP must be within a configured ZIP range AND within 120 miles of the assigned depot. This prevents edge cases where a ZIP range is broad but the actual distance exceeds the operational limit.
Solution: `checkCoverage()` first checks if the recipient ZIP falls within any configured ZIP range for the depot. If yes, it then computes the Haversine distance from the depot's lat/lng to the ZIP's centroid coordinates (from a bundled US ZIP code lookup table). If distance > 120 miles, coverage is denied with reason "exceeds maximum distance."

---

## 8) Freight Calculation — Oversize Surcharge — Applied Once or Per Item?
Question: The prompt says "oversize surcharge $75 when any item length > 8 ft." Is the $75 applied once per delivery or once per oversize item?
My Understanding/Hypothesis: "When any item length > 8 ft" implies a single surcharge per delivery, not per item. This is consistent with typical freight pricing where oversize handling is a flat fee per shipment.
Solution: The surcharge is applied once per delivery if at least one item has `length > 8 ft`. `calculateFreight()` checks `items.some(i => i.length > 8)` and adds $75.00 once.

---

## 9) Scheduling Time Windows — 30-Minute Slots — How Many Deliveries Per Slot?
Question: The prompt specifies 8:00 AM–6:00 PM in 30-minute slots. Is there a limit on how many deliveries can be scheduled per slot?
My Understanding/Hypothesis: The prompt does not specify a per-slot capacity limit. A simple implementation allows unlimited deliveries per slot, with the calendar view showing all deliveries in each slot.
Solution: No per-slot capacity limit is enforced. `getAvailableSlots()` returns all 20 slots (08:00–17:30) regardless of existing bookings. The calendar view groups deliveries by slot and shows a count badge. Administrators can configure a per-slot capacity limit in a future version.

---

## 10) Proof-of-Delivery Photo — Storage Format and Size Limit?
Question: The prompt says POD receipts include an "optional photo attachment." How is the photo stored offline?
My Understanding/Hypothesis: Since there is no backend, photos must be stored in IndexedDB as base64-encoded strings. Large photos could bloat IndexedDB significantly.
Solution: Photos are stored as base64 strings in `delivery_pods.photoBase64`. The UI enforces a 2 MB file size limit before encoding. The capture form uses `<input type="file" accept="image/*">` and reads the file with `FileReader.readAsDataURL()`. A warning is shown if the photo exceeds 1 MB.

---

## 11) Notification Templates — Where Are Templates Defined?
Question: The prompt mentions notification templates with variables. Are templates user-configurable or hardcoded?
My Understanding/Hypothesis: The prompt says "templates, variables, subscriptions" suggesting templates are a managed resource. However, for an offline SPA, hardcoded templates with variable substitution is simpler and more reliable than a user-editable template editor.
Solution: Templates are defined as a TypeScript constant map keyed by `eventType`. Each template has a `subject` and `body` string with `{{variableName}}` placeholders. The `NotificationService.dispatch()` method substitutes variables at dispatch time. Administrators can view but not edit templates in this version.

---

## 12) Do Not Disturb — What Happens to Notifications Queued During DND?
Question: The prompt says DND queues notifications. When does the queue flush — immediately when DND ends, or only when the user opens the app?
My Understanding/Hypothesis: Since this is a browser SPA with no background service worker, the DND flush can only happen when the app is open. A timer checks the DND window every minute while the app is running.
Solution: On app load and every 60 seconds via `setInterval`, `NotificationService.flushQueued()` is called for the current user. It checks if the current time is outside the DND window and dispatches all queued notifications. The retry queue UI shows queued notifications with a "Pending (DND)" label.

---

## 13) Ledger — "Freeze/Unfreeze" — What Does Freezing Mean Operationally?
Question: The prompt describes an escrow-style ledger with freeze/unfreeze. What does freezing funds mean in this context?
My Understanding/Hypothesis: Freezing represents earmarking funds for a specific purpose (e.g., a confirmed order). Frozen funds are subtracted from the available balance but remain in the account. Unfreezing returns them to available. Settlement draws from frozen funds.
Solution: `ledger_accounts.frozenAmount` tracks frozen funds. `freeze()` increases `frozenAmount` and decreases available balance (balance - frozenAmount). `unfreeze()` decreases `frozenAmount`. `settle()` decreases both `balance` and `frozenAmount` by the settlement amount. The UI shows both total balance and available (unfrozen) balance.

---

## 14) Web Workers — Pause/Resume — How Is the Pause Signal Communicated?
Question: The prompt says async jobs support pause/resume. How does the main thread signal a pause to a Web Worker?
My Understanding/Hypothesis: `SharedArrayBuffer` requires cross-origin isolation headers (`COOP`/`COEP`) which may not be available in all deployment contexts. Message-based pause is simpler and universally supported.
Solution: The main thread posts `{cmd: 'pause', jobId}` or `{cmd: 'resume', jobId}` to the worker. The worker checks a local `isPaused` flag before processing each chunk. When paused, the worker posts `{jobId, status: 'paused'}` back and stops processing until a resume message is received. Intermediate results are written to IndexedDB before pausing.

---

## 15) Anomaly Detection — "More Than 10 Failed Logins in 5 Minutes" — Per User or Global?
Question: The prompt says alert when more than 10 failed logins occur in 5 minutes. Is this per-username, per-IP (not available offline), or globally across all login attempts?
My Understanding/Hypothesis: Since there is no server-side IP tracking in an offline SPA, the count is global across all login attempts on the device. This catches brute-force attempts against any account.
Solution: Failed login events are stored in LocalStorage as a timestamped array. On each failed login, the array is pruned to entries within the last 5 minutes. If the count exceeds 10, an in-app alert is shown and the login form is temporarily disabled for 60 seconds. The count is also written to the audit log.

---

## 16) Encrypted Backup — Key Derivation — What Parameters?
Question: The prompt says AES-256 encryption using a user-provided passphrase. How is the AES key derived from the passphrase?
My Understanding/Hypothesis: Direct use of a passphrase as an AES key is insecure. PBKDF2 key derivation with a random salt is the standard approach.
Solution: `exportEncrypted()` generates a random 16-byte salt and 12-byte IV. PBKDF2 (100,000 iterations, SHA-256) derives a 256-bit AES-GCM key from the passphrase + salt. The backup bundle format is `{version: "1", sha256: <hex>, salt: <base64>, iv: <base64>, data: <base64>}`. The salt is stored in the bundle so the same passphrase can decrypt it later.

---

## 17) Delivery API Adapter — What Operations Does the Queue Export Contain?
Question: The prompt says the local queue "can be exported as a file for later integration testing." What format is the export?
My Understanding/Hypothesis: The export should be a JSON file containing all queued API calls with their payloads and mock responses, structured so a developer can replay them against a real API during integration testing.
Solution: `DeliveryApiService.exportQueue()` serializes all `delivery_api_queue` entries to a JSON array: `[{id, operation, payload, mockResponse, queuedAt}]`. Downloaded as `delivery-api-queue-{timestamp}.json`. Each entry includes the full request payload so it can be replayed against a real endpoint.

---

## 18) Error Rate Monitoring — "Rolling Window of 50 Jobs" — Which Job Types?
Question: The prompt says alert when error rates exceed 2% in a rolling window of 50 jobs. Is this across all job types or per job type?
My Understanding/Hypothesis: A global error rate across all job types is simpler and catches systemic issues. Per-type monitoring would require 50 jobs of each type before the window is meaningful.
Solution: `JobService.getErrorRate()` looks at the last 50 completed or failed jobs across all types. If `failedCount / 50 > 0.02` (i.e., more than 1 failure in 50), an in-app alert is triggered. The alert shows the error rate percentage and links to the job queue view.

---

## 19) Auditor Role — What Exactly Can Auditors See?
Question: The prompt says Auditor has "read-only review of logs and ledgers." Does this include leads, plans, and deliveries, or only logs and ledgers?
My Understanding/Hypothesis: The prompt is explicit enough to keep Auditor scope narrow: logs + ledgers only. Expanding Auditor into other modules risks prompt drift.
Solution: Auditors have read-only access to Audit Log and Ledger only. Auditors cannot access Lead Inbox, Plan Workspace, Delivery Calendar, Notification Center settings, User Management, or Backup/Restore. Route guards enforce this, and service-layer checks deny non-allowed operations.

---

## 20) First-Run Experience — How Are Initial Users Created?
Question: The app uses pseudo-login with locally stored users. How does the first user get created if there is no registration flow?
My Understanding/Hypothesis: A self-registration flow would allow anyone to create an account, which conflicts with the role-based access model. A seeded default admin account is more appropriate for an internal tool.
Solution: On first app load (detected by absence of any users in IndexedDB), a default admin account is created: username `admin`, password `Admin@12345` (meets complexity requirements). The app shows a first-run banner prompting the admin to change the password immediately. The admin can then create additional users via User Management.

---

## 21) User Management — Is There a Dedicated UI for Creating and Managing Users?
Question: The prompt says the Administrator "configures rules and permissions." Is there an explicit User Management screen, or is user creation implied to happen elsewhere?
My Understanding/Hypothesis: RBAC is meaningless without a way to create users with specific roles. A dedicated User Management screen is required for the Administrator to bootstrap the team.
Solution: A `/#/admin/users` route is added, accessible only to the Administrator role. It provides: user list table (username, role, isActive), create user form (username + temporary password + role), edit user (change role, toggle isActive). Every role change is written to the audit log with before/after state. This route is guarded — non-admin roles receive a 403-equivalent redirect.

---

## 22) ZIP Code Coordinate Lookup — What Is the Data Source for Offline Distance Checks?
Question: The delivery coverage check requires computing Haversine distance from a depot to a recipient ZIP. How are ZIP-to-coordinate mappings available offline?
My Understanding/Hypothesis: There is no network call allowed. A bundled static lookup table is the only viable approach.
Solution: A static JSON file `src/data/zip-coords.json` maps US ZIP codes to `{lat, lng}` centroids derived from public-domain GeoNames/USPS data. The file is bundled with the app at build time. If a ZIP is not found, `checkCoverage()` returns `{covered: false, reason: "ZIP not in lookup table"}` and the UI shows a clear error. A full US table (~42k entries, ~2 MB) is acceptable; a trimmed regional table can be used to reduce bundle size.

---

## 23) notification_reads Store — Separate Table or Status Field on Notification?
Question: The features list mentions a `notification_reads` store, but the `notifications` store already has a `status` field that includes `read`. Are read receipts tracked separately or via the status field?
My Understanding/Hypothesis: Using only a status field on the notification record means a notification can only be "read" by one user. Since notifications can be dispatched to multiple users (e.g., all Sales Coordinators), per-user read tracking requires a separate join-style store.
Solution: Both are used: `notifications.status` tracks the dispatch lifecycle (`queued | dispatched | failed`). A separate `notification_reads` store tracks per-user read receipts: `{id, notificationId, userId, readAt}`. `markRead()` inserts a record here. `listNotifications()` joins against `notification_reads` to determine unread status per user. This allows the same notification to be unread for one user and read for another.

---

## 24) Default Credentials in README — Security Disclosure?
Question: The first-run default admin password `Admin@12345` will appear in the README. Is this a security risk?
My Understanding/Hypothesis: This is an offline-only internal tool with no network exposure. The default credentials are a bootstrap mechanism, not a production secret. The first-run banner explicitly prompts the admin to change the password immediately.
Solution: The README documents the default credentials clearly under a "First Run" section with a prominent warning to change the password on first login. The credentials are not hardcoded in any service logic — they are only used in the first-run seed function, which checks for the absence of any users before creating the default account. This is disclosed behavior, not a hidden credential.
