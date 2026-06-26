<script lang="ts">
  import { computeCompletionSegment, type PercentSegment, type TimelineItem } from "./model"

  type Props = {
    readonly item: TimelineItem
    readonly position: PercentSegment
    readonly rowIndex: number
    readonly rowSpan: number
    readonly depth: number
    readonly isChild: boolean
    readonly startLabel: string
    readonly endLabel: string
    readonly onMoveStart: (event: MouseEvent, item: TimelineItem) => void
    readonly onResizeStart: (event: MouseEvent, item: TimelineItem) => void
    readonly onOpenEditor: (item: TimelineItem) => void
    readonly onToggleCompletion: (item: TimelineItem) => void
    readonly isDragging?: boolean
    readonly isDropTarget?: boolean
    readonly dragOffsetX?: number
    readonly dragOffsetY?: number
  }

  const rowHeight = 48
  const barInset = 8

  let {
    item,
    position,
    rowIndex,
    rowSpan,
    depth,
    isChild,
    startLabel,
    endLabel,
    onMoveStart,
    onResizeStart,
    onOpenEditor,
    onToggleCompletion,
    isDragging = false,
    isDropTarget = false,
    dragOffsetX = 0,
    dragOffsetY = 0,
  }: Props = $props()

  const completion = $derived(computeCompletionSegment(item))
  const completionLeft = $derived(formatPercent(completion.leftPercent))
  const completionWidth = $derived(formatPercent(completion.widthPercent))
  const isComplete = $derived(item.completedFrom !== undefined)
  const isParent = $derived(rowSpan > 1)
  const indent = $derived(depth * 12)

  function handleMoveStart(event: MouseEvent): void {
    onMoveStart(event, item)
  }

  function handleResizeStart(event: MouseEvent): void {
    event.stopPropagation()
    onResizeStart(event, item)
  }

  function handleClick(event: MouseEvent): void {
    event.stopPropagation()
    onOpenEditor(item)
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    onOpenEditor(item)
  }

  function handleCompletionClick(event: MouseEvent): void {
    event.stopPropagation()
    onToggleCompletion(item)
  }

  function stopControlMouseDown(event: MouseEvent): void {
    event.stopPropagation()
  }

  function formatPercent(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }
</script>

<div
  class="item"
  role="button"
  tabindex="0"
  data-testid={`timeline-item-${item.id}`}
  data-item-id={item.id}
  data-parent-id={item.parentId ?? ""}
  data-visual-state={isChild ? "child" : "root"}
  data-drag-preview={isDragging ? "true" : "false"}
  data-drop-target={isDropTarget ? "true" : "false"}
  data-start-label={startLabel}
  data-end-label={endLabel}
  data-row-span={rowSpan}
  class:child={isChild}
  class:dragging={isDragging}
  class:drop-target={isDropTarget}
  class:complete={isComplete}
  class:is-parent={isParent}
  style={`--item-color: ${item.color}; --drag-x: ${dragOffsetX}px; --drag-y: ${dragOffsetY}px; --indent: ${indent}px; --row-h: ${rowHeight - barInset}px; left: ${position.leftPercent}%; width: ${position.widthPercent}%; top: ${rowIndex * rowHeight + 22}px; height: ${rowSpan * rowHeight - barInset}px`}
  onmousedown={handleMoveStart}
  onclick={handleClick}
  onkeydown={handleKeydown}
