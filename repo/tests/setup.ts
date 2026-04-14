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
