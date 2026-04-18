import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// jsdom's Blob lacks .text() and .arrayBuffer(); polyfill via FileReader
if (typeof Blob !== 'undefined' && typeof (Blob.prototype as unknown as { text?: () => Promise<string> }).text !== 'function') {
  (Blob.prototype as unknown as { text: () => Promise<string> }).text = function (this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
if (typeof File !== 'undefined' && typeof (File.prototype as unknown as { text?: () => Promise<string> }).text !== 'function') {
  (File.prototype as unknown as { text: () => Promise<string> }).text =
    (Blob.prototype as unknown as { text: () => Promise<string> }).text;
}

// Polyfill crypto.randomUUID in jsdom if missing
if (typeof crypto !== 'undefined' && !('randomUUID' in crypto)) {
  (crypto as Crypto & { randomUUID: () => string }).randomUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
}

// Swallow benign fake-indexeddb AbortErrors from teardown leftovers.
// When a test's beforeEach closes the DB / deletes the database, any
// async IDB request that was still in flight (e.g. an onMount refresh
// whose microtask hadn't finished) rejects with AbortError in the next
// tick — after the test itself has already passed. Vitest treats those
// as unhandled rejections and fails the whole run even though every
// assertion passed. They carry no correctness signal, so we absorb them.
if (typeof process !== 'undefined' && process.on) {
  process.on('unhandledRejection', (reason: unknown) => {
    const name = (reason as { name?: string } | null)?.name;
    const msg = (reason as { message?: string } | null)?.message ?? '';
    if (name === 'AbortError' || /AbortError/.test(msg)) return;
    throw reason;
  });
}
