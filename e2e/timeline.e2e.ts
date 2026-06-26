import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => window.localStorage.removeItem("timeline.todo.v1"))
  await page.reload()
})

test("first screen is a timeline with clock ticks", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible()
  await expect(page.getByText("Welcome to SvelteKit")).toHaveCount(0)
  await expect(page.getByTestId("tick-00:00").first()).toBeVisible()
  await expect(page.getByTestId("tick-06:00").first()).toBeVisible()
  await expect(page.getByTestId("tick-12:00").first()).toBeVisible()
  await expect(page.getByTestId("tick-18:00").first()).toBeVisible()
  await expect(page.getByTestId("row-label")).toHaveCount(0)
})

test("ctrl+wheel zooms in to one-hour ticks and back out", async ({ page }) => {
  const surface = page.getByTestId("timeline-surface")
  await surface.hover()

  await page.keyboard.down("Control")
  await page.mouse.wheel(0, -400)
  await page.mouse.wheel(0, -400)
  await page.mouse.wheel(0, -400)
  await page.keyboard.up("Control")

  await expect(page.getByTestId("scale-label")).toHaveText("1 hour")
  // zoom is anchored at the cursor (surface centre ~ 18:00 in the 36h view), so an
  // odd hour near the centre only appears when ticks are at the 1-hour interval
  await expect(page.getByTestId("tick-17:00")).toBeVisible()

  await page.keyboard.down("Control")
  await page.mouse.wheel(0, 400)
  await page.mouse.wheel(0, 400)
  await page.mouse.wheel(0, 400)
  await page.mouse.wheel(0, 400)
  await page.keyboard.up("Control")

  await expect(page.getByTestId("scale-label")).not.toHaveText("1 hour")
})

test("plain wheel pans the timeline horizontally without zooming", async ({ page }) => {
  const surface = page.getByTestId("timeline-surface")
  await surface.hover()
  const labelBefore = await page.getByTestId("scale-label").textContent()
  const before = await page.getByTestId("tick-12:00").first().boundingBox()
  expect(before).not.toBeNull()
  if (before === null) return

  await page.mouse.wheel(0, 240)
  await page.waitForTimeout(80)

  // panning must not change the zoom level
  expect(await page.getByTestId("scale-label").textContent()).toBe(labelBefore)
  const after = await page.getByTestId("tick-12:00").first().boundingBox()
  expect(after).not.toBeNull()
  if (after === null) return
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(20)
})

test("ctrl+wheel resizes the gantt (zoom)", async ({ page }) => {
  const focus = page.getByTestId("timeline-item-focus")
  const before = await focus.boundingBox()
  expect(before).not.toBeNull()
  if (before === null) return

  const surface = page.getByTestId("timeline-surface")
  await surface.hover()
  await page.keyboard.down("Control")
  await page.mouse.wheel(0, -400)
  await page.keyboard.up("Control")
  await page.waitForTimeout(80)

  // zooming in must enlarge the on-screen size of the bars
  const after = await focus.boundingBox()
  expect(after).not.toBeNull()
  if (after === null) return
  expect(after.width).toBeGreaterThan(before.width + 10)
})

test("dragging and resizing preview snapped positions", async ({ page }) => {
  const surfaceBox = await page.getByTestId("timeline-surface").boundingBox()
  const item = page.getByTestId("timeline-item-focus")
  const box = await item.boundingBox()
  expect(surfaceBox).not.toBeNull()
  expect(box).not.toBeNull()
  if (surfaceBox === null || box === null) return
  const sixHours = surfaceBox.width * (6 / 36)

  await page.mouse.move(box.x + 40, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 40 + sixHours, box.y + 20)
  await page.mouse.up()

  await expect(item).toHaveAttribute("data-start-label", "12:00")
  await expect(item).toHaveAttribute("data-end-label", "18:00")

  const resizeHandle = page.getByTestId("resize-focus")
  const handleBox = await resizeHandle.boundingBox()
  expect(handleBox).not.toBeNull()
  if (handleBox === null) return

  await page.mouse.move(handleBox.x + 4, handleBox.y + 8)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + 4 + sixHours, handleBox.y + 8)
  await page.mouse.up()

  await expect(item).toHaveAttribute("data-end-label", "00:00")
})