>
  {#if item.completedFrom !== undefined}
    <span
      class="completion"
      data-testid={`completion-overlay-${item.id}`}
      data-left-percent={completionLeft}
      data-width-percent={completionWidth}
      style={`left: ${completion.leftPercent}%; width: ${completion.widthPercent}%`}
    ></span>
  {/if}

  <span class="item-content">
    {#if isChild}
      <span class="leading-icon" data-testid={`child-leading-icon-${item.id}`}>{item.icon}</span>
      <span class="structural-icon" data-testid={`child-structural-icon-${item.id}`}>-&gt;</span>
    {:else}
      <span class="root-icon" aria-hidden="true">{item.icon}</span>
    {/if}
    <span class="title" data-testid={`item-title-${item.id}`}>{item.title}</span>
    <span class="time-range" aria-hidden="true">{startLabel}–{endLabel}</span>
  </span>

  <button
    type="button"
    class="completion-toggle"
    data-testid={`complete-${item.id}`}
    aria-label={`Toggle completion for ${item.title}`}
    aria-pressed={isComplete}
    onmousedown={stopControlMouseDown}
    onclick={handleCompletionClick}
  >
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>

  <button
    type="button"
    class="resize-handle"
    data-testid={`resize-${item.id}`}
    aria-label={`Resize ${item.title}`}
    onmousedown={handleResizeStart}
  ><span class="grip"></span></button>
</div>

<style>
  .item {
    position: absolute;
    border: 0;
    border-radius: 8px;
    color: #ffffff;
    cursor: grab;
    overflow: hidden;
    padding: 0 40px 0 12px;
    text-align: left;
    box-sizing: border-box;
    user-select: none;
    background: var(--item-color);
    transform-origin: left center;
    transform: translate(var(--drag-x), var(--drag-y));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.18),
      0 1px 2px rgba(23, 23, 23, 0.16),
      0 0 0 1px color-mix(in srgb, var(--item-color) 70%, #000 18%);
    transition:
      box-shadow var(--dur-2) var(--ease-out),
      filter var(--dur-2) var(--ease-out),
      outline-color var(--dur-1) var(--ease-out);
  }

  .item:not(.dragging) {
    transition:
      box-shadow var(--dur-2) var(--ease-out),
      filter var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-out),
      outline-color var(--dur-1) var(--ease-out);
  }

  .item::before {
    /* soft top sheen for depth */
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 42%);
    pointer-events: none;
  }

  .item:hover {
    filter: saturate(1.06) brightness(1.03);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      0 6px 16px -6px rgba(23, 23, 23, 0.4),
      0 0 0 1px color-mix(in srgb, var(--item-color) 64%, #000 22%);
    transform: translate(var(--drag-x), var(--drag-y)) translateY(-1px);
  }

  .item.child {
    background: color-mix(in srgb, var(--item-color) 70%, #ffffff 30%);
    color: #14201c;
    padding-left: calc(12px + var(--indent));
  }

  .item.child::after {
    /* nesting rail */
    content: "";
    position: absolute;
    left: calc(6px + var(--indent) - 6px);
    top: 9px;
    bottom: 9px;
    width: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--item-color) 78%, #000 18%);
    opacity: 0.55;
    pointer-events: none;
  }

  .item.complete {
    color: #ffffff;
  }

  .item.dragging {
    z-index: 30;
    pointer-events: none;
    cursor: grabbing;
    will-change: transform;
    filter: saturate(1.14) brightness(1.05);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.28),
      0 18px 38px -10px rgba(23, 23, 23, 0.5),
      0 0 0 1px color-mix(in srgb, var(--item-color) 60%, #000 24%);
  }

  .item.drop-target {
    outline: 2px solid #f5b301;
    outline-offset: 2px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      0 0 0 6px rgba(245, 179, 1, 0.18),
      0 6px 16px -6px rgba(23, 23, 23, 0.4);
  }

  .item:active {
    cursor: grabbing;
  }

  .item-content {
    position: relative;
    z-index: 1;
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    gap: 7px;
    height: var(--row-h, 40px);
    white-space: nowrap;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item.complete .title {
    opacity: 0.82;
  }

  .time-range {
    margin-left: auto;
    flex: 0 0 auto;
    padding-right: 2px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0;
    display: none;
  }

  .item:hover .time-range {
    display: inline-block;
    opacity: 0.72;
  }

  .completion {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 0;
    background: linear-gradient(180deg, #2fbb73, #1f9d57);
    box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.4);
    transition:
      left var(--dur-3) var(--ease-out),
      width var(--dur-3) var(--ease-out);
  }

  .leading-icon:empty {
    display: none;
  }

  .structural-icon,
  .root-icon {
    flex: 0 0 auto;
    font-weight: 800;
  }

  .root-icon:empty {
    display: none;
  }

  .structural-icon {
    font-family: var(--font-mono);
    font-size: 11px;
    opacity: 0.7;
  }

  .completion-toggle {
    position: absolute;
    top: calc(var(--row-h, 40px) / 2);
    right: 18px;
    transform: translateY(-50%) scale(0.92);
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 999px;
    width: 20px;
    height: 20px;
    padding: 0;
    cursor: pointer;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.22);
    opacity: 0;
    transition:
      opacity var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-spring),
      background var(--dur-1) var(--ease-out);
  }

  .item:hover .completion-toggle,
  .item:focus-within .completion-toggle {
    opacity: 1;
    transform: translateY(-50%) scale(1);
  }

  .completion-toggle:hover {
    background: rgba(255, 255, 255, 0.34);
  }

  .item.complete .completion-toggle {
    opacity: 1;
    background: #ffffff;
    color: #1f9d57;
    transform: translateY(-50%) scale(1);
  }

  .item.child .completion-toggle {
    color: #14201c;
    background: rgba(20, 32, 28, 0.16);
  }

  .item.child.complete .completion-toggle {
    background: #1f9d57;
    color: #ffffff;
  }

  .resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 100%;
    border: 0;
    padding: 0;
    cursor: ew-resize;
    background: transparent;
  }

  .grip {
    width: 3px;
    height: 16px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.45);
    opacity: 0;
    transition: opacity var(--dur-2) var(--ease-out);
  }

  .item.child .grip {
    background: rgba(20, 32, 28, 0.32);
  }

  .item:hover .grip,
  .resize-handle:hover .grip {
    opacity: 1;
  }
</style>
