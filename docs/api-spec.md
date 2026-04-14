# ForgeOps Service Layer Interface Specification

This document specifies the TypeScript service layer interfaces. There is no HTTP API — all calls are in-process function calls within the browser. Each service operates on IndexedDB stores via the `db.ts` wrapper.

---

## AuthService

```typescript
interface AuthService {
  // Register a new user (admin only after first run)
  register(username: string, password: string, role: UserRole): Promise<User>;

  // Verify credentials, write session to LocalStorage
  login(username: string, password: string): Promise<Session>;

  // Clear session from LocalStorage
  logout(): void;

  // Get current session (null if expired or not set)
  getSession(): Session | null;

  // Refresh idle timeout (call on user interaction)
  refreshSession(): void;

  // Change own password
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;

  // Get failed login count in last 5 minutes (for anomaly detection)
  getRecentFailedLoginCount(): number;

  // List all users (admin only)
  listUsers(): Promise<User[]>;

  // Update user role or active status (admin only)
  updateUser(userId: string, patch: Partial<Pick<User, 'role' | 'isActive'>>): Promise<User>;
}

type UserRole = 'administrator' | 'sales_coordinator' | 'planner' | 'dispatcher' | 'auditor';

interface User {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  role: UserRole;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

interface Session {
  userId: string;
  role: UserRole;
  expiresAt: number;
}
```

---

## LeadService

```typescript
interface LeadService {
  // Create lead; auto-assigns to next Sales Coordinator by round-robin
  createLead(input: CreateLeadInput): Promise<Lead>;

  // Get lead by ID
  getLead(id: string): Promise<Lead>;

  // List leads with optional filters
  listLeads(filters?: LeadFilters): Promise<Lead[]>;

  // Update lead fields
  updateLead(id: string, patch: Partial<LeadFields>, actorId: string): Promise<Lead>;

  // Transition lead status; emits key-node notification
  transitionStatus(id: string, newStatus: LeadStatus, actorId: string, note?: string): Promise<Lead>;

  // Check and flag leads with no update in 24 hours
  checkSlaFlags(): Promise<void>;

  // Get round-robin assignment target (next active Sales Coordinator)
  getNextAssignee(): Promise<string>; // returns userId
}

type LeadStatus = 'new' | 'in_discussion' | 'quoted' | 'confirmed' | 'closed';

interface CreateLeadInput {
  title: string;
  requirements: string;
  budget: number;
  availabilityStart: number;
  availabilityEnd: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

interface LeadFilters {
  status?: LeadStatus;
  assignedTo?: string;
  search?: string;
  slaFlagged?: boolean;
}
```

---

## PlanService

```typescript
interface PlanService {
  // Create new plan
  createPlan(input: CreatePlanInput, actorId: string): Promise<Plan>;

  // Copy plan (creates new plan with same BOM, version 1)
  copyPlan(planId: string, newTitle: string, actorId: string): Promise<Plan>;

  // Get plan with current BOM
  getPlan(id: string): Promise<PlanWithBom>;

  // List plans with optional filters
  listPlans(filters?: PlanFilters): Promise<Plan[]>;

  // Update plan metadata (title, tags, notes, status)
  updatePlan(id: string, patch: Partial<PlanFields>, actorId: string): Promise<Plan>;

  // Save current BOM as a new version snapshot
  saveVersion(planId: string, changeNote: string, actorId: string): Promise<PlanVersion>;

  // List all versions for a plan
  listVersions(planId: string): Promise<PlanVersion[]>;

  // Rollback plan BOM to a specific version
  rollback(planId: string, versionId: string, actorId: string): Promise<Plan>;

  // Diff two versions (or two plans at their current version)
  diff(versionAId: string, versionBId: string): BomDiff;

  // BOM item CRUD
  addBomItem(planId: string, item: Omit<BomItem, 'id' | 'planId'>): Promise<BomItem>;
  updateBomItem(itemId: string, patch: Partial<BomItem>): Promise<BomItem>;
  removeBomItem(itemId: string): Promise<void>;

  // Share token management
  generateShareToken(planId: string, validDays: number, actorId: string): Promise<ShareToken>;
  revokeShareToken(tokenId: string, actorId: string): Promise<void>;
  validateShareToken(token: string): Promise<PlanWithBom | null>;
  listShareTokens(planId: string): Promise<ShareToken[]>;
}

interface BomItem {
  id: string;
  planId: string;
  partNumber: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  sortOrder: number;
}

interface BomDiff {
  added: BomItem[];
  removed: BomItem[];
  modified: Array<{ before: BomItem; after: BomItem; changedFields: string[] }>;
}

interface PlanFilters {
  status?: 'draft' | 'active' | 'archived';
  tag?: string;
  search?: string;
  createdBy?: string;
}

interface PlanFields {
  title: string;
  status: 'draft' | 'active' | 'archived';
  tags: string[];
  notes: string;
}

interface ShareToken {
  id: string;
  planId: string;
  token: string;
  createdBy: string;
  expiresAt: number;
  revoked: boolean;
  createdAt: number;
}
```

