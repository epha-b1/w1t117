<script lang="ts">
  import AppShell from '../components/layout/AppShell.svelte';
  import { backupService } from '../services/backup.service';
  import { session } from '../stores/session.store';
  import { pushToast } from '../stores/toast.store';

  let plainPassphrase = '';
  let restorePassphrase = '';
  let plainFile: FileList | null = null;
  let encryptedFile: FileList | null = null;
  let busy = false;

  async function doExport() {
    if (!$session) return;
    busy = true;
    try {
      const blob = await backupService.exportData($session.userId);
      download(blob, `forgeops-${Date.now()}.forgeops.json`);
      pushToast('Export downloaded', 'success');
    } finally {
      busy = false;
    }
  }

  async function doImport() {
    if (!plainFile?.[0] || !$session) return;
    busy = true;
    try {
      const res = await backupService.importData(plainFile[0], $session.userId);
      if (res.success) pushToast(`Restored ${res.recordsRestored} records`, 'success');
      else pushToast(res.error ?? 'Import failed', 'error');
    } finally {
      busy = false;
      plainFile = null;
    }
  }

  async function doExportEncrypted() {
    if (!$session || !plainPassphrase) return;
    busy = true;
    try {
      const blob = await backupService.exportEncrypted(plainPassphrase, $session.userId);
      download(blob, `forgeops-${Date.now()}.encrypted.json`);
      pushToast('Encrypted backup downloaded', 'success');
      plainPassphrase = '';
    } finally {
      busy = false;
    }
  }

  async function doImportEncrypted() {
    if (!encryptedFile?.[0] || !restorePassphrase || !$session) return;
    busy = true;
    try {
      const res = await backupService.importEncrypted(
        encryptedFile[0],
        restorePassphrase,
        $session.userId
      );
      if (res.success) pushToast(`Restored ${res.recordsRestored} records`, 'success');
      else pushToast(res.error ?? 'Import failed', 'error');
      restorePassphrase = '';
      encryptedFile = null;
    } finally {
      busy = false;
    }
  }

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
</script>

<AppShell pageTitle="Backup &amp; Restore">
  <div class="grid">
    <section>
      <h3>Plain JSON</h3>
      <p>Download all data as JSON with SHA-256 fingerprint. Import validates fingerprint before restoring.</p>
      <button on:click={doExport} disabled={busy}>Download export</button>
      <hr />
      <label>Restore from file
        <input type="file" accept="application/json,.json" bind:files={plainFile} />
      </label>
      <button on:click={doImport} disabled={busy || !plainFile?.[0]}>Restore</button>
    </section>

    <section>
      <h3>Encrypted backup (AES-256-GCM)</h3>
      <label>Passphrase<input type="password" bind:value={plainPassphrase} /></label>
      <button on:click={doExportEncrypted} disabled={busy || !plainPassphrase}>Export encrypted</button>
      <hr />
      <label>File<input type="file" accept="application/json,.json" bind:files={encryptedFile} /></label>
      <label>Passphrase<input type="password" bind:value={restorePassphrase} /></label>
      <button on:click={doImportEncrypted} disabled={busy || !encryptedFile?.[0] || !restorePassphrase}>Restore encrypted</button>
    </section>
  </div>
</AppShell>

<style>
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
  section { background: #fff; padding: 16px; border-radius: 6px; display: flex; flex-direction: column; gap: 10px; }
  section h3 { margin: 0; font-size: 15px; }
  section p { margin: 0; color: #666; font-size: 13px; }
  section label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  section input { padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; }
  section button {
    background: #2563eb;
    color: #fff;
    border: none;
    padding: 8px 14px;
    border-radius: 4px;
    cursor: pointer;
    align-self: flex-start;
  }
  section button:disabled { opacity: 0.5; cursor: not-allowed; }
  hr { border: none; border-top: 1px solid #eee; margin: 4px 0; }
</style>
