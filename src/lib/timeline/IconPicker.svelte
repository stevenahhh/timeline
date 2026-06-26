<script lang="ts">
  import { browser } from "$app/environment"

  type Props = {
    readonly value: string
    readonly onChange: (icon: string) => void
  }

  const ICONS = [
    "📌", "⭐", "🔥", "✅", "📅", "💡", "🎯", "📝",
    "🚀", "☕", "🏃", "💪", "🎨", "📚", "🛠", "🎵",
  ] as const

  let { value, onChange }: Props = $props()
  let open = $state(false)
  let rootRef = $state<HTMLElement | null>(null)

  function toggle(): void {
    open = !open
  }

  function select(icon: string): void {
    onChange(icon)
    open = false
  }

  function handlePointerDown(event: PointerEvent): void {
    const target = event.target as Node | null
    if (rootRef?.contains(target) === true) return
    open = false
  }

  $effect(() => {
    if (!browser || !open) return
    document.addEventListener("pointerdown", handlePointerDown, true)
    return () => document.removeEventListener("pointerdown", handlePointerDown, true)
  })
</script>

<div class="icon-picker" bind:this={rootRef}>
  <button
    type="button"
    class="icon-picker-trigger"
    data-testid="editor-icon"
    aria-haspopup="listbox"
    aria-expanded={open}
    onclick={toggle}
  >
    <span class="icon-preview" class:placeholder={value.length === 0}>{value.length > 0 ? value : "—"}</span>
    <span class="trigger-label">Choose</span>
  </button>

  {#if open}
    <div class="icon-picker-grid" role="listbox" aria-label="Icon options" data-testid="editor-icon-options">
      {#each ICONS as icon (icon)}
        <button
          type="button"
          class="icon-option"
          class:selected={icon === value}
          role="option"
          aria-selected={icon === value}
          data-testid={`icon-option-${icon}`}
          onclick={() => select(icon)}
        >
          {icon}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .icon-picker {
    position: relative;
  }

  .icon-picker-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    padding: 6px 8px;
    background: var(--canvas);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    box-sizing: border-box;
    transition:
      border-color var(--dur-1) var(--ease-out),
      box-shadow var(--dur-1) var(--ease-out);
  }

  .icon-picker-trigger:hover {
    border-color: var(--hairline-strong);
  }

  .icon-picker-trigger[aria-expanded="true"] {
    border-color: var(--link);
    box-shadow: 0 0 0 3px rgba(0, 112, 243, 0.16);
  }

  .icon-preview {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    font-size: 16px;
    border-radius: var(--r-xs);
    background: var(--canvas-soft-2);
  }

  .icon-preview.placeholder {
    color: var(--mute);
    font-size: 13px;
  }

  .trigger-label {
    font-size: 12px;
    color: var(--mute);
  }

  .icon-picker-grid {
    position: absolute;
    z-index: 12;
    top: calc(100% + 6px);
    left: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    width: 212px;
    border-radius: var(--r-lg);
    padding: 8px;
    background: var(--canvas);
    box-shadow: var(--shadow-pop);
    transform-origin: top left;
    animation: pop var(--dur-2) var(--ease-spring);
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.94) translateY(-4px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .icon-option {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 38px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--canvas-soft);
    font-size: 18px;
    cursor: pointer;
    transition:
      background var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-spring);
  }

  .icon-option:hover {
    background: var(--canvas-soft-2);
    transform: scale(1.08);
  }

  .icon-option.selected {
    border-color: var(--ink);
    background: var(--canvas);
    box-shadow: var(--shadow-2);
  }
</style>