test("child item icon is structural and parent row expands", async ({ page }) => {
  await expect(page.getByTestId("timeline-item-project")).toHaveAttribute("data-row-span", "4")
  await expect(page.getByTestId("timeline-item-child")).toBeVisible()
  await expect(page.getByTestId("child-structural-icon-child")).toHaveText("->")
  await expect(page.getByTestId("child-leading-icon-child")).toHaveText("")
})

test("completion overlay starts at the completion boundary", async ({ page }) => {
  const overlay = page.getByTestId("completion-overlay-project")
  await expect(overlay).toBeVisible()
  await expect(overlay).toHaveAttribute("data-left-percent", "50")
  await expect(overlay).toHaveAttribute("data-width-percent", "50")
})

test("long titles stay inside the item bar", async ({ page }) => {
  const item = page.getByTestId("timeline-item-long")
  const itemBox = await item.boundingBox()
  const textBox = await page.getByTestId("item-title-long").boundingBox()
  expect(itemBox).not.toBeNull()
  expect(textBox).not.toBeNull()
  if (itemBox === null || textBox === null) return

  expect(textBox.x + textBox.width).toBeLessThanOrEqual(itemBox.x + itemBox.width + 1)
})

test("add bubble creates an item and refresh keeps it", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add item" }).click()
  await page.getByTestId("editor-title").fill("Write spec")
  await page.getByTestId("editor-icon").click()
  await page.getByTestId("editor-icon-options").getByTestId("icon-option-🚀").click()
  await page.getByTestId("editor-color").fill("#2f7d68")
  await page.getByTestId("editor-start").fill("8")
  await page.getByTestId("editor-end").fill("14")
  await page.getByRole("button", { name: "Save" }).click()

  await expect(page.getByText("Write spec")).toBeVisible()
  await page.reload()
  await expect(page.getByText("Write spec")).toBeVisible()
})

test("only one editor opens and outside click closes it", async ({ page }) => {
  await page.getByTestId("timeline-item-focus").click()
  await expect(page.getByTestId("editor-popover")).toBeVisible()
  await page.getByTestId("timeline-item-long").click()
  await expect(page.getByTestId("editor-popover")).toHaveCount(1)
  await expect(page.getByTestId("editor-title")).toHaveValue(/This title/)
  await page.mouse.click(40, 40)
  await expect(page.getByTestId("editor-popover")).toHaveCount(0)
})

test("editing keeps hierarchy and completion metadata", async ({ page }) => {
  await page.getByTestId("timeline-item-child").click({ position: { x: 12, y: 12 } })
  await page.getByTestId("editor-title").fill("Edited child")
  await page.getByRole("button", { name: "Save" }).click()

  await expect(page.getByTestId("timeline-item-project")).toHaveAttribute("data-row-span", "4")
  await expect(page.getByTestId("timeline-item-child")).toBeVisible()
  await expect(page.getByTestId("child-structural-icon-child")).toHaveText("->")
  await expect(page.getByText("Edited child")).toBeVisible()
  const storedChild = await page.evaluate(() => {
    const stored = window.localStorage.getItem("timeline.todo.v1")
    if (stored === null) return null
    return JSON.parse(stored).find((item: { id: string }) => item.id === "child") as {
      createdAt: string
      updatedAt: string
    }
  })
  expect(storedChild).not.toBeNull()
  if (storedChild !== null) {
    expect(Date.parse(storedChild.updatedAt)).toBeGreaterThan(Date.parse(storedChild.createdAt))
  }

  await page.getByTestId("timeline-item-project").click()
  await page.getByTestId("editor-title").fill("Edited project")
  await page.getByRole("button", { name: "Save" }).click()

  await expect(page.getByTestId("timeline-item-project")).toHaveAttribute("data-row-span", "4")
  await expect(page.getByTestId("completion-overlay-project")).toBeVisible()
  await expect(page.getByTestId("completion-overlay-project")).toHaveAttribute("data-left-percent", "50")
})

