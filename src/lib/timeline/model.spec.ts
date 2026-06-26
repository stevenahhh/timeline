import { describe, expect, it } from "vitest"
import {
  clampCompletionBoundary,
  computeCompletionSegment,
  computeDepths,
  computeItemPosition,
  computeRowSpans,
  generateHourTicks,
  generateTicks,
  isValidReparentTarget,
  makeItem,
  niceTickHours,
  snapDateToScale,
  zoomIn,
} from "./model"
import type { TimelineItem, TimelineItemResult } from "./model"

function expectValid(result: TimelineItemResult): TimelineItem {
  switch (result.kind) {
    case "valid":
      return result.item
    case "invalid_duration":
      throw new Error("Expected a valid item, received invalid_duration")
  }
}

describe("timeline model", () => {
  it("generates default 6-hour axis ticks when the range spans one day", () => {
    const start = new Date(2026, 5, 8, 0, 0, 0)
    const end = new Date(2026, 5, 9, 0, 0, 0)

    const ticks = generateTicks(start, end, "6h")

    expect(ticks.map((tick) => tick.label)).toEqual(["00:00", "06:00", "12:00", "18:00", "00:00"])
  })

  it("keeps generated ticks aligned to real clock boundaries after panning", () => {
    const start = new Date(2026, 5, 8, 1, 15, 0)
    const end = new Date(2026, 5, 9, 1, 15, 0)

    const ticks = generateTicks(start, end, "6h")

    expect(ticks.map((tick) => tick.label)).toEqual(["06:00", "12:00", "18:00", "00:00"])
    expect(ticks[0]?.at).toEqual(new Date(2026, 5, 8, 6, 0, 0))
  })

  it("clamps zoom in at the 1-hour scale", () => {
    expect(zoomIn("6h")).toBe("3h")
    expect(zoomIn("3h")).toBe("1h")
    expect(zoomIn("1h")).toBe("1h")
  })

  it("picks denser tick intervals as the view zooms in", () => {
    // 24h across 1200px -> ~50px/hour, too tight for 1h labels -> 2h
    expect(niceTickHours(24, 1200)).toBe(2)
    // 12h across 1200px -> 100px/hour -> 1h fits
    expect(niceTickHours(12, 1200)).toBe(1)
    // zoomed way out: 96h across 1200px -> 12.5px/hour -> widen to 6h
    expect(niceTickHours(96, 1200)).toBe(6)
    // degenerate inputs never crash
    expect(niceTickHours(0, 1200)).toBe(1)
    expect(niceTickHours(24, 0)).toBe(1)
  })

  it("generates clock-aligned ticks at an arbitrary hour interval", () => {
    const start = new Date(2026, 5, 8, 0, 0, 0)
    const end = new Date(2026, 5, 8, 12, 0, 0)

    const ticks = generateHourTicks(start, end, 2)

    expect(ticks.map((tick) => tick.label)).toEqual([
      "00:00",
      "02:00",
      "04:00",
      "06:00",
      "08:00",
      "10:00",
      "12:00",
    ])
  })

  it("snaps dates to the active scale", () => {
    const source = new Date(2026, 5, 8, 10, 40, 0)

    expect(snapDateToScale(source, "6h")).toEqual(new Date(2026, 5, 8, 12, 0, 0))
    expect(snapDateToScale(source, "3h")).toEqual(new Date(2026, 5, 8, 12, 0, 0))
    expect(snapDateToScale(source, "1h")).toEqual(new Date(2026, 5, 8, 11, 0, 0))
  })

  it("can snap dates to one-hour boundaries independently of the visible scale", () => {
    const source = new Date(2026, 5, 8, 10, 40, 0)

    expect(snapDateToScale(source, "1h")).toEqual(new Date(2026, 5, 8, 11, 0, 0))
  })

  it("computes stable item positions from start and end time", () => {
    const rangeStart = new Date(2026, 5, 8, 0, 0, 0)
    const rangeEnd = new Date(2026, 5, 8, 24, 0, 0)
    const item = expectValid(makeItem({
      id: "focus",
      title: "Focus block",
      icon: "dot",
      color: "#2f7d68",
      startAt: new Date(2026, 5, 8, 6, 0, 0),
      endAt: new Date(2026, 5, 8, 12, 0, 0),
    }))

    expect(computeItemPosition(item, rangeStart, rangeEnd)).toEqual({
      leftPercent: 25,
      widthPercent: 25,
    })
  })

  it("rejects invalid item durations at construction", () => {
    const result = makeItem({
      id: "invalid",
      title: "Invalid",
      icon: "",
      color: "#2f7d68",
      startAt: new Date(2026, 5, 8, 12, 0, 0),
      endAt: new Date(2026, 5, 8, 6, 0, 0),
    })

    expect(result.kind).toBe("invalid_duration")
  })

  it("computes recursive row spans for descendants", () => {
    const parent = expectValid(makeItem({
      id: "parent",
      title: "Parent",
      icon: "",
      color: "#24515d",
      startAt: new Date(2026, 5, 8, 0, 0, 0),
      endAt: new Date(2026, 5, 8, 6, 0, 0),
    }))
    const child = expectValid(makeItem({
      id: "child",
      title: "Child",
      icon: "",
      color: "#24515d",
      parentId: "parent",
      startAt: new Date(2026, 5, 8, 1, 0, 0),
      endAt: new Date(2026, 5, 8, 2, 0, 0),
    }))
    const grandchildA = expectValid(makeItem({
      id: "grandchild-a",
      title: "Grandchild A",
      icon: "",
      color: "#24515d",
      parentId: "child",
      startAt: new Date(2026, 5, 8, 2, 0, 0),
      endAt: new Date(2026, 5, 8, 3, 0, 0),
    }))
    const grandchildB = expectValid(makeItem({
      id: "grandchild-b",
      title: "Grandchild B",
      icon: "",
      color: "#24515d",
      parentId: "child",
      startAt: new Date(2026, 5, 8, 3, 0, 0),
      endAt: new Date(2026, 5, 8, 4, 0, 0),
    }))

    const spans = computeRowSpans([parent, child, grandchildA, grandchildB])

    expect(spans.get("parent")).toBe(4)
    expect(spans.get("child")).toBe(3)
  })

  it("computes nesting depth for each item", () => {
    const make = (id: string, parentId?: string): TimelineItem =>
      expectValid(
        makeItem({
          id,
          title: id,
          icon: "",
          color: "#24515d",
          ...(parentId === undefined ? {} : { parentId }),
          startAt: new Date(2026, 5, 8, 0, 0, 0),
          endAt: new Date(2026, 5, 8, 6, 0, 0),
        }),
      )
    const items = [make("root"), make("child", "root"), make("grandchild", "child"), make("orphan")]

    const depths = computeDepths(items)

    expect(depths.get("root")).toBe(0)
    expect(depths.get("child")).toBe(1)
    expect(depths.get("grandchild")).toBe(2)
    expect(depths.get("orphan")).toBe(0)
  })

  it("rejects reparenting onto self or a descendant", () => {
    const items = [
      expectValid(makeItem({
        id: "parent",
        title: "Parent",
        icon: "",
        color: "#24515d",
        startAt: new Date(2026, 5, 8, 0, 0, 0),
        endAt: new Date(2026, 5, 8, 6, 0, 0),
      })),
      expectValid(makeItem({
        id: "child",
        title: "Child",
        icon: "",
        color: "#24515d",
        parentId: "parent",
        startAt: new Date(2026, 5, 8, 1, 0, 0),
        endAt: new Date(2026, 5, 8, 2, 0, 0),
      })),
    ]

    expect(isValidReparentTarget(items, "parent", "parent")).toBe(false)
    expect(isValidReparentTarget(items, "parent", "child")).toBe(false)
    expect(isValidReparentTarget(items, "child", "parent")).toBe(true)
  })

  it("clamps completion boundary into the item range", () => {
    const item = expectValid(makeItem({
      id: "complete",
      title: "Complete",
      icon: "",
      color: "#24515d",
      startAt: new Date(2026, 5, 8, 8, 0, 0),
      endAt: new Date(2026, 5, 8, 12, 0, 0),
    }))

    expect(clampCompletionBoundary(item, new Date(2026, 5, 8, 7, 0, 0))).toEqual(item.startAt)
    expect(clampCompletionBoundary(item, new Date(2026, 5, 8, 10, 0, 0))).toEqual(
      new Date(2026, 5, 8, 10, 0, 0),
    )
    expect(clampCompletionBoundary(item, new Date(2026, 5, 8, 13, 0, 0))).toEqual(item.endAt)
  })

  it("computes completion overlay width from the completion boundary to item end", () => {
    const item = expectValid(makeItem({
      id: "complete",
      title: "Complete",
      icon: "",
      color: "#24515d",
      startAt: new Date(2026, 5, 8, 8, 0, 0),
      endAt: new Date(2026, 5, 8, 12, 0, 0),
      completedFrom: new Date(2026, 5, 8, 10, 0, 0),
    }))

    expect(computeCompletionSegment(item)).toEqual({
      leftPercent: 50,
      widthPercent: 50,
    })
  })
})
