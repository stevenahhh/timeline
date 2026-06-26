export const TICK_SCALES = ["6h", "3h", "1h"] as const

export type TickScale = (typeof TICK_SCALES)[number]

export type TimelineItem = {
  readonly id: string
  readonly title: string
  readonly icon: string
  readonly color: string
  readonly startAt: Date
  readonly endAt: Date
  readonly parentId?: string
  readonly order: number
  readonly completedFrom?: Date
  readonly createdAt: Date
  readonly updatedAt: Date
}

export type TimelineItemInput = {
  readonly id: string
  readonly title: string
  readonly icon: string
  readonly color: string
  readonly startAt: Date
  readonly endAt: Date
  readonly parentId?: string
  readonly order?: number
  readonly completedFrom?: Date
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

export type TimelineItemResult =
  | { readonly kind: "valid"; readonly item: TimelineItem }
  | { readonly kind: "invalid_duration" }

export type TimelineTick = {
  readonly at: Date
  readonly label: string
}

export type PercentSegment = {
  readonly leftPercent: number
  readonly widthPercent: number
}

const HOURS_BY_SCALE = {
  "6h": 6,
  "3h": 3,
  "1h": 1,
} as const satisfies Record<TickScale, number>

const HOUR_MS = 60 * 60 * 1000

export function makeItem(input: TimelineItemInput): TimelineItemResult {
  if (input.endAt.getTime() <= input.startAt.getTime()) {
    return { kind: "invalid_duration" }
  }

  const createdAt = input.createdAt ?? new Date(input.startAt)
  const updatedAt = input.updatedAt ?? new Date(createdAt)

  return {
    kind: "valid",
    item: {
      id: input.id,
      title: input.title,
      icon: input.icon,
      color: input.color,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
      order: input.order ?? 0,
      ...(input.completedFrom === undefined ? {} : { completedFrom: new Date(input.completedFrom) }),
      createdAt,
      updatedAt,
    },
  }
}

export function generateTicks(start: Date, end: Date, scale: TickScale): readonly TimelineTick[] {
  const stepMs = HOURS_BY_SCALE[scale] * HOUR_MS
  const ticks: TimelineTick[] = []
  const dayStart = startOfDay(start).getTime()
  const firstTick = dayStart + Math.ceil((start.getTime() - dayStart) / stepMs) * stepMs

  for (let time = firstTick; time <= end.getTime(); time += stepMs) {
    const at = new Date(time)
    ticks.push({ at, label: formatClockLabel(at) })
  }

  return ticks
}

export function zoomIn(scale: TickScale): TickScale {
  switch (scale) {
    case "6h":
      return "3h"
    case "3h":
      return "1h"
    case "1h":
      return "1h"
  }
}

export function zoomOut(scale: TickScale): TickScale {
  switch (scale) {
    case "1h":
      return "3h"
    case "3h":
      return "6h"
    case "6h":
      return "6h"
  }
}

export function startOfDay(source: Date): Date {
  const result = new Date(source)
  result.setHours(0, 0, 0, 0)
  return result
}

export function snapDateToScale(source: Date, scale: TickScale): Date {
  const stepMs = HOURS_BY_SCALE[scale] * HOUR_MS
  const dayStart = new Date(source)
  dayStart.setHours(0, 0, 0, 0)
  const snappedOffset = Math.round((source.getTime() - dayStart.getTime()) / stepMs) * stepMs
  return new Date(dayStart.getTime() + snappedOffset)
}

export function computeItemPosition(item: TimelineItem, rangeStart: Date, rangeEnd: Date): PercentSegment {
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime()
  const leftMs = item.startAt.getTime() - rangeStart.getTime()
  const widthMs = item.endAt.getTime() - item.startAt.getTime()

  return {
    leftPercent: (leftMs / rangeMs) * 100,
    widthPercent: (widthMs / rangeMs) * 100,
  }
}

export function computeRowSpans(items: readonly TimelineItem[]): ReadonlyMap<string, number> {
  const childrenByParent = new Map<string, readonly TimelineItem[]>()

  for (const item of items) {
    if (item.parentId === undefined) continue
    const current = childrenByParent.get(item.parentId) ?? []
    childrenByParent.set(item.parentId, [...current, item])
  }

  const spans = new Map<string, number>()
  for (const item of items) {
    spans.set(item.id, computeRowSpan(item.id, childrenByParent))
  }

  return spans
}

export function computeDepths(items: readonly TimelineItem[]): ReadonlyMap<string, number> {
  const byId = new Map(items.map((item) => [item.id, item]))
  const depths = new Map<string, number>()

  function depthOf(id: string, guard: ReadonlySet<string>): number {
    const cached = depths.get(id)
    if (cached !== undefined) return cached
    const item = byId.get(id)
    if (item === undefined || item.parentId === undefined || guard.has(id)) return 0
    const result = 1 + depthOf(item.parentId, new Set([...guard, id]))
    depths.set(id, result)
    return result
  }

  for (const item of items) depths.set(item.id, depthOf(item.id, new Set()))
  return depths
}

export function isValidReparentTarget(
  items: readonly TimelineItem[],
  draggedId: string,
  targetId: string,
): boolean {
  if (draggedId === targetId) return false

  let nextParent = findItem(items, targetId)?.parentId
  while (nextParent !== undefined) {
    if (nextParent === draggedId) return false
    nextParent = findItem(items, nextParent)?.parentId
  }

  return true
}

export function clampCompletionBoundary(item: TimelineItem, currentTime: Date): Date {
  const currentMs = currentTime.getTime()
  const startMs = item.startAt.getTime()
  const endMs = item.endAt.getTime()

  if (currentMs <= startMs) return new Date(item.startAt)
  if (currentMs >= endMs) return new Date(item.endAt)
  return new Date(currentTime)
}

export function computeCompletionSegment(item: TimelineItem): PercentSegment {
  if (item.completedFrom === undefined) {
    return { leftPercent: 100, widthPercent: 0 }
  }

  return computeItemPosition(
    {
      ...item,
      startAt: item.completedFrom,
    },
    item.startAt,
    item.endAt,
  )
}

function computeRowSpan(itemId: string, childrenByParent: ReadonlyMap<string, readonly TimelineItem[]>): number {
  const children = childrenByParent.get(itemId) ?? []
  return 1 + children.reduce((total, child) => total + computeRowSpan(child.id, childrenByParent), 0)
}

function findItem(items: readonly TimelineItem[], id: string): TimelineItem | undefined {
  return items.find((item) => item.id === id)
}

function formatClockLabel(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:00`
}