---

## DeliveryService

```typescript
interface DeliveryService {
  // Check if ZIP is within coverage (ZIP range + 120-mile limit from depot)
  checkCoverage(recipientZip: string, depotId: string): Promise<CoverageResult>;

  // Calculate freight cost
  calculateFreight(distanceMiles: number, items: DeliveryItem[]): FreightResult;

  // Create delivery order
  createDelivery(input: CreateDeliveryInput, actorId: string): Promise<Delivery>;

  // List deliveries with filters
  listDeliveries(filters?: DeliveryFilters): Promise<Delivery[]>;

  // Get delivery by ID
  getDelivery(id: string): Promise<Delivery>;

  // Schedule delivery to a time slot
  scheduleDelivery(deliveryId: string, date: string, slot: string, actorId: string): Promise<Delivery>;

  // Get available slots for a date
  getAvailableSlots(date: string): string[]; // returns ["08:00", "08:30", ...]

  // Capture proof-of-delivery
  capturePod(deliveryId: string, pod: PodInput, actorId: string): Promise<DeliveryPod>;

  // Log delivery exception
  logException(deliveryId: string, exception: ExceptionInput, actorId: string): Promise<DeliveryException>;

  // Depot management
  listDepots(): Promise<Depot[]>;
  addDepot(depot: Omit<Depot, 'id'>): Promise<Depot>;
}

interface FreightResult {
  baseCost: number;       // cents
  perMileCost: number;    // cents
  oversizeSurcharge: number; // cents (0 or 7500)
  totalCost: number;      // cents
  distanceMiles: number;
  hasOversizeItem: boolean;
}

interface DeliveryItem {
  id: string;
  description: string;
  length?: number;   // feet — used for oversize check
  quantity: number;
}

interface DeliveryFilters {
  status?: 'scheduled' | 'in_transit' | 'delivered' | 'exception';
  date?: string;       // YYYY-MM-DD
  recipientZip?: string;
  depotId?: string;
}

interface CreateDeliveryInput {
  leadId?: string;
  planId?: string;
  recipientName: string;
  recipientAddress: string;
  recipientZip: string;
  depotId: string;
  items: DeliveryItem[];
  assignedDriver?: string;
}

interface CoverageResult {
  covered: boolean;
  distanceMiles: number;
  reason?: string; // if not covered
}

interface PodInput {
  signatureName: string;
  timestamp: number;
  photoBase64?: string;
}

interface ExceptionInput {
  type: 'reschedule' | 'refused' | 'loss_damage';
  reason: string;
}
```

---

## LedgerService

