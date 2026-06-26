<script lang="ts">
  import { browser } from "$app/environment"
  import TimelineItemBar from "$lib/timeline/TimelineItemBar.svelte"
  import IconPicker from "$lib/timeline/IconPicker.svelte"
  import TimelineCalendar from "$lib/timeline/TimelineCalendar.svelte"
  import {
    clampCompletionBoundary,
    computeDepths,
    computeItemPosition,
    computeRowSpans,
    generateHourTicks,
    isValidReparentTarget,
    makeItem,
    niceTickHours,
    snapDateToScale,
    startOfDay,
    type TimelineItem,
    type TimelineItemInput,
  } from "$lib/timeline/model"
  import TimelineNowLine from "$lib/timeline/TimelineNowLine.svelte"
  import { onDestroy } from "svelte"
  import { scale as scaleIn } from "svelte/transition"

  const storageKey = "timeline.todo.v1"
  const hourMs = 60 * 60 * 1000
  const dayMs = 24 * hourMs
  const rowHeight = 48
  const itemTopOffset = 22
  const popoverWidth = 264
  const popoverHeight = 430
  const COLOR_PRESETS = [
    "#24515d",
    "#2f7d68",
    "#3b6ea5",
    "#6d4aff",
    "#b0468a",
    "#c85a3c",
    "#c79a2e",
    "#5a6470",
  ] as const
  const dayFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
  let trackWidth = $state(1200)
  let trackHeight = $state(420)

  type EditorMode = "add" | "edit"
  type EditorState = {
    readonly mode: EditorMode
    readonly anchorId?: string
    readonly draft: {
      title: string
      icon: string
      color: string
      date: Date
      startHour: string
      endHour: string
    }
  }

  type DragState =
    | {
        readonly kind: "move"
      readonly itemId: string
      readonly pointerStartX: number
      readonly pointerStartY: number
      readonly pointerCurrentX: number
      readonly pointerCurrentY: number
      readonly originalStart: Date
      readonly originalEnd: Date
      readonly moved: boolean
      }
    | {
        readonly kind: "resize"
        readonly itemId: string
        readonly pointerStartX: number
        readonly originalEnd: Date
        readonly moved: boolean
      }
    | {
        readonly kind: "pan"
        readonly pointerStartX: number
        readonly originalViewStart: Date
        readonly originalViewEnd: Date
        readonly moved: boolean
      }

  const initialViewStart = startOfDay(new Date())
  const minRangeMs = 2 * hourMs
  const maxRangeMs = 96 * hourMs
  const defaultRangeMs = 36 * hourMs
  const initialNow = Date.now()
  let viewStart = $state<Date>(new Date(initialNow - defaultRangeMs / 2))
  let viewEnd = $state<Date>(new Date(initialNow + defaultRangeMs / 2))
  let items = $state<readonly TimelineItem[]>(loadItems())
  let dragState = $state<DragState | null>(null)
  let editor = $state<EditorState | null>(null)
  let popoverRef = $state<HTMLElement | null>(null)
  let trackRef = $state<HTMLElement | null>(null)
  let surfaceRef = $state<HTMLElement | null>(null)
  let suppressNextOpen = false

  const minSidebarWidth = 240
  const maxSidebarWidth = 560
  let sidebarOpen = $state(false)
  let sidebarWidth = $state(320)
  let sidebarResize = $state<{ readonly startX: number; readonly startWidth: number } | null>(null)

  const rangeHours = $derived((viewEnd.getTime() - viewStart.getTime()) / hourMs)
  const tickHours = $derived(niceTickHours(rangeHours, trackWidth))
  const ticks = $derived(generateHourTicks(viewStart, viewEnd, tickHours))
  const rowSpans = $derived(computeRowSpans(items))
  const depths = $derived(computeDepths(items))
  const completedCount = $derived(items.filter((item) => item.completedFrom !== undefined).length)
  const selectedDay = $derived(startOfDay(viewStart))
  const dayLabel = $derived(
    new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(selectedDay),
  )
  const dayItems = $derived(
    items
      .filter(
        (item) =>
          item.startAt.getTime() < selectedDay.getTime() + dayMs && item.endAt.getTime() > selectedDay.getTime(),
      )
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.order - b.order),
  )
  const scaleLabel = $derived(tickHours === 1 ? "1 hour" : `${tickHours} hours`)
  const isPanning = $derived(dragState?.kind === "pan")
  const activeMoveDrag = $derived(dragState?.kind === "move" && dragState.moved ? dragState : undefined)
  const dropTargetId = $derived(findDropTargetId(activeMoveDrag))
  const dropState = $derived(activeMoveDrag === undefined ? "none" : dropTargetId === undefined ? "root" : "parent")
  const dayMarkers = $derived(computeDayMarkers(viewStart, viewEnd))
  const editorAnchorId = $derived(editor === null ? undefined : editor.anchorId)
  const bubbleStyle = $derived(
    editorAnchorId === undefined
      ? styleForAddBubble()
      : styleForBubble(items.find((item) => item.id === editorAnchorId)),
  )

  if (browser) {
    document.addEventListener("pointerdown", handleDocumentPointerDown, true)
    window.addEventListener("storage", handleStorageEvent)
  }

  onDestroy(() => {
    removeDocumentListeners()
    stopSidebarResize()
    if (!browser) return
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true)
    window.removeEventListener("storage", handleStorageEvent)
  })

  $effect(() => {
    if (!browser) return
    window.localStorage.setItem(storageKey, JSON.stringify(items))
  })

  function loadItems(): readonly TimelineItem[] {
    if (!browser) return createInitialItems()
    const stored = window.localStorage.getItem(storageKey)
    if (stored === null) return createInitialItems()

    try {
      const parsed = JSON.parse(stored) as unknown
      if (!Array.isArray(parsed)) return createInitialItems()
      const loaded = parsed.flatMap((entry) => parseStoredItem(entry))
      return loaded
    } catch {
      return createInitialItems()
    }
  }

  function parseStoredItem(entry: unknown): readonly TimelineItem[] {
    if (typeof entry !== "object" || entry === null) return []
    const candidate = entry as Partial<TimelineItemInput> & {
      startAt?: string
      endAt?: string
      completedFrom?: string
      createdAt?: string
      updatedAt?: string
    }
    const result = makeItem({
      id: String(candidate.id ?? ""),
      title: String(candidate.title ?? ""),
      icon: String(candidate.icon ?? ""),
      color: String(candidate.color ?? "#24515d"),
      startAt: new Date(String(candidate.startAt ?? "")),
      endAt: new Date(String(candidate.endAt ?? "")),
      ...(candidate.parentId === undefined ? {} : { parentId: candidate.parentId }),
      order: typeof candidate.order === "number" ? candidate.order : 0,
      ...(candidate.completedFrom === undefined ? {} : { completedFrom: new Date(String(candidate.completedFrom)) }),
      ...(candidate.createdAt === undefined ? {} : { createdAt: new Date(String(candidate.createdAt)) }),
      ...(candidate.updatedAt === undefined ? {} : { updatedAt: new Date(String(candidate.updatedAt)) }),
    })
    return result.kind === "valid" ? [result.item] : []
  }

  function createInitialItems(): readonly TimelineItem[] {
    return [
      validItem("project", "Launch plan", "*", "#24515d", 0, 24, undefined, 0, 12),
      validItem("child", "Outline", "", "#426b59", 2, 6, "project", 0),
      validItem("grandchild-a", "Draft notes", "", "#557a66", 3, 4, "child", 0),
      validItem("grandchild-b", "Review notes", "", "#557a66", 4, 5, "child", 1),
      validItem("focus", "Focus block", "F", "#2f7d68", 6, 12, undefined, 1),
      validItem(
        "long",
        "This title is intentionally long and must stay clipped inside the item bar",
        "L",
        "#7d4f2f",
        18,
        21,
        undefined,
        2,
      ),
    ]
  }

  function validItem(
    id: string,
    title: string,
    icon: string,
    color: string,
    startHour: number,
    endHour: number,
    parentId?: string,
    order = 0,
    completedHour?: number,
  ): TimelineItem {
    const result = makeItem({
      id,
      title,
      icon,
      color,
      startAt: atHour(initialViewStart, startHour),
      endAt: atHour(initialViewStart, endHour),
      ...(parentId === undefined ? {} : { parentId }),
      order,
      ...(completedHour === undefined ? {} : { completedFrom: atHour(initialViewStart, completedHour) }),
    })
    if (result.kind === "valid") return result.item
    throw new Error("Initial timeline item must have a valid duration")
  }

  function atHour(day: Date, hour: number): Date {
    return new Date(day.getTime() + hour * hourMs)
  }

  function handleWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      if (event.deltaY === 0) return
      event.preventDefault()
      zoomBy(Math.exp(event.deltaY * 0.0015), event.clientX)
      return
    }

    const horizontalIntent = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)
    if (horizontalIntent) {
      const delta = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (delta === 0) return
      event.preventDefault()
      panByPixels(delta)
      return
    }

    // Vertical wheel: let the surface scroll its rows natively when they overflow;
    // otherwise repurpose the vertical wheel as a horizontal time pan.
    const surface = surfaceRef
    if (surface !== null && surface.scrollHeight > surface.clientHeight) return
    if (event.deltaY === 0) return
    event.preventDefault()
    panByPixels(event.deltaY)
  }

  function panByPixels(deltaPixels: number): void {
    const panMs = pixelsToMilliseconds(deltaPixels)
    viewStart = new Date(viewStart.getTime() + panMs)
    viewEnd = new Date(viewEnd.getTime() + panMs)
  }

  function zoomBy(factor: number, anchorClientX?: number): void {
    const rangeMs = viewEnd.getTime() - viewStart.getTime()
    const nextRange = Math.max(minRangeMs, Math.min(maxRangeMs, rangeMs * factor))
    if (nextRange === rangeMs) return
    const anchorMs =
      anchorClientX === undefined ? viewStart.getTime() + rangeMs / 2 : dateAtClientX(anchorClientX).getTime()
    const ratio = (anchorMs - viewStart.getTime()) / rangeMs
    const nextStart = anchorMs - ratio * nextRange
    viewStart = new Date(nextStart)
    viewEnd = new Date(nextStart + nextRange)
  }

  function jumpToNow(): void {
    const now = Date.now()
    const rangeMs = viewEnd.getTime() - viewStart.getTime()
    viewStart = new Date(now - rangeMs / 2)
    viewEnd = new Date(now + rangeMs / 2)
  }

  function jumpToDate(date: Date): void {
    const start = startOfDay(date)
    viewStart = start
    viewEnd = new Date(start.getTime() + dayMs)
  }

  function toggleSidebar(): void {
    sidebarOpen = !sidebarOpen
  }

  function clampSidebarWidth(value: number): number {
    return Math.max(minSidebarWidth, Math.min(maxSidebarWidth, value))
  }

  function startSidebarResize(event: MouseEvent): void {
    if (event.button !== 0) return
    event.preventDefault()
    sidebarResize = { startX: event.clientX, startWidth: sidebarWidth }
    if (!browser) return
    window.addEventListener("mousemove", onSidebarResizeMove)
    window.addEventListener("mouseup", stopSidebarResize)
  }

  function onSidebarResizeMove(event: MouseEvent): void {
    if (sidebarResize === null) return
    // dragging the handle leftwards (negative delta) widens the sidebar
    sidebarWidth = clampSidebarWidth(sidebarResize.startWidth + (sidebarResize.startX - event.clientX))
  }

  function stopSidebarResize(): void {
    sidebarResize = null
    if (!browser) return
    window.removeEventListener("mousemove", onSidebarResizeMove)
    window.removeEventListener("mouseup", stopSidebarResize)
  }

  function startMove(event: MouseEvent, target: TimelineItem): void {
    if (event.button !== 0 || editor !== null) return
    event.preventDefault()
    event.stopPropagation()
    dragState = {
      kind: "move",
      itemId: target.id,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      pointerCurrentX: event.clientX,
      pointerCurrentY: event.clientY,
      originalStart: target.startAt,
      originalEnd: target.endAt,
      moved: false,
    }
    addDocumentListeners()
  }

  function startResize(event: MouseEvent, target: TimelineItem): void {
    if (event.button !== 0 || editor !== null) return
    event.preventDefault()
    event.stopPropagation()
    dragState = {
      kind: "resize",
      itemId: target.id,
      pointerStartX: event.clientX,
      originalEnd: target.endAt,
      moved: false,
    }
    addDocumentListeners()
  }

  function startPan(event: MouseEvent): void {
    if (event.button !== 0 || editor !== null || dragState !== null) return
    dragState = {
      kind: "pan",
      pointerStartX: event.clientX,
      originalViewStart: viewStart,
      originalViewEnd: viewEnd,
      moved: false,
    }
    addDocumentListeners()
  }

  function handlePointerMove(event: MouseEvent): void {
    if (dragState === null) return

    const deltaPixels = event.clientX - dragState.pointerStartX
    const deltaRows = event.clientY - ("pointerStartY" in dragState ? dragState.pointerStartY : event.clientY)
    const deltaMs = pixelsToMilliseconds(deltaPixels)
    if ((Math.abs(deltaPixels) > 2 || Math.abs(deltaRows) > 2) && !dragState.moved) {
      dragState = { ...dragState, moved: true }
    }

    if (dragState.kind === "pan") {
      viewStart = new Date(dragState.originalViewStart.getTime() - deltaMs)
      viewEnd = new Date(dragState.originalViewEnd.getTime() - deltaMs)
      return
    }

    const activeDrag = dragState
    const target = items.find((candidate) => candidate.id === activeDrag.itemId)
    if (target === undefined) return

    if (activeDrag.kind === "move") {
      const durationMs = activeDrag.originalEnd.getTime() - activeDrag.originalStart.getTime()
      const startAt = snapDateToScale(new Date(activeDrag.originalStart.getTime() + deltaMs), "1h")
      updateItem(target.id, { startAt, endAt: new Date(startAt.getTime() + durationMs) })
      dragState = { ...activeDrag, pointerCurrentX: event.clientX, pointerCurrentY: event.clientY }
      return
    }

    const endAt = snapDateToScale(new Date(activeDrag.originalEnd.getTime() + deltaMs), "1h")
    if (endAt.getTime() > target.startAt.getTime()) updateItem(target.id, { endAt })
  }

  function stopDrag(): void {
    const completedDrag = dragState
    suppressNextOpen = completedDrag?.moved === true
    if (completedDrag?.kind === "move" && completedDrag.moved) applyDropLayout(completedDrag)
    dragState = null
    removeDocumentListeners()
  }

  function addDocumentListeners(): void {
    if (!browser) return
    window.addEventListener("mousemove", handlePointerMove)
    window.addEventListener("mouseup", stopDrag)
  }

  function removeDocumentListeners(): void {
    if (!browser) return
    window.removeEventListener("mousemove", handlePointerMove)
    window.removeEventListener("mouseup", stopDrag)
  }

  function openEditor(mode: EditorMode, anchorId?: string, startAt?: Date): void {
    if (suppressNextOpen) {
      suppressNextOpen = false
      return
    }
    const item = anchorId === undefined ? undefined : items.find((candidate) => candidate.id === anchorId)
    editor = { mode, anchorId, draft: createDraft(item, startAt) }
  }

  function createDraft(item: TimelineItem | undefined, addStartAt?: Date): EditorState["draft"] {
    const date = item === undefined ? startOfDay(addStartAt ?? viewStart) : startOfDay(item.startAt)
    const startAt = item?.startAt ?? addStartAt ?? atHour(date, 8)
    const endAt = item?.endAt ?? new Date(startAt.getTime() + hourMs)
    return {
      title: item?.title ?? "",
      icon: item?.icon ?? "",
      color: item?.color ?? "#2f7d68",
      date,
      startHour: String(startAt.getHours()).padStart(2, "0"),
      endHour: String(endAt.getHours()).padStart(2, "0"),
    }
  }

  function saveEditor(): void {
    const activeEditor = editor
    if (activeEditor === null) return
    const title = activeEditor.draft.title.trim()
    if (title.length === 0) return

    const existing =
      activeEditor.anchorId === undefined ? undefined : items.find((item) => item.id === activeEditor.anchorId)
    const savedAt = new Date()
    const itemInput: TimelineItemInput = {
      id: activeEditor.anchorId ?? `item-${Date.now()}`,
      title,
      icon: activeEditor.draft.icon,
      color: activeEditor.draft.color,
      startAt: atHour(activeEditor.draft.date, Number(activeEditor.draft.startHour)),
      endAt: atHour(activeEditor.draft.date, Number(activeEditor.draft.endHour)),
      ...(existing?.parentId === undefined ? {} : { parentId: existing.parentId }),
      order: existing?.order ?? 0,
      ...(existing?.completedFrom === undefined ? {} : { completedFrom: existing.completedFrom }),
      ...(existing?.createdAt === undefined ? {} : { createdAt: existing.createdAt }),
      ...(existing === undefined ? {} : { updatedAt: savedAt }),
    }
    const result = makeItem(itemInput)
    if (result.kind === "invalid_duration") return

    if (activeEditor.mode === "edit" && activeEditor.anchorId !== undefined) {
      const anchorId = activeEditor.anchorId
      items = items.map((candidate) => (candidate.id === anchorId ? result.item : candidate))
    } else {
      items = [...items, result.item]
    }
    closeEditor()
  }

  function closeEditor(): void {
    editor = null
  }

  function handlePopoverKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter") return
    const target = event.target
    if (target instanceof HTMLElement && target.tagName === "TEXTAREA") return
    event.preventDefault()
    saveEditor()
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      closeEditor()
      return
    }
    if (editor !== null) return
    const target = event.target
    const isTyping =
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === "n" || event.key === "N") {
      event.preventDefault()
      openEditor("add")
    }
  }

  function deleteItem(id: string): void {
    const toRemove = new Set<string>()
    function collect(targetId: string): void {
      toRemove.add(targetId)
      items.filter((i) => i.parentId === targetId).forEach((i) => collect(i.id))
    }
    collect(id)
    items = items.filter((i) => !toRemove.has(i.id))
    closeEditor()
  }

  function toggleCompletion(item: TimelineItem): void {
    updateItem(item.id, {
      completedFrom: item.completedFrom === undefined ? clampCompletionBoundary(item, new Date()) : undefined,
    })
  }

  function updateItem(
    id: string,
    patch: Partial<
      Pick<TimelineItem, "startAt" | "endAt" | "completedFrom" | "title" | "icon" | "color" | "parentId" | "order">
    >,
  ): void {
    items = items.map((candidate) => (candidate.id === id ? { ...candidate, ...patch, updatedAt: new Date() } : candidate))
  }

  function applyDropLayout(completedDrag: Extract<DragState, { kind: "move" }>): void {
    const targetIndex = rowIndexFromClientY(completedDrag.pointerCurrentY)
    const dragged = items.find((item) => item.id === completedDrag.itemId)
    if (dragged === undefined) return

    const reparentTarget = findDropParent(completedDrag, dragged.id)
    const remaining = items.filter((item) => item.id !== dragged.id)
    const insertIndex = Math.min(targetIndex, remaining.length)
    const reordered = [...remaining.slice(0, insertIndex), dragged, ...remaining.slice(insertIndex)]

    items = reordered.map((item, order) => {
      if (item.id !== dragged.id) return { ...item, order }
      if (reparentTarget === undefined) {
        const { parentId: _parentId, ...rootItem } = item
        return { ...rootItem, order, updatedAt: new Date() }
      }
      return { ...item, parentId: reparentTarget.id, order, updatedAt: new Date() }
    })
  }

  function findDropParent(
    completedDrag: Extract<DragState, { kind: "move" }>,
    draggedId: string,
  ): TimelineItem | undefined {
    const targetId = findDropTargetId(completedDrag)
    if (targetId === undefined) return undefined
    const target = items.find((item) => item.id === targetId)
    return target
  }

  function findDropTargetId(activeDrag: Extract<DragState, { kind: "move" }> | undefined): string | undefined {
    if (!browser || activeDrag === undefined) return undefined
    const dropElement = document.elementFromPoint(activeDrag.pointerCurrentX, activeDrag.pointerCurrentY)
    const itemElement = dropElement instanceof HTMLElement ? dropElement.closest("[data-item-id]") : null
    const targetId = itemElement instanceof HTMLElement ? itemElement.dataset.itemId : undefined
    if (targetId === undefined) return undefined
    const target = items.find((item) => item.id === targetId)
    const draggedId = activeDrag.itemId
    if (target === undefined || !isValidReparentTarget(items, draggedId, target.id)) return undefined
    const targetIndex = items.findIndex((item) => item.id === target.id)
    const track = trackRef
    if (targetIndex < 0 || track === null) return undefined
    const rowTopPx = track.getBoundingClientRect().top + targetIndex * rowHeight + itemTopOffset
    if (activeDrag.pointerCurrentY > rowTopPx + rowHeight) return undefined
    return target.id
  }

  function rowIndexFromClientY(clientY: number): number {
    const track = trackRef
    if (track === null) return 0
    const rect = track.getBoundingClientRect()
    const relativeY = clientY - rect.top - itemTopOffset + rowHeight / 2
    return Math.max(0, Math.min(items.length - 1, Math.floor(relativeY / rowHeight)))
  }

  function handleDocumentPointerDown(event: PointerEvent): void {
    if (editor === null) return
    const target = event.target as Node | null
    if (popoverRef?.contains(target) === true) return
    closeEditor()
  }

  function handleStorageEvent(event: StorageEvent): void {
    if (event.key !== storageKey || event.newValue === null) return
    items = loadItems()
  }

  function pixelsToMilliseconds(deltaPixels: number): number {
    return (deltaPixels / trackWidth) * (viewEnd.getTime() - viewStart.getTime())
  }

  function millisecondsToPixels(deltaMs: number): number {
    return (deltaMs / (viewEnd.getTime() - viewStart.getTime())) * trackWidth
  }

  function dragOffsetX(item: TimelineItem): number {
    const drag = activeMoveDrag
    if (drag === undefined || drag.itemId !== item.id) return 0
    const rawDelta = drag.pointerCurrentX - drag.pointerStartX
    const snappedDelta = millisecondsToPixels(item.startAt.getTime() - drag.originalStart.getTime())
    return rawDelta - snappedDelta
  }

  function dragOffsetY(item: TimelineItem): number {
    const drag = activeMoveDrag
    if (drag === undefined || drag.itemId !== item.id) return 0
    return drag.pointerCurrentY - drag.pointerStartY
  }

  function dateAtClientX(clientX: number): Date {
    const track = trackRef
    if (track === null) return viewStart
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const rangeMs = viewEnd.getTime() - viewStart.getTime()
    return new Date(viewStart.getTime() + rangeMs * ratio)
  }

  function handleSurfaceClick(event: MouseEvent): void {
    if (suppressNextOpen) {
      suppressNextOpen = false
      return
    }
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const path = event.composedPath()
    if (path.some((entry) => entry instanceof HTMLElement && entry.dataset.itemId !== undefined)) return
    if (path.some((entry) => popoverRef?.contains(entry as Node) === true)) return
    if (target.closest("[data-testid='timeline-track']") === null) return
    const startAt = snapDateToScale(dateAtClientX(event.clientX), "1h")
    openEditor("add", undefined, startAt)
  }

  function formatClockLabel(value: Date): string {
    return `${String(value.getHours()).padStart(2, "0")}:00`
  }

  function computeDayMarkers(
    vsStart: Date,
    vsEnd: Date,
  ): Array<{ label: string; leftPercent: number; pinned: boolean }> {
    const viewMs = vsEnd.getTime() - vsStart.getTime()
    const result: Array<{ label: string; leftPercent: number; pinned: boolean }> = []
    let day = startOfDay(vsStart)
    while (day.getTime() <= vsEnd.getTime()) {
      const leftMs = day.getTime() - vsStart.getTime()
      const leftPercent = (leftMs / viewMs) * 100
      result.push({
        label: dayFormatter.format(day),
        leftPercent: Math.max(0, leftPercent),
        pinned: leftPercent < 0,
      })
      day = new Date(day.getTime() + dayMs)
    }
    return result
  }

  function styleForBubble(item: TimelineItem | undefined): string {
    if (item === undefined) return ""
    const position = computeItemPosition(item, viewStart, viewEnd)
    return bubbleStyleFrom(position.leftPercent, rowTop(item))
  }

  function styleForAddBubble(): string {
    const startHour = Number(editor?.draft.startHour ?? 8)
    const leftPercent = ((startHour * hourMs) / (viewEnd.getTime() - viewStart.getTime())) * 100
    return bubbleStyleFrom(leftPercent, Math.min(trackHeight - popoverHeight - 8, 96))
  }

  function bubbleStyleFrom(leftPercent: number, topPx: number): string {
    const leftPx = (trackWidth * leftPercent) / 100
    const clampedLeft = Math.max(8, Math.min(trackWidth - popoverWidth - 8, leftPx))
    const clampedTop = Math.max(8, Math.min(trackHeight - popoverHeight - 8, topPx))
    return `left: ${clampedLeft}px; top: ${clampedTop}px;`
  }

  function rowTop(item: TimelineItem): number {
    const index = items.findIndex((candidate) => candidate.id === item.id)
    return index * 48 + 66
  }

  function viewLeftPercent(at: Date): number {
    return ((at.getTime() - viewStart.getTime()) / (viewEnd.getTime() - viewStart.getTime())) * 100
  }