test("track fills the viewport and editor stays inside it", async ({ page }) => {
  const surface = page.getByTestId("timeline-surface")
  const track = page.getByTestId("timeline-track")
  const surfaceBox = await surface.boundingBox()
  const trackBox = await track.boundingBox()
  expect(surfaceBox).not.toBeNull()
  expect(trackBox).not.toBeNull()
  if (surfaceBox === null || trackBox === null) return
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  if (viewport === null) return

  expect(surfaceBox.y + surfaceBox.height).toBeGreaterThanOrEqual(viewport.height - 32)
  await page.getByTestId("timeline-item-long").click()
  const popoverBox = await page.getByTestId("editor-popover").boundingBox()
  expect(popoverBox).not.toBeNull()
  if (popoverBox === null) return

  expect(popoverBox.x).toBeGreaterThanOrEqual(surfaceBox.x)
  expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(surfaceBox.x + surfaceBox.width + 1)
  expect(popoverBox.y + popoverBox.height).toBeLessThanOrEqual(surfaceBox.y + surfaceBox.height + 1)
})

test("empty track click opens an add editor at the clicked hour", async ({ page }) => {
  const surface = page.getByTestId("timeline-surface")
  const box = await surface.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return

  // default view spans 36h from midnight; click empty space past all seed items
  // 34/36 of the width maps to 34:00 -> next-day 10:00
  await page.mouse.click(box.x + box.width * (34 / 36), box.y + 200)

  await expect(page.getByTestId("editor-popover")).toBeVisible()
  await expect(page.getByTestId("editor-start")).toHaveValue("10")
  await expect(page.getByTestId("editor-end")).toHaveValue("11")
})

test("item drag uses one-hour snap even at the default six-hour scale", async ({ page }) => {
  const surfaceBox = await page.getByTestId("timeline-surface").boundingBox()
  const item = page.getByTestId("timeline-item-focus")
  const box = await item.boundingBox()
  expect(surfaceBox).not.toBeNull()
  expect(box).not.toBeNull()
  if (surfaceBox === null || box === null) return
  const threeHours = surfaceBox.width * (3 / 36)

  await page.mouse.move(box.x + 40, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 40 + threeHours, box.y + 20)
  await page.mouse.up()

  await expect(item).toHaveAttribute("data-start-label", "09:00")
  await expect(item).toHaveAttribute("data-end-label", "15:00")
})

