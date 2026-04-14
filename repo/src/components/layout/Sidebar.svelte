<script lang="ts">
  import { currentRole } from '../../stores/session.store';
  import { currentPath, navigate } from '../../router';
  import { canAccess } from '../../guards/route-guard';

  const items: Array<{ label: string; path: string; area: Parameters<typeof canAccess>[0] }> = [
    { label: 'Lead Inbox', path: '/leads', area: 'leads' },
    { label: 'Plan Workspace', path: '/plans', area: 'plans' },
    { label: 'Delivery Calendar', path: '/deliveries', area: 'deliveries' },
    { label: 'Ledger', path: '/ledger', area: 'ledger' },
    { label: 'Notifications', path: '/notifications', area: 'notifications' },
    { label: 'Audit Log', path: '/audit', area: 'audit' },
    { label: 'Jobs', path: '/jobs', area: 'jobs' },
    { label: 'Users', path: '/admin/users', area: 'admin_users' },
    { label: 'Backup', path: '/admin/backup', area: 'backup' }
  ];

  function isActive(path: string, cur: string): boolean {
    return cur === path || cur.startsWith(path + '/');
  }
</script>

<nav class="sidebar" aria-label="Main">
  <div class="brand">ForgeOps</div>
  <ul>
    {#each items as item}
      {#if canAccess(item.area, $currentRole)}
        <li>
          <a
            href={'#' + item.path}
            class:active={isActive(item.path, $currentPath)}
            on:click|preventDefault={() => navigate(item.path)}
          >{item.label}</a>
        </li>
      {/if}
    {/each}
  </ul>
</nav>

<style>
  .sidebar {
    width: 220px;
    background: #0f172a;
    color: #e2e8f0;
    padding: 16px 0;
    flex-shrink: 0;
    min-height: 100vh;
  }
  .brand {
    padding: 0 20px 16px;
    font-weight: 700;
    font-size: 18px;
    border-bottom: 1px solid #1e293b;
  }
  ul { list-style: none; margin: 0; padding: 8px 0; }
  li a {
    display: block;
    padding: 10px 20px;
    color: #cbd5e1;
    text-decoration: none;
    font-size: 14px;
  }
  li a:hover { background: #1e293b; color: #fff; }
  li a.active { background: #1e40af; color: #fff; }
  @media (max-width: 640px) {
    .sidebar { width: 100%; min-height: auto; }
  }
</style>
