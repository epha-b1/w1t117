import { openDB, type IDBPDatabase } from 'idb';
import type { DbSchema, StoreName } from '../types/db.types';

export const DB_NAME = 'forgeops';
export const DB_VERSION = 2;

const STORE_DEFS: Array<{
  name: StoreName;
  keyPath?: string | string[];
  indexes?: Array<{ name: string; keyPath: string | string[]; unique?: boolean }>;
}> = [
  { name: 'users', keyPath: 'id', indexes: [
    { name: 'by_username', keyPath: 'username', unique: true },
    { name: 'by_role', keyPath: 'role' }
  ]},
  { name: 'leads', keyPath: 'id', indexes: [
    { name: 'by_status', keyPath: 'status' },
    { name: 'by_assignedTo', keyPath: 'assignedTo' }
  ]},
  { name: 'plans', keyPath: 'id', indexes: [{ name: 'by_status', keyPath: 'status' }] },
  { name: 'plan_versions', keyPath: 'id', indexes: [{ name: 'by_plan', keyPath: 'planId' }] },
  { name: 'bom_items', keyPath: 'id', indexes: [{ name: 'by_plan', keyPath: 'planId' }] },
  { name: 'share_tokens', keyPath: 'id', indexes: [
    { name: 'by_plan', keyPath: 'planId' },
    { name: 'by_token', keyPath: 'token', unique: true }
  ]},
  { name: 'deliveries', keyPath: 'id', indexes: [
    { name: 'by_status', keyPath: 'status' },
    { name: 'by_date', keyPath: 'scheduledDate' },
    { name: 'by_zip', keyPath: 'recipientZip' }
  ]},
  { name: 'delivery_pods', keyPath: 'id', indexes: [{ name: 'by_delivery', keyPath: 'deliveryId' }] },
  { name: 'delivery_exceptions', keyPath: 'id', indexes: [{ name: 'by_delivery', keyPath: 'deliveryId' }] },
  { name: 'delivery_api_queue', keyPath: 'id' },
  { name: 'depots', keyPath: 'id' },
  { name: 'ledger_accounts', keyPath: 'id', indexes: [{ name: 'by_reference', keyPath: 'referenceId' }] },
  { name: 'ledger_entries', keyPath: 'id', indexes: [{ name: 'by_account', keyPath: 'accountId' }] },
  { name: 'notifications', keyPath: 'id', indexes: [
    { name: 'by_recipient', keyPath: 'recipientId' },
    { name: 'by_status', keyPath: 'status' }
  ]},
  { name: 'notification_reads', keyPath: 'id', indexes: [
    { name: 'by_user', keyPath: 'userId' },
    { name: 'by_notification', keyPath: 'notificationId' },
    { name: 'by_user_notification', keyPath: ['userId', 'notificationId'], unique: true }
  ]},
  { name: 'notification_subscriptions', keyPath: ['userId', 'eventType'] },
  { name: 'notification_dnd', keyPath: 'userId' },
  { name: 'jobs', keyPath: 'id', indexes: [{ name: 'by_status', keyPath: 'status' }] },
  { name: 'job_inputs', keyPath: 'id' },
  { name: 'job_results', keyPath: 'id' },
  { name: 'job_checkpoints', keyPath: 'jobId' },
  { name: 'audit_log', keyPath: 'id', indexes: [
    { name: 'by_timestamp', keyPath: 'timestamp' },
    { name: 'by_actor', keyPath: 'actor' },
    { name: 'by_action', keyPath: 'action' },
    { name: 'by_resourceType', keyPath: 'resourceType' }
  ]}
];

let dbPromise: Promise<IDBPDatabase> | null = null;

export async function __resetForTests(): Promise<void> {
  // Clear every store via fully-committed transactions *before* closing.
  // Tests then get a guaranteed-empty DB regardless of whether the
  // follow-up indexedDB.deleteDatabase() actually completes (fake-indexeddb
  // often fires onblocked and returns without deleting, leaving data from
  // the previous test — which caused ensureFirstRunSeed to silently report
  // seeded:false and every "render seeded data" test to see empty stores).
  if (dbPromise) {
    try {
      const db = await dbPromise;
      for (const def of STORE_DEFS) {
        if (db.objectStoreNames.contains(def.name)) {
          try {
            const tx = db.transaction(def.name, 'readwrite');
            await tx.store.clear();
            await tx.done;
          } catch {
            /* store may be gone mid-teardown; ignore */
          }
        }
      }
      db.close();
    } catch {
      /* noop */
    }
  }
  dbPromise = null;
}

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const def of STORE_DEFS) {
          if (!db.objectStoreNames.contains(def.name)) {
            const store = db.createObjectStore(def.name, {
              keyPath: def.keyPath as IDBValidKey
            });
            for (const idx of def.indexes ?? []) {
              store.createIndex(idx.name, idx.keyPath as IDBValidKey, {
                unique: idx.unique ?? false
              });
            }
          }
        }
      }
    });
  }
  return dbPromise;
}

export async function put<T extends StoreName>(store: T, value: DbSchema[T]): Promise<void> {
  const db = await getDb();
  // Use explicit tx + tx.done so the write is fully committed before we
  // return. `db.put(...)` only awaits the request; in fake-indexeddb the
  // tx can commit in a later tick, so a subsequent read from a different
  // transaction may not see the write yet. That caused tests to see empty
  // reads after successful writes.
  const tx = db.transaction(store, 'readwrite');
  await tx.store.put(value as never);
  await tx.done;
}

export async function get<T extends StoreName>(
  store: T,
  key: IDBValidKey
): Promise<DbSchema[T] | undefined> {
  const db = await getDb();
  return (await db.get(store, key)) as DbSchema[T] | undefined;
}

export async function getAll<T extends StoreName>(store: T): Promise<DbSchema[T][]> {
  const db = await getDb();
  return (await db.getAll(store)) as DbSchema[T][];
}

export async function getAllByIndex<T extends StoreName>(
  store: T,
  index: string,
  key: IDBValidKey | IDBKeyRange
): Promise<DbSchema[T][]> {
  const db = await getDb();
  return (await db.getAllFromIndex(store, index, key)) as DbSchema[T][];
}

export async function getByIndex<T extends StoreName>(
  store: T,
  index: string,
  key: IDBValidKey
): Promise<DbSchema[T] | undefined> {
  const db = await getDb();
  return (await db.getFromIndex(store, index, key)) as DbSchema[T] | undefined;
}

export async function del(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(store, 'readwrite');
  await tx.store.delete(key);
  await tx.done;
}

export async function clear(store: StoreName): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(store, 'readwrite');
  await tx.store.clear();
  await tx.done;
}

export async function clearAll(): Promise<void> {
  const db = await getDb();
  // Use explicit tx + await tx.done so each clear fully commits before the
  // next. `db.clear(store)` only awaits the request, not the transaction,
  // which means a later `put` can race with an unfinished clear tx and
  // observe "stale" state (the data written ends up in a to-be-cleared
  // store). That was the cause of tests seeing "No X" even after seeding.
  for (const def of STORE_DEFS) {
    const tx = db.transaction(def.name, 'readwrite');
    await tx.store.clear();
    await tx.done;
  }
}

export const ALL_STORES: StoreName[] = STORE_DEFS.map((d) => d.name);