test("dragged item follows the pointer before drop", async ({ page }) => {
  const focus = page.getByTestId("timeline-item-focus")
  const focusBox = await focus.boundingBox()
  expect(focusBox).not.toBeNull()
  if (focusBox === null) return

  await page.mouse.move(focusBox.x + 32, focusBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(focusBox.x + 184, focusBox.y + 86)

  await expect(focus).toHaveAttribute("data-drag-preview", "true")
  const previewBox = await focus.boundingBox()
  expect(previewBox).not.toBeNull()
  if (previewBox === null) return
  expect(previewBox.x).toBeGreaterThan(focusBox.x + 120)
  expect(previewBox.y).toBeGreaterThan(focusBox.y + 50)

  await page.mouse.up()
  await expect(focus).toHaveAttribute("data-drag-preview", "false")
})

test("dragging shows parent and root drop affordances", async ({ page }) => {
  const focus = page.getByTestId("timeline-item-focus")
  const project = page.getByTestId("timeline-item-project")
  const surface = page.getByTestId("timeline-surface")
  const focusBox = await focus.boundingBox()
  const projectBox = await project.boundingBox()
  const surfaceBox = await surface.boundingBox()
  expect(focusBox).not.toBeNull()
  expect(projectBox).not.toBeNull()
  expect(surfaceBox).not.toBeNull()
  if (focusBox === null || projectBox === null || surfaceBox === null) return

  await page.mouse.move(focusBox.x + 30, focusBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(projectBox.x + projectBox.width / 2, projectBox.y + 20)
  await expect(surface).toHaveAttribute("data-drop-state", "parent")
  await expect(project).toHaveAttribute("data-drop-target", "true")

  await page.mouse.move(surfaceBox.x + surfaceBox.width - 32, surfaceBox.y + 360)
  await expect(surface).toHaveAttribute("data-drop-state", "root")
  await expect(project).toHaveAttribute("data-drop-target", "false")
  await page.mouse.up()
})

test("dragging vertically can reorder and reparent items", async ({ page }) => {
  const focus = page.getByTestId("timeline-item-focus")
  const child = page.getByTestId("timeline-item-child")
  const project = page.getByTestId("timeline-item-project")
  const focusBox = await focus.boundingBox()
  const childBox = await child.boundingBox()
  const projectBox = await project.boundingBox()
  expect(focusBox).not.toBeNull()
  expect(childBox).not.toBeNull()
  expect(projectBox).not.toBeNull()
  if (focusBox === null || childBox === null || projectBox === null) return

  await page.mouse.move(focusBox.x + 30, focusBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(focusBox.x + 30, childBox.y + 12)
  await page.mouse.up()

  const reorderedFocusBox = await focus.boundingBox()
  const reorderedChildBox = await child.boundingBox()
  expect(reorderedFocusBox).not.toBeNull()
  expect(reorderedChildBox).not.toBeNull()
  if (reorderedFocusBox === null || reorderedChildBox === null) return
  expect(reorderedFocusBox.y).toBeLessThan(reorderedChildBox.y)

  await page.mouse.move(reorderedFocusBox.x + 30, reorderedFocusBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(projectBox.x + projectBox.width / 2, projectBox.y + 20)
  await page.mouse.up()

  await expect(page.getByTestId("child-structural-icon-focus")).toHaveText("->")
  await expect(focus).toHaveAttribute("data-parent-id", "project")
  await expect(focus).toHaveAttribute("data-visual-state", "child")
})

test("dragging a child onto empty track space removes its parent", async ({ page }) => {
  const focus = page.getByTestId("timeline-item-focus")
  const project = page.getByTestId("timeline-item-project")
  const focusBox = await focus.boundingBox()
  const projectBox = await project.boundingBox()
  expect(focusBox).not.toBeNull()
  expect(projectBox).not.toBeNull()
  if (focusBox === null || projectBox === null) return

  await page.mouse.move(focusBox.x + 30, focusBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(projectBox.x + projectBox.width / 2, projectBox.y + 20)
  await page.mouse.up()
  await expect(focus).toHaveAttribute("data-parent-id", "project")

  const childBox = await focus.boundingBox()
  const surfaceBox = await page.getByTestId("timeline-surface").boundingBox()
  expect(childBox).not.toBeNull()
  expect(surfaceBox).not.toBeNull()
  if (childBox === null || surfaceBox === null) return

  await page.mouse.move(childBox.x + 30, childBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(surfaceBox.x + surfaceBox.width - 28, surfaceBox.y + 360)
  await page.mouse.up()

  await expect(focus).toHaveAttribute("data-parent-id", "")
  await expect(page.getByTestId("child-structural-icon-focus")).toHaveCount(0)
  await expect(focus).toHaveAttribute("data-visual-state", "root")
})

test("panning keeps ticks on clock-aligned positions", async ({ page }) => {
  const surface = page.getByTestId("timeline-surface")
  const box = await surface.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return

  await page.mouse.move(box.x + 500, box.y + 220)
  await page.mouse.down()
  await page.mouse.move(box.x + 420, box.y + 220)
  await page.mouse.up()

  const tick = page.getByTestId("tick-06:00").first()
  const tickBox = await tick.boundingBox()
  expect(tickBox).not.toBeNull()
  if (tickBox === null) return
  expect(tickBox.x).toBeGreaterThan(box.x)
  expect(tickBox.x).toBeLessThan(box.x + box.width)
})
