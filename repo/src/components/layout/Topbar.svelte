<script lang="ts">
  import { session } from '../../stores/session.store';
  import { authService } from '../../services/auth.service';
  import { navigate } from '../../router';

  async function handleLogout() {
    await authService.logout();
    navigate('/login');
  }
</script>

<header class="topbar">
  <div class="page-title"><slot name="title">&nbsp;</slot></div>
  <div class="user">
    {#if $session}
      <span class="uname">{$session.username}</span>
      <span class="role">{$session.role.replace(/_/g, ' ')}</span>
      <button on:click={handleLogout}>Log out</button>
    {/if}
  </div>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: #fff;
    border-bottom: 1px solid #e5e7eb;
  }
  .user {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
  }
  .role {
    font-size: 12px;
    color: #666;
    text-transform: capitalize;
  }
  button {
    background: transparent;
    border: 1px solid #d1d5db;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }
  button:hover { background: #f3f4f6; }
</style>
