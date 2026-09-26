<script lang="ts">
  import Card from '$lib/components/Card.svelte';
  import { formatDateTime } from '$lib/format';
  import { translate } from '$lib/i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const t = $derived(translate(data.lang));
</script>

<svelte:head>
  <title>{t.admin_auditHeading()} · {t.app_name()}</title>
</svelte:head>

<h1>{t.admin_auditHeading()}</h1>

<Card>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>{t.audit_when()}</th>
          <th>{t.audit_action()}</th>
          <th>{t.audit_actor()}</th>
          <th>{t.audit_target()}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.page.entries as entry (entry.id)}
          <tr>
            <td class="when">{formatDateTime(entry.createdAt, data.lang)}</td>
            <!-- Action names are stable identifiers rather than copy: there are
                 a dozen of them, they are what somebody greps for, and
                 translating them would make the log harder to search. -->
            <td class="mono">{entry.action}</td>
            <td>{entry.actorUsername ?? '-'}</td>
            <td class="mono">{entry.targetId ?? '-'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if data.page.nextCursor}
    <div>
      <!--
        A bare query string on purpose: paging keeps this exact page and only
        moves the cursor.
      -->
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a href="?cursor={encodeURIComponent(data.page.nextCursor)}">{t.audit_more()}</a>
    </div>
  {/if}
</Card>

<style>
  h1 {
    font-size: var(--text-xl);
  }

  /* Four columns of identifiers do not fit a phone, so the table scrolls
     inside the card rather than making the whole page scroll sideways. */
  .scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  th {
    padding: var(--space-2) var(--space-3);
    border-bottom: 2px solid var(--border);
    color: var(--fg-muted);
    font-size: var(--text-xs);
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }

  .when {
    white-space: nowrap;
  }

  .mono {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    word-break: break-all;
  }
</style>