```typescript
interface LedgerService {
  // Create ledger account for a lead/order
  createAccount(referenceId: string, referenceType: 'lead' | 'order', bankRef: string): Promise<LedgerAccount>;

  // Get account by ID
  getAccount(id: string): Promise<LedgerAccount>;

  // List accounts
  listAccounts(filters?: { referenceType?: string }): Promise<LedgerAccount[]>;

  // Freeze funds
  freeze(accountId: string, amount: number, actorId: string, note?: string): Promise<LedgerEntry>;

  // Unfreeze funds
  unfreeze(accountId: string, amount: number, actorId: string, note?: string): Promise<LedgerEntry>;

  // Settle (milestone or one-time)
  settle(accountId: string, amount: number, type: 'milestone' | 'one_time', milestoneLabel: string | null, actorId: string): Promise<LedgerEntry>;

  // Refund (full or partial)
  refund(accountId: string, amount: number, actorId: string, note?: string): Promise<LedgerEntry>;

  // Withdrawal (internal record)
  withdraw(accountId: string, amount: number, actorId: string, note?: string): Promise<LedgerEntry>;

  // List entries for an account
  listEntries(accountId: string): Promise<LedgerEntry[]>;

  // Generate printable invoice data
  generateInvoice(accountId: string): Promise<InvoiceData>;

  // Generate printable voucher data
  generateVoucher(entryId: string): Promise<VoucherData>;

  // Mask bank reference (returns last 4 digits with asterisks)
  maskBankRef(bankRef: string): string;
}

interface LedgerAccount {
  id: string;
  referenceId: string;
  referenceType: string;
  balance: number;
  frozenAmount: number;
  status: 'active' | 'closed';
  bankRef: string;
  createdAt: number;
  updatedAt: number;
}

interface InvoiceData {
  invoiceNumber: string;
  account: LedgerAccount;
  entries: LedgerEntry[];
  totalAmount: number;
  generatedAt: number;
}

interface VoucherData {
  voucherNumber: string;
  entry: LedgerEntry;
  account: LedgerAccount;
  generatedAt: number;
}

interface LedgerEntry {
  id: string;
  accountId: string;
  type: 'freeze' | 'unfreeze' | 'settlement' | 'refund' | 'withdrawal';
  amount: number;
  milestoneLabel: string | null;
  status: 'pending' | 'completed' | 'reversed';
  createdBy: string;
  createdAt: number;
  note: string;
}
```

---

## NotificationService

```typescript
interface NotificationService {
  // Dispatch a notification (respects DND, subscriptions)
  dispatch(eventType: string, recipientId: string, variables: Record<string, string>): Promise<Notification>;

  // List notifications for current user
  listNotifications(userId: string, filters?: { unreadOnly?: boolean }): Promise<Notification[]>;

  // Mark notification as read
  markRead(notificationId: string, userId: string): Promise<void>;

  // Mark all as read
  markAllRead(userId: string): Promise<void>;

  // Get retry queue (failed dispatches)
  getRetryQueue(userId: string): Promise<Notification[]>;

  // Retry a failed notification
  retry(notificationId: string): Promise<void>;

  // Flush queued notifications (called when DND window ends)
  flushQueued(userId: string): Promise<void>;

  // DND settings
  getDndSettings(userId: string): Promise<DndSettings>;
  updateDndSettings(userId: string, settings: DndSettings): Promise<void>;

  // Subscription management
  getSubscriptions(userId: string): Promise<NotificationSubscription[]>;
  updateSubscription(userId: string, eventType: string, subscribed: boolean): Promise<void>;
}

interface DndSettings {
  userId: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  enabled: boolean;
}
```

---

## BackupService

```typescript
interface BackupService {
  // Export all data as JSON Blob (unencrypted)
  exportData(): Promise<Blob>;

  // Import from JSON Blob (validates format + SHA-256)
  importData(file: File): Promise<ImportResult>;

  // Export encrypted backup bundle
  exportEncrypted(passphrase: string): Promise<Blob>;

  // Import encrypted backup bundle
  importEncrypted(file: File, passphrase: string): Promise<ImportResult>;
}

interface ImportResult {
  success: boolean;
  recordsRestored: number;
  error?: string;
}
```

---

## AuditService

