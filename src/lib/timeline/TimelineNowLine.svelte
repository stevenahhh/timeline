<script lang="ts">
  import { onMount } from "svelte"

  type Props = {
    readonly viewStart: Date
    readonly viewEnd: Date
  }

  let { viewStart, viewEnd }: Props = $props()
  let now = $state(new Date())

  onMount(() => {
    const id = setInterval(() => (now = new Date()), 30_000)
    return () => clearInterval(id)
  })

  const leftPercent = $derived(
    ((now.getTime() - viewStart.getTime()) / (viewEnd.getTime() - viewStart.getTime())) * 100,
  )
  const visible = $derived(leftPercent >= 0 && leftPercent <= 100)
  const label = $derived(
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
  )
</script>

{#if visible}
  <div class="now-line" data-testid="now-line" style={`left: ${leftPercent}%`} aria-hidden="true">
    <span class="now-flag">{label}</span>
    <span class="now-dot"></span>
  </div>
{/if}

<style>
  .now-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    z-index: 4;
    border-left: 1.5px solid var(--danger);
    pointer-events: none;
  }

  .now-dot {
    position: absolute;
    top: -3px;
    left: -4px;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--danger);
    box-shadow: 0 0 0 3px rgba(229, 72, 77, 0.18);
  }

  .now-flag {
    position: absolute;
    top: -9px;
    left: 6px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--danger);
    color: #fff;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
    box-shadow: 0 2px 6px -1px rgba(229, 72, 77, 0.5);
  }
</style>
