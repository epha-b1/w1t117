<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { currentPath, routeSegments, navigate } from './router';
  import { session, refreshSession, clearSession, IDLE_TIMEOUT_MS } from './stores/session.store';
  import { canAccess, defaultRouteFor, ROLE_ACCESS } from './guards/route-guard';
  import Toast from './components/common/Toast.svelte';
  import Login from './routes/Login.svelte';
  import LeadInbox from './routes/LeadInbox.svelte';
  import PlanWorkspace from './routes/PlanWorkspace.svelte';
  import DeliveryCalendar from './routes/DeliveryCalendar.svelte';
  import Ledger from './routes/Ledger.svelte';
  import NotificationCenter from './routes/NotificationCenter.svelte';
  import AuditLog from './routes/AuditLog.svelte';
  import AdminUsers from './routes/AdminUsers.svelte';
  import Backup from './routes/Backup.svelte';
  import Jobs from './routes/Jobs.svelte';
  import ShareView from './routes/ShareView.svelte';
  import NotFound from './routes/NotFound.svelte';
  import { pushToast } from './stores/toast.store';

  type Route =
    | { kind: 'login' }
    | { kind: 'share'; token: string }
    | { kind: 'leads' }
    | { kind: 'plans' }
    | { kind: 'deliveries' }
    | { kind: 'ledger' }
    | { kind: 'notifications' }
    | { kind: 'audit' }
    | { kind: 'admin_users' }
    | { kind: 'backup' }
    | { kind: 'jobs' }
    | { kind: 'not_found' };

  let route: Route = { kind: 'login' };

  $: {
    const segs = $routeSegments;
    route = resolveRoute(segs);
  }

  function resolveRoute(segs: string[]): Route {
    if (segs.length === 0) {
      const sess = $session;
      if (sess) return toRouteFromPath(defaultRouteFor(sess.role));
      return { kind: 'login' };
    }
    const [s0, s1] = segs;
    if (s0 === 'login') return { kind: 'login' };
    if (s0 === 'share' && s1) return { kind: 'share', token: s1 };
    if (s0 === 'leads') return { kind: 'leads' };
    if (s0 === 'plans') return { kind: 'plans' };
    if (s0 === 'deliveries') return { kind: 'deliveries' };
    if (s0 === 'ledger') return { kind: 'ledger' };
    if (s0 === 'notifications') return { kind: 'notifications' };
    if (s0 === 'audit') return { kind: 'audit' };
    if (s0 === 'jobs') return { kind: 'jobs' };
    if (s0 === 'admin' && s1 === 'users') return { kind: 'admin_users' };
    if (s0 === 'admin' && s1 === 'backup') return { kind: 'backup' };
    return { kind: 'not_found' };
  }

  function toRouteFromPath(path: string): Route {
    const segs = path.split('/').filter(Boolean);
    return resolveRoute(segs);
  }

  $: enforceAccess(route, $session);

  function enforceAccess(r: Route, sess: typeof $session) {
    if (r.kind === 'share' || r.kind === 'login') return;
    if (r.kind === 'not_found') return;
    if (!sess) {
      navigate('/login');
      return;
    }
    const area = r.kind as keyof typeof ROLE_ACCESS;
    if (!canAccess(area, sess.role)) {
      pushToast('Access denied for this area', 'warning');
      navigate(defaultRouteFor(sess.role));
    }
  }

  let idleTimer: number | null = null;
  function resetIdle() {
    if ($session) {
      refreshSession();
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        clearSession();
        pushToast('Session expired — please log in again', 'info');
        navigate('/login');
      }, IDLE_TIMEOUT_MS);
    }
  }

  function onActivity() {
    if ($session) resetIdle();
  }

  onMount(() => {
    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    window.addEventListener('click', onActivity, { passive: true });
    if ($session) resetIdle();
  });

  onDestroy(() => {
    window.removeEventListener('mousemove', onActivity);
    window.removeEventListener('keydown', onActivity);
    window.removeEventListener('click', onActivity);
    if (idleTimer) window.clearTimeout(idleTimer);
  });
</script>

<Toast />

{#if route.kind === 'login'}
  <Login />
{:else if route.kind === 'share'}
  <ShareView token={route.token} />
{:else if route.kind === 'leads'}
  <LeadInbox />
{:else if route.kind === 'plans'}
  <PlanWorkspace />
{:else if route.kind === 'deliveries'}
  <DeliveryCalendar />
{:else if route.kind === 'ledger'}
  <Ledger />
{:else if route.kind === 'notifications'}
  <NotificationCenter />
{:else if route.kind === 'audit'}
  <AuditLog />
{:else if route.kind === 'admin_users'}
  <AdminUsers />
{:else if route.kind === 'backup'}
  <Backup />
{:else if route.kind === 'jobs'}
  <Jobs />
{:else}
  <NotFound />
{/if}

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
  }
  :global(button) { font-family: inherit; }
  :global(input, select, textarea) { font-family: inherit; font-size: 14px; }
</style>
