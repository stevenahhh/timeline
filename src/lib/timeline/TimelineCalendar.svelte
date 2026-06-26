<script lang="ts">
  import { startOfDay, type TimelineItem } from "./model"

  type Props = {
    readonly items: readonly TimelineItem[]
    readonly selected: Date
    readonly onSelect: (date: Date) => void
  }

  let { items, selected, onSelect }: Props = $props()

  const dayMs = 24 * 60 * 60 * 1000
  let month = $state(startOfMonth(new Date()))

  function startOfMonth(source: Date): Date {
    return new Date(source.getFullYear(), source.getMonth(), 1)
  }

  function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  }

  const today = new Date()
  const monthLabel = $derived(new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month))
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(2023, 0, 1 + i)),
  )

  type Cell = {
    readonly date: Date
    readonly count: number
    readonly inMonth: boolean
    readonly intensity: number
  }

  const cells = $derived(buildCells(month, items))

  function buildCells(monthStart: Date, list: readonly TimelineItem[]): readonly Cell[] {
    const first = startOfMonth(monthStart)
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay())
    const raw = Array.from({ length: 42 }, (_, i) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
      const dayStart = date.getTime()
      const dayEnd = dayStart + dayMs
      const count = list.filter(
        (item) => item.startAt.getTime() < dayEnd && item.endAt.getTime() > dayStart,
      ).length
      return { date, count, inMonth: date.getMonth() === monthStart.getMonth() }
    })
    const max = Math.max(0, ...raw.filter((cell) => cell.inMonth).map((cell) => cell.count))
    return raw.map((cell) => ({
      ...cell,
      intensity: max > 0 && cell.count > 0 ? 0.18 + 0.82 * (cell.count / max) : 0,
    }))
  }

  function prevMonth(): void {
    month = new Date(month.getFullYear(), month.getMonth() - 1, 1)
  }

  function nextMonth(): void {
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  }

  function goToThisMonth(): void {
    month = startOfMonth(new Date())
  }

  function pick(date: Date): void {
    onSelect(startOfDay(date))
  }
</script>

<div class="calendar">
  <div class="cal-head">
    <button type="button" class="cal-nav" aria-label="Previous month" onclick={prevMonth}>‹</button>
    <button type="button" class="cal-title" onclick={goToThisMonth} title="Jump to current month">{monthLabel}</button>
    <button type="button" class="cal-nav" aria-label="Next month" onclick={nextMonth}>›</button>
  </div>

  <div class="cal-weekdays" aria-hidden="true">
    {#each weekdays as weekday (weekday)}
      <span class="cal-weekday">{weekday}</span>
    {/each}
  </div>

  <div class="cal-grid" role="grid">
    {#each cells as cell (cell.date.getTime())}
      <button
        type="button"
        class="cal-day"
        class:out={!cell.inMonth}
        class:today={sameDay(cell.date, today)}
        class:selected={sameDay(cell.date, selected)}
        title={`${cell.count} item${cell.count === 1 ? "" : "s"}`}
        aria-label={`${cell.date.toDateString()}, ${cell.count} items`}
        onclick={() => pick(cell.date)}
      >
        <span class="cal-fill" style={`background: rgba(109, 74, 255, ${cell.intensity})`}></span>
        <span class="cal-num">{cell.date.getDate()}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .calendar {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .cal-title {
    flex: 1;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--ink);
    cursor: pointer;
    border-radius: var(--r-sm);
    padding: 4px 6px;
    transition: background var(--dur-1) var(--ease-out);
  }

  .cal-title:hover {
    background: var(--canvas-soft-2);
  }

  .cal-nav {
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--body);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    transition: background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out);
  }

  .cal-nav:hover {
    background: var(--canvas-soft-2);
    color: var(--ink);
  }

  .cal-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }

  .cal-weekday {
    text-align: center;
    font-size: 10px;
    font-weight: 500;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }

  .cal-day {
    position: relative;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    border-radius: 999px;
    cursor: pointer;
    padding: 0;
  }

  .cal-fill {
    position: absolute;
    inset: 3px;
    border-radius: 999px;
    transition: background var(--dur-2) var(--ease-out);
  }

  .cal-num {
    position: relative;
    z-index: 1;
    font-size: 12px;
    font-weight: 500;
    color: var(--ink);
  }

  .cal-day.out .cal-num {
    color: var(--mute);
    opacity: 0.5;
  }

  .cal-day:hover .cal-num {
    font-weight: 700;
  }

  .cal-day.today .cal-num {
    color: var(--link);
    font-weight: 700;
  }

  .cal-day.selected {
    box-shadow: inset 0 0 0 2px var(--ink);
  }
</style>