```typescript
interface AuditService {
  // Append audit entry (no delete path)
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void>;

  // List audit entries with filters
  listEntries(filters?: AuditFilters): Promise<AuditEntry[]>;

  // Purge entries older than 180 days (called on app load)
  purgeOldEntries(): Promise<number>; // returns count purged
}

interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  detail: Record<string, unknown>;
  timestamp: number;
}

interface AuditFilters {
  actor?: string;
  action?: string;
  resourceType?: string;
  from?: number;
  to?: number;
}
```

---

## DeliveryApiService (Adapter)

```typescript
interface DeliveryApiAdapter {
  scheduleDelivery(payload: ScheduleDeliveryPayload): Promise<DeliveryApiResponse>;
  cancelDelivery(deliveryId: string): Promise<DeliveryApiResponse>;
  getStatus(deliveryId: string): Promise<DeliveryApiResponse>;
}

interface ScheduleDeliveryPayload {
  deliveryId: string;
  recipientName: string;
  recipientAddress: string;
  recipientZip: string;
  scheduledDate: string;
  scheduledSlot: string;
  items: DeliveryItem[];
}

interface DeliveryApiResponse {
  success: boolean;
  externalId?: string;
  status?: string;
  message?: string;
}

interface DeliveryApiQueueEntry {
  id: string;
  operation: 'scheduleDelivery' | 'cancelDelivery' | 'getStatus';
  payload: ScheduleDeliveryPayload | { deliveryId: string };
  mockResponse: DeliveryApiResponse;
  queuedAt: number;
  exportedAt: number | null;
}

// Offline stub implementation — no network calls
class OfflineStubAdapter implements DeliveryApiAdapter {
  // Returns mock responses and logs to delivery_api_queue in IndexedDB
}

interface DeliveryApiService {
  // Get the active adapter (always OfflineStubAdapter in this build)
  getAdapter(): DeliveryApiAdapter;

  // Export the local API call queue as a JSON file
  exportQueue(): Promise<Blob>;

  // List queued API calls
  listQueue(): Promise<DeliveryApiQueueEntry[]>;
}
```

---

## JobService

```typescript
interface JobService {
  // Enqueue a job
  enqueue(type: JobType, input: unknown): Promise<Job>;

  // Get job by ID
  getJob(id: string): Promise<Job>;

  // List all jobs
  listJobs(): Promise<Job[]>;

  // Pause a running job
  pause(jobId: string): Promise<void>;

  // Resume a paused job
  resume(jobId: string): Promise<void>;

  // Cancel a job
  cancel(jobId: string): Promise<void>;

  // Get error rate over last 50 jobs (0.0–1.0)
  getErrorRate(): number;
}

type JobType = 'bom_compare' | 'bulk_delivery' | 'ledger_reconcile';

interface Job {
  id: string;
  type: JobType;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number;
  inputRef: string;
  resultRef: string | null;
  startedAt: number | null;
  completedAt: number | null;
  errorMessage: string | null;
  runtimeMs: number | null;
}
```

---

## Utility Functions

```typescript
// freight.ts
function calculateFreight(distanceMiles: number, items: { length?: number }[]): FreightResult

// distance.ts
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number // miles
function zipToCoords(zip: string): { lat: number; lng: number } | null // from local lookup table

// bom-diff.ts
function diffBom(a: BomItem[], b: BomItem[]): BomDiff

// round-robin.ts
function getNextAssignee(users: User[], lastAssignments: Record<string, number>): string

// crypto.ts
function hashPassword(password: string): Promise<{ hash: string; salt: string }>
function verifyPassword(password: string, hash: string, salt: string): Promise<boolean>
function encryptAes256Gcm(plaintext: string, passphrase: string): Promise<{ iv: string; data: string }>
function decryptAes256Gcm(iv: string, data: string, passphrase: string): Promise<string>
function sha256Hex(input: string): Promise<string>

// validation.ts
function sanitizeText(input: string): string  // strips HTML tags
function validateEmail(email: string): boolean
function validatePhone(phone: string): boolean
function validateBudget(value: unknown): boolean

// format.ts
function maskBankRef(ref: string): string  // "****1234"
function formatCurrency(cents: number): string  // "$45.00"
function formatDate(epochMs: number): string
```