</script>

<svelte:head>
  <title>Timeline</title>
</svelte:head>

<svelte:window onkeydown={handleGlobalKeydown} />

<main class="shell">
  <header class="topbar">
    <div class="brand">
      <h1>Timeline</h1>
    </div>

    <div class="actions">
      <div class="stat" aria-label="Completed of total">
        <span class="stat-value">{completedCount}</span><span class="stat-sep">/</span><span class="stat-total">{items.length}</span>
        <span class="stat-label">done</span>
      </div>

      <span class="scale-pill" aria-live="polite">Scale <span data-testid="scale-label">{scaleLabel}</span></span>

      <button type="button" class="ghost-btn" onclick={jumpToNow}>Now</button>
      <button type="button" class="add-button" title="Add item (N)" onclick={() => openEditor("add")}>+ Add item</button>
      <button
        type="button"
        class="panel-toggle"
        class:active={sidebarOpen}
        aria-label="Toggle sidebar"
        aria-pressed={sidebarOpen}
        title="Toggle sidebar"
        onclick={toggleSidebar}
      >
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
          <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6" />
          <line x1="12.5" y1="3.5" x2="12.5" y2="16.5" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </button>
    </div>
  </header>

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="workspace">
    <section
      class="timeline"
    class:panning={isPanning}
    role="application"
    tabindex="0"
    aria-label="Timeline workspace"
    data-testid="timeline-surface"
    data-drop-state={dropState}
    bind:this={surfaceRef}
    onwheel={handleWheel}
    onmousedown={startPan}
    onclick={handleSurfaceClick}
    bind:clientWidth={trackWidth}
  >
    <div class="date-axis">
      {#each dayMarkers as marker (marker.leftPercent)}
        <span class="date-label" class:date-label--pinned={marker.pinned} style={`left: ${marker.leftPercent}%`}>
          {marker.label}
        </span>
      {/each}
    </div>

    <div class="axis">
      {#each ticks as tick (tick.at.getTime())}
        <div class="tick" data-testid={`tick-${tick.label}`} style={`left: ${viewLeftPercent(tick.at)}%`}>
          <span>{tick.label}</span>
        </div>
      {/each}
    </div>

    <div
      class="track"
      data-testid="timeline-track"
      bind:this={trackRef}
      bind:clientHeight={trackHeight}
      style={`min-height: ${Math.max(items.length, 4) * 48 + 90}px`}
    >
      <div class="grid" aria-hidden="true">
        {#each ticks as tick (tick.at.getTime())}
          <span class="grid-line" style={`left: ${viewLeftPercent(tick.at)}%`}></span>
        {/each}
      </div>

      <TimelineNowLine {viewStart} {viewEnd} />

      {#each items as item, rowIndex (item.id)}
        <TimelineItemBar
          {item}
          rowIndex={rowIndex}
          rowSpan={rowSpans.get(item.id) ?? 1}
          depth={depths.get(item.id) ?? 0}
          isChild={item.parentId !== undefined}
          position={computeItemPosition(item, viewStart, viewEnd)}
          startLabel={formatClockLabel(item.startAt)}
          endLabel={formatClockLabel(item.endAt)}
          onMoveStart={startMove}
          onResizeStart={startResize}
          onOpenEditor={() => openEditor("edit", item.id)}
          onToggleCompletion={() => toggleCompletion(item)}
          isDragging={activeMoveDrag?.itemId === item.id}
          isDropTarget={dropTargetId === item.id}
          dragOffsetX={dragOffsetX(item)}
          dragOffsetY={dragOffsetY(item)}
        />
      {/each}

      {#if items.length === 0}
        <div class="empty-state">
          <div class="empty-art" aria-hidden="true"></div>
          <p class="empty-title">No time-boxes yet</p>
          <p class="empty-hint">Click anywhere on the track, or press <kbd>+ Add item</kbd> to start planning.</p>
        </div>
      {/if}

      {#if editor !== null}
        {@const activeEditor = editor}
        <div
          class="popover"
          bind:this={popoverRef}
          style={bubbleStyle}
          data-testid="editor-popover"
          transition:scaleIn={{ duration: 160, start: 0.96, opacity: 0 }}
          onkeydown={handlePopoverKeydown}
          role="dialog"
          aria-label={editor.mode === "edit" ? "Edit item" : "Add item"}
          tabindex="-1"
        >
          <div class="popover-header">
            <strong>{editor.mode === "edit" ? "Edit item" : "Add item"}</strong>
            <button type="button" class="popover-close" aria-label="Close" onclick={closeEditor}>×</button>
          </div>
          <label>
            <span class="field-label">Title</span>
            <input bind:value={editor.draft.title} data-testid="editor-title" placeholder="What needs doing?" />
          </label>
          <label>
            <span class="field-label">Icon</span>
            <IconPicker value={activeEditor.draft.icon} onChange={(icon) => (activeEditor.draft.icon = icon)} />
          </label>
          <div class="field-label">Color</div>
          <div class="swatch-row">
            {#each COLOR_PRESETS as preset (preset)}
              <button
                type="button"
                class="swatch"
                class:selected={activeEditor.draft.color.toLowerCase() === preset.toLowerCase()}
                style={`--swatch: ${preset}`}
                aria-label={`Use color ${preset}`}
                onclick={() => (activeEditor.draft.color = preset)}
              ></button>
            {/each}
            <input bind:value={editor.draft.color} type="color" data-testid="editor-color" class="swatch-custom" aria-label="Custom color" />
          </div>
          <div class="time-fields">
            <label>
              <span class="field-label">Start</span>
              <input bind:value={editor.draft.startHour} type="number" min="0" max="23" data-testid="editor-start" />
            </label>
            <label>
              <span class="field-label">End</span>
              <input bind:value={editor.draft.endHour} type="number" min="1" max="24" data-testid="editor-end" />
            </label>
          </div>
          <div class="popover-actions">
            {#if activeEditor.mode === "edit" && activeEditor.anchorId !== undefined}
              {@const deleteId = activeEditor.anchorId}
              <button type="button" class="delete-button" data-testid="editor-delete" onclick={() => deleteItem(deleteId)} aria-label="Delete item">
                Delete
              </button>
            {/if}
            <span class="action-spacer"></span>
            <button type="button" class="btn-secondary" onclick={closeEditor}>Cancel</button>
            <button type="button" class="btn-primary" onclick={saveEditor}>Save</button>
          </div>
        </div>
      {/if}
    </div>
  </section>

    {#if sidebarOpen}
      <!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
      <aside class="sidebar" class:resizing={sidebarResize !== null} style={`width: ${sidebarWidth}px`}>
        <div
          class="sidebar-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onmousedown={startSidebarResize}
        ><span class="sidebar-grip"></span></div>

        <div class="sidebar-body">
          <div class="sidebar-head">
            <strong>Calendar</strong>
            <button type="button" class="sidebar-close" aria-label="Close sidebar" onclick={toggleSidebar}>×</button>
          </div>

          <TimelineCalendar items={items} selected={selectedDay} onSelect={jumpToDate} />

          <div class="day-panel">
            <div class="day-panel-head">
              <span class="day-panel-title">{dayLabel}</span>
              <span class="day-panel-count">{dayItems.length}</span>
            </div>
            {#if dayItems.length === 0}
              <p class="day-empty">No items on this day.</p>
            {:else}
              <ul class="day-list">
                {#each dayItems as item (item.id)}
                  <li>
                    <button type="button" class="day-item" onclick={() => openEditor("edit", item.id)}>
                      <span class="day-dot" style={`background: ${item.color}`}></span>
                      <span class="day-item-title">{item.title}</span>
                      <span class="day-item-time">{formatClockLabel(item.startAt)}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
      </aside>
    {/if}
  </div>
</main>

<style>
  .shell {
    min-height: 100vh;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 32px 22px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  /* ---- Topbar ---- */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 0 0 18px;
    flex-wrap: wrap;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  h1 {
    margin: 0;
    font-size: 21px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .actions {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .stat {
    display: inline-flex;
    align-items: baseline;
    gap: 2px;
    padding: 6px 12px;
    border-radius: var(--r-pill);
    background: var(--canvas);
    box-shadow: var(--shadow-2);
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--ink);
  }

  .stat-sep,
  .stat-total {
    color: var(--mute);
  }

  .stat-label {
    margin-left: 5px;
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--mute);
  }

  .scale-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border-radius: var(--r-pill);
    background: var(--canvas);
    box-shadow: var(--shadow-2);
    font-size: 12px;
    color: var(--mute);
    white-space: nowrap;
  }

  .scale-pill span {
    color: var(--ink);
    font-weight: 600;
  }

  .ghost-btn,
  .add-button {
    border: 0;
    border-radius: var(--r-pill);
    padding: 0 16px;
    height: 34px;
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: transform var(--dur-1) var(--ease-out), box-shadow var(--dur-2) var(--ease-out),
      background var(--dur-1) var(--ease-out);
  }

  .ghost-btn {
    background: var(--canvas);
    color: var(--ink);
    box-shadow: var(--shadow-2);
  }

  .ghost-btn:hover {
    background: var(--canvas-soft-2);
  }

  .add-button {
    background: var(--ink);
    color: #fff;
    box-shadow: var(--shadow-3);
  }

  .add-button:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-4);
  }

  .add-button:active {
    transform: translateY(0);
  }

  .panel-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: var(--r-pill);
    background: var(--canvas);
    color: var(--body);
    box-shadow: var(--shadow-2);
    cursor: pointer;
    transition: color var(--dur-1) var(--ease-out), box-shadow var(--dur-2) var(--ease-out),
      background var(--dur-1) var(--ease-out);
  }

  .panel-toggle:hover {
    color: var(--ink);
    box-shadow: var(--shadow-3);
  }

  .panel-toggle.active {
    background: var(--ink);
    color: #fff;
  }

  /* ---- Workspace (timeline + sidebar) ---- */
  .workspace {
    display: flex;
    gap: 16px;
    flex: 1;
    min-height: 0;
  }

  /* ---- Sidebar ---- */
  .sidebar {
    position: relative;
    flex: 0 0 auto;
    display: flex;
    border-radius: var(--r-lg);
    background: var(--canvas);
    box-shadow: var(--shadow-3);
    overflow: hidden;
  }

  .sidebar.resizing {
    user-select: none;
  }

  .sidebar-resize {
    flex: 0 0 auto;
    width: 12px;
    margin-left: -4px;
    cursor: ew-resize;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sidebar-grip {
    width: 3px;
    height: 34px;
    border-radius: 999px;
    background: var(--hairline-strong);
    opacity: 0.5;
    transition: opacity var(--dur-1) var(--ease-out), background var(--dur-1) var(--ease-out);
  }

  .sidebar-resize:hover .sidebar-grip,
  .sidebar.resizing .sidebar-grip {
    opacity: 1;
    background: var(--link);
  }

  .sidebar-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 16px 16px 6px;
    overflow-y: auto;
  }

  .sidebar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .sidebar-head strong {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .sidebar-close {
    border: 0;
    background: transparent;
    color: var(--mute);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    transition: background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out);
  }

  .sidebar-close:hover {
    background: var(--canvas-soft-2);
    color: var(--ink);
  }

  /* ---- Selected-day panel ---- */
  .day-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid var(--hairline);
    padding-top: 12px;
  }

  .day-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .day-panel-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink);
  }

  .day-panel-count {
    min-width: 20px;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--canvas-soft-2);
    color: var(--body);
    font-size: 11px;
    text-align: center;
  }

  .day-empty {
    margin: 2px 0;
    font-size: 12px;
    color: var(--mute);
  }

  .day-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .day-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: 0;
    background: transparent;
    border-radius: var(--r-sm);
    padding: 7px 8px;
    cursor: pointer;
    text-align: left;
    transition: background var(--dur-1) var(--ease-out);
  }

  .day-item:hover {
    background: var(--canvas-soft-2);
  }

  .day-dot {
    flex: 0 0 auto;
    width: 9px;
    height: 9px;
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
  }

  .day-item-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    color: var(--ink);
  }

  .day-item-time {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--mute);
  }

  /* ---- Timeline surface ---- */
  .timeline {
    position: relative;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-radius: var(--r-lg);
    background: var(--canvas);
    box-shadow: var(--shadow-3);
    cursor: grab;
  }

  .timeline.panning {
    cursor: grabbing;
  }

  .date-axis {
    position: sticky;
    top: 0;
    z-index: 6;
    height: 26px;
    background: var(--canvas-soft);
    border-bottom: 1px solid var(--hairline);
  }

  .date-label {
    position: absolute;
    top: 6px;
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 500;
    color: var(--body);
    white-space: nowrap;
    padding-left: 8px;
    border-left: 1px solid var(--hairline-strong);
  }

  .date-label--pinned {
    left: 0 !important;
    border-left: 0;
  }

  .axis {
    position: sticky;
    top: 26px;
    z-index: 6;
    width: 100%;
    height: 40px;
    background: var(--canvas-soft);
    border-bottom: 1px solid var(--hairline);
  }

  .tick {
    position: absolute;
    top: 0;
    height: 100%;
    border-left: 1px solid var(--hairline);
  }

  .tick span {
    display: block;
    padding: 11px 8px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--mute);
  }

  .track {
    position: relative;
    width: 100%;
    flex: 1;
  }

  .grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .grid-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    border-left: 1px solid var(--canvas-soft);
  }

  /* ---- Empty state ---- */
  .empty-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
    padding: 24px;
  }

  .empty-art {
    width: 54px;
    height: 54px;
    margin-bottom: 6px;
    border-radius: 16px;
    background: var(--brand-gradient);
    opacity: 0.9;
    box-shadow: var(--shadow-3);
  }

  .empty-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .empty-hint {
    margin: 0;
    font-size: 13px;
    color: var(--mute);
    max-width: 320px;
  }

  .empty-hint kbd {
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 5px;
    background: var(--canvas-soft-2);
    border: 1px solid var(--hairline);
    color: var(--body);
  }

  /* ---- Editor popover ---- */
  .popover {
    position: absolute;
    z-index: 10;
    width: 264px;
    max-height: calc(100% - 16px);
    overflow: auto;
    border-radius: var(--r-lg);
    padding: 14px;
    background: var(--canvas);
    box-shadow: var(--shadow-pop);
    transform-origin: top left;
  }

  .popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .popover-header strong {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .popover-close {
    border: 0;
    background: transparent;
    color: var(--mute);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    transition: background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out);
  }

  .popover-close:hover {
    background: var(--canvas-soft-2);
    color: var(--ink);
  }

  .popover label {
    display: grid;
    gap: 5px;
    margin-bottom: 10px;
  }

  .field-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .popover input {
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    padding: 8px 10px;
    font: inherit;
    font-size: 13px;
    color: var(--ink);
    background: var(--canvas);
    transition: border-color var(--dur-1) var(--ease-out), box-shadow var(--dur-1) var(--ease-out);
  }

  .popover input::placeholder {
    color: var(--mute);
  }

  .popover input:focus {
    outline: none;
    border-color: var(--link);
    box-shadow: 0 0 0 3px rgba(0, 112, 243, 0.16);
  }

  .swatch-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 4px 0 12px;
  }

  .swatch {
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 999px;
    background: var(--swatch);
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
    transition: transform var(--dur-1) var(--ease-spring), box-shadow var(--dur-1) var(--ease-out);
  }

  .swatch:hover {
    transform: scale(1.12);
  }

  .swatch.selected {
    box-shadow: 0 0 0 2px var(--canvas), 0 0 0 4px var(--ink);
  }

  .swatch-custom {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px dashed var(--hairline-strong);
    border-radius: 999px;
    background: var(--canvas);
    cursor: pointer;
    overflow: hidden;
  }

  .swatch-custom::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .swatch-custom::-webkit-color-swatch {
    border: 0;
    border-radius: 999px;
  }

  .time-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .popover-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
  }

  .action-spacer {
    flex: 1;
  }

  .btn-primary,
  .btn-secondary,
  .delete-button {
    border: 0;
    border-radius: var(--r-sm);
    padding: 8px 14px;
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: transform var(--dur-1) var(--ease-out), background var(--dur-1) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }

  .btn-primary {
    background: var(--ink);
    color: #fff;
    box-shadow: var(--shadow-2);
  }

  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-3);
  }

  .btn-secondary {
    background: var(--canvas-soft-2);
    color: var(--ink);
  }

  .btn-secondary:hover {
    background: var(--hairline);
  }

  .delete-button {
    background: transparent;
    color: var(--danger);
    padding: 8px 10px;
  }

  .delete-button:hover {
    background: var(--danger-soft);
  }
</style>
