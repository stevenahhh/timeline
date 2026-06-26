# Svelte Timeline Todo App Plan

## TL;DR
> **Summary**: Build a browser-first SvelteKit/Svelte 5 timeline todo app with TypeScript, Bun, custom CSS, Vitest, and Playwright. Items are draggable, resizable, snap to the active time grid, support unbounded parent/child nesting, and can mark the segment from the current time forward complete. Keep Tauri v2 as an optional local-desktop wrapper after the browser surface works.
> **Deliverables**: local Svelte app scaffold, timeline axis and zoom model, drag/resize snap behavior, recursive nesting model, partial-completion rendering, todo item rendering, shared add/edit customization bubble, color customization, tests, browser QA artifacts, optional Tauri integration plan.
> **Effort**: Medium
> **Parallel**: YES - 3 waves
> **Critical Path**: scaffold -> timeline model tests -> UI rendering -> popover/customization -> QA -> optional Tauri

## Context

### Original Request
The project root is `C:\Users\steve\Desktop\projects\timeline`. The app should be a simple-looking Svelte web app, not React and not Tailwind. It should use current library/project-start guidance from web research and prefer fast tooling such as Bun, pnpm, or uv. Deployment is not planned. Local execution matters, and Tauri/Rust are acceptable if compatible.

The app is a timeline-shaped todo manager. Dates are the horizontal axis. The default time scale is 6-hour ticks: 0, 6, 12, 18, 0. Horizontal scroll primarily changes the scale, with maximum zoom at 1-hour ticks. The vertical axis represents todo count but should not show labels. Timeline items show an icon and text inside the item, anchored from the left edge. Clicking an item opens a customization bubble below the item. The add-item window and edit-item customization window share format and visual style. Clicking outside closes the bubble, and only one bubble can be open globally. Item color is customizable. Border customization is deferred.

### Research Summary
- SvelteKit official docs use `sv create` for new projects and local `dev` scripts for running the app: https://svelte.dev/docs/kit/creating-a-project
- Svelte CLI docs cover package-manager runners and project creation commands: https://svelte.dev/docs/cli/overview
- Svelte testing docs support Vitest and Playwright-style testing in Svelte/Vite projects: https://svelte.dev/docs/svelte/testing
- SvelteKit SPA/static fallback docs fit a local web app or future Tauri wrapper: https://svelte.dev/docs/kit/single-page-apps
- Tauri v2 official docs support Svelte templates and Bun/pnpm package-manager choices through `create-tauri-app`: https://v2.tauri.app/start/create-project/
- Bun official docs support `bun create` for `create-*` templates and local development workflows: https://bun.com/docs/runtime/templating/create

### Defaults Applied
- Use **Bun** as package manager and script runner. Reason: fast TypeScript/Vite workflow and supported by Svelte/Tauri tooling.
- Start with **SvelteKit + TypeScript** rather than plain Vite Svelte. Reason: official Svelte project path, built-in testing/add-on path, easier future SPA/static/Tauri handling.
- Configure as a **client-only local app** with static adapter/SPA behavior when build configuration is added. Reason: no backend or deployment requirement.
- Use **custom CSS**, not Tailwind or a UI framework. Reason: requested exclusion and small feature surface.
- Include **localStorage persistence** in the first implementation unless rejected. Reason: a todo manager feels broken if all items disappear on refresh, and local-only storage matches the no-backend constraint.
- Defer **Tauri** to the final optional wave. Reason: browser implementation can be tested faster; Tauri adds Rust/toolchain surface without changing the core timeline behavior.
- Treat todos as **duration bars** with `startAt` and `endAt`, not point markers. Reason: item width and left/right edges are meaningful in the requested timeline UI.
- Use local timezone for labels and day boundaries in v1. Reason: the app is local-only and the requested labels are clock-hour labels.
- Define scroll behavior as **wheel over timeline zooms scale**, while a visible horizontal scroll/pan area moves through time if the content exceeds viewport width. Reason: this avoids trapping all navigation inside zoom.
- Use supported tick scales of `6h`, `3h`, and `1h`. Reason: the user explicitly gave 6h default and 1h minimum; `3h` gives one predictable intermediate step.
- Define "simple-looking" as compact, work-focused, custom CSS, low decoration, high readability, and no landing/marketing first screen.

### Interaction Rules
- Quantize horizontal move, resize, and drop operations to the active time-step interval. Default zoom snaps to 6-hour marks; maximum zoom snaps to 1-hour marks.
- Dragging an item body moves its start and end time together. Dragging the trailing edge changes only the end time. Minimum duration is one snap interval.
- Dropping one item onto another item's content area makes it a child of the drop target. Self-drops and descendant drops are rejected.
- Reparenting appends the dragged item as the last child of the drop target, and sibling order is stored explicitly so the tree renders deterministically.
- Nesting has no fixed depth limit. A parent's visual row span equals one row for itself plus the row spans of all descendants, recursively.
- Root items render the normal configurable icon field. Child items render a fixed bent-arrow structural icon and an optional leading icon to its left; the default child icon is empty.
- Child items keep the same timeline editing behavior as root items, including drag, resize, color editing, and time snapping.
- Completion is a time-based overlay, not a replacement for the item's custom color. Activating completion stores `completedFrom` as the current local time clamped into the item range, and the segment from `completedFrom` to `endAt` renders with the completion color.
- Default completion gesture is a compact check icon button inside the item, because it is discoverable and does not conflict with dragging or opening the editor. Double-clicking the item may mirror the same completion action only if it does not conflict with item editing in implementation.
- Completion color defaults to green, using a token such as `--completion-color`, and can be adjusted in CSS without changing item data.

### Decisions Needed
1. **Persistence**: Recommended default is `localStorage`. Alternative is session-only state for the first prototype.
2. **Item creation gesture**: Recommended default is toolbar `+` button plus clicking an empty timeline slot. Alternative is toolbar-only.
3. **Icons**: Recommended default is `lucide-svelte` for UI controls and a small selectable icon list for todo items. Alternative is emoji-only to reduce dependencies.
4. **Tauri timing**: Recommended default is plan it as optional after browser QA passes. Alternative is scaffold Tauri from the start.

## Work Objectives

### Core Objective
Create a local Svelte timeline todo app whose visible behavior matches the requested timeline, zoom, item, and customization-bubble interactions.

### Deliverables
- A Bun-managed SvelteKit TypeScript project in `C:\Users\steve\Desktop\projects\timeline`.
- Timeline viewport with horizontal date/time axis and hidden vertical labels.
- Wheel/scroll zoom behavior that changes scale between 6-hour and 1-hour tick intervals.
- Drag/resize interactions that always snap to the active zoom interval.
- Recursive parent/child nesting with vertical row-span expansion for descendants.
- Partial-completion state that colors the item segment from the current time to the item's end time.
- Todo item model with start/end time, icon, text, color, parent reference, optional completion boundary, and stable layout.
- Todo item fields: `id`, `title`, `icon`, `color`, `startAt`, `endAt`, `parentId`, `order`, `completedFrom`, `createdAt`, `updatedAt`.
- Storage schema fields if persistence is accepted: `version`, `items`, `visibleStart`, `scale`.
- Shared add/edit customization bubble component.
- Single-open popover state and outside-click close behavior.
- Local persistence if accepted.
- Vitest tests for timeline math/state and Playwright tests for the browser surface.
- Optional Tauri v2 wrapper task after browser app verification.

### Definition of Done
- `bun install` completes.
- `bun run check` exits 0.
- `bun test` or project-generated unit test command exits 0.
- `bunx playwright test` or project-generated e2e command exits 0.
- The app runs locally through `bun run dev -- --host 127.0.0.1`.
- Browser QA confirms item creation, drag move, resize snap, recursive nesting, completion overlay, zoom, customization, single popover, outside close, and color change.
- No React or Tailwind dependency exists in `package.json`.

### Must Have
- Svelte/SvelteKit TypeScript app.
- Date/time horizontal axis with default 6-hour ticks.
- Zoom floor of 1-hour ticks.
- Item drag and resize operations snap to the active time-step interval.
- Hidden vertical-axis labels.
- Item icon/text anchored from left edge.
- Child items render a fixed arrow icon plus an optional leading icon, with no default child icon.
- Parent items expand vertically to contain nested child rows at any depth.
- Item completion action colors the segment from the current time to the item end with the completion color.
- Shared add/edit bubble look and form structure.
- One open bubble at a time.
- Outside-click close.
- Color customization.
- Keyboard basics: Escape closes the bubble, save/cancel buttons are keyboard reachable, focus returns to the triggering item or add button.

### Must NOT Have
- React.
- Tailwind.
- Backend/server persistence.
- Deployment configuration.
- Border customization beyond leaving space for a future property.
- Speculative collaboration/auth/account features.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.

- Test decision: TDD with Vitest for model/state/component behavior, then Playwright for browser-visible outcomes.
- QA policy: every implementation task includes at least one automated test and one real browser scenario.
- Evidence path convention: `evidence/task-{N}-{slug}.txt` for command output and `evidence/task-{N}-{slug}.png` for browser screenshots.
- Manual QA channel: Browser use for user-facing behavior; command output for scaffold/build/test checks.
- Browser target: Chromium via Playwright for repeatable scroll, click, focus, and screenshot behavior.

## Execution Strategy

### Parallel Execution Waves
Wave 1: scaffold/tooling, strict config, domain model tests.
Wave 2: timeline rendering, zoom math, item layout, add/edit state.
Wave 3: customization bubble, persistence, e2e QA, optional Tauri wrapper.

### Dependency Matrix
- Task 1 blocks all implementation tasks.
- Task 2 depends on Task 1 and blocks rendering/zoom tasks.
- Task 3 depends on Task 2 and blocks item placement.
- Task 4 depends on Task 2 and can run with Task 3.
- Task 5 depends on Tasks 3 and 4.
- Task 6 depends on Task 5.
- Task 7 depends on Task 6.
- Task 8 depends on all browser tasks and is optional based on Tauri decision.
- Final verification depends on all accepted tasks.

## TODOs

- [x] 1. Scaffold SvelteKit Project

  **What to do**: In `C:\Users\steve\Desktop\projects\timeline`, create a Bun-managed SvelteKit TypeScript project using current `sv create`/Bun-compatible workflow. Because the directory already contains planning files, use the CLI's non-empty-directory flow or scaffold into a temporary sibling directory and move only the generated scaffold files into the root, preserving `.omo/` and `plans/` untouched. Preferred command: `bunx sv create . --template minimal --types ts --install bun`. If add-ons can be supplied non-interactively in the current CLI, include Vitest and Playwright through `--add`; otherwise immediately run `bunx sv add vitest playwright` or answer the interactive prompts with Vitest and Playwright selected. Do not add Tailwind. Initialize Git only if the user wants it or the generator does it explicitly.
  **Must NOT do**: Do not create React files, Tailwind config, backend routes, deployment adapters, or Tauri yet.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 3, 4, 5, 6, 7, 8 | Blocked By: none

  **References**:
  - External: `https://svelte.dev/docs/kit/creating-a-project` - official SvelteKit project creation.
  - External: `https://svelte.dev/docs/cli/overview` - Svelte CLI/package-manager command patterns.
  - External: `https://bun.com/docs/runtime/templating/create` - Bun template creation behavior.

  **Acceptance Criteria**:
  - [ ] `package.json` exists and contains Svelte/SvelteKit dependencies.
  - [ ] `package.json` contains no `react`, `react-dom`, `tailwindcss`, or Tailwind plugins.
  - [ ] `bun install` exits 0.
  - [ ] `bun run check` exits 0.
  - [ ] Test scripts for unit and e2e execution are present or documented in `package.json`.
  - [ ] The scaffold does not overwrite `plans/` or `.omo/`.

  **QA Scenarios**:
  ```text
  Scenario: Fresh local dev app starts
    Tool: command + browser use
    Steps: run `bun run dev -- --host 127.0.0.1`; open `http://127.0.0.1:<port>/`
    Expected: page loads with app shell text or timeline placeholder, no console startup error
    Evidence: evidence/task-1-scaffold.txt, evidence/task-1-scaffold.png

  Scenario: Forbidden framework check
    Tool: command
    Steps: inspect `package.json` dependency keys for `react`, `react-dom`, `tailwindcss`
    Expected: none are present
    Evidence: evidence/task-1-forbidden-deps.txt
  ```

  **Commit**: YES | Message: `feat(app): scaffold svelte timeline app` | Files: project scaffold files

- [x] 2. Define Timeline Domain Model and Scale Math

  **What to do**: Add typed domain/state utilities for timeline items, time ranges, tick interval, zoom state, recursive parent/child tree layout, and partial completion. Represent supported tick scales explicitly as `6h`, `3h`, and `1h`. Add pure functions for tick generation, snap quantization, item horizontal positioning, row-span calculation, valid reparenting, completion-boundary clamping, and wheel-to-scale changes. Use local timezone clock labels in v1.
  **Must NOT do**: Do not read DOM dimensions inside pure model functions. Do not add persistence or UI behavior here.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 3, 4, 5 | Blocked By: 1

  **References**:
  - API/Type: create under `src/lib/timeline/` after scaffold.
  - External: `https://svelte.dev/docs/svelte/testing` - Vitest-compatible Svelte testing guidance.

  **Acceptance Criteria**:
  - [ ] Unit tests prove default tick generation emits 0, 6, 12, 18, 0 for a day boundary.
  - [ ] Unit tests prove maximum zoom clamps at 1-hour ticks.
  - [ ] Unit tests prove drag and resize snap to 6-hour, 3-hour, and 1-hour intervals as the scale changes.
  - [ ] Unit tests prove item left/width calculations are stable for start/end time.
  - [ ] Unit tests prove parent row spans expand recursively for multi-level descendants.
  - [ ] Unit tests prove child drops reject self and descendant targets.
  - [ ] Unit tests prove completion clamps the current local time into the item range before storing `completedFrom`.
  - [ ] Unit tests prove completion overlay width is derived from `completedFrom` to `endAt`.
  - [ ] Unit tests prove invalid item duration (`endAt <= startAt`) is rejected at the state boundary.
  - [ ] No model file exceeds 250 pure LOC.

  **QA Scenarios**:
  ```text
  Scenario: Default axis ticks
    Tool: Vitest
    Steps: run model test for a known 2026-06-08 day range
    Expected: tick labels equal 00:00, 06:00, 12:00, 18:00, 00:00
    Evidence: evidence/task-2-default-ticks.txt

  Scenario: Zoom clamp edge case
    Tool: Vitest
    Steps: apply repeated zoom-in events from 6-hour scale
    Expected: scale never goes below 1-hour ticks
    Evidence: evidence/task-2-zoom-clamp.txt

  Scenario: Invalid duration is rejected
    Tool: Vitest
    Steps: try to construct or save item with `endAt` before `startAt`
    Expected: item is not accepted and the caller receives a typed validation result
    Evidence: evidence/task-2-invalid-duration.txt

  Scenario: Recursive nesting row span
    Tool: Vitest
    Steps: build a tree with a parent, one child, and two grandchildren under that child
    Expected: the parent row span is 4 and the child row span is 3
    Evidence: evidence/task-2-recursive-row-span.txt

  Scenario: Completion boundary clamps to item range
    Tool: Vitest
    Steps: mark completion before, inside, and after an item time range
    Expected: `completedFrom` stores the clamped boundary and overlay geometry never exceeds the item
    Evidence: evidence/task-2-completion-boundary.txt
  ```

  **Commit**: YES | Message: `feat(timeline): add time scale model` | Files: `src/lib/timeline/*`, tests

- [x] 3. Build Timeline View and Axis

  **What to do**: Implement the main timeline surface with a horizontal time axis, wheel-driven zoom, drag and resize handles, visible horizontal pan/scroll when needed, hidden vertical labels, stable rows for todo items, and responsive sizing. Use CSS grid/flex or absolute positioning as appropriate, but keep dimensions stable so zoom and hover do not shift layout unpredictably.
  **Must NOT do**: Do not add decorative landing-page content. The first screen is the usable timeline.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 5, 6 | Blocked By: 2

  **References**:
  - Pattern: Svelte component conventions from generated scaffold.
  - API/Type: timeline model from Task 2.

  **Acceptance Criteria**:
  - [ ] Default viewport shows 6-hour tick marks.
  - [ ] Vertical axis area has no visible labels.
  - [ ] Wheel/scroll changes scale rather than navigating the page when focused on the timeline.
  - [ ] Repeated wheel zoom cycles through `6h -> 3h -> 1h` and clamps at `1h`.
  - [ ] Dragging and resizing items previews snapped positions at the active scale.
  - [ ] Browser screenshot shows a usable timeline as the first screen.

  **QA Scenarios**:
  ```text
  Scenario: First screen is the timeline
    Tool: Playwright browser use
    Steps: open `/`; query visible tick labels
    Expected: 00:00, 06:00, 12:00, 18:00 are visible; no marketing hero is visible
    Evidence: evidence/task-3-first-screen.png

  Scenario: Vertical labels hidden
    Tool: Playwright browser use
    Steps: open `/`; inspect row label area
    Expected: no row label text is visible
    Evidence: evidence/task-3-hidden-y-axis.png

  Scenario: Wheel zoom reaches one-hour scale
    Tool: Playwright browser use
    Steps: open `/`; wheel over timeline until zoomed in
    Expected: one-hour tick labels are visible and further zoom-in does not shrink below one hour
    Evidence: evidence/task-3-one-hour-zoom.png

  Scenario: Drag and resize snap to the grid
    Tool: Playwright browser use
    Steps: open `/`; drag an item horizontally and resize its trailing edge at both 6-hour and 1-hour zoom levels
    Expected: the item's start and end always land on the current snap interval
    Evidence: evidence/task-3-drag-snap.png
  ```

  **Commit**: YES | Message: `feat(timeline): render zoomable timeline axis` | Files: Svelte timeline components and styles

- [ ] 4. Implement Todo Item Rendering

  **What to do**: Render root and recursively nested child todo items on timeline rows based on start/end time and parent links. Inside each item, place icon and text from the left edge with compact spacing and overflow handling. Child items render a fixed bent-arrow structural icon plus an optional leading icon; root items render the normal icon field. Render a green completion overlay from `completedFrom` to `endAt` when present, without hiding the left-anchored icon/title. Include a small initial sample item only if needed for first-run usability; otherwise support creation in Task 5.
  **Must NOT do**: Do not show item content outside its colored bar. Do not add border customization.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 5, 6 | Blocked By: 2

  **References**:
  - API/Type: timeline item model from Task 2.
  - Design guardrail: item text must fit or ellipsize cleanly at narrow widths.

  **Acceptance Criteria**:
  - [ ] Items align to the correct horizontal position for their time range.
  - [ ] Icon and text are inside the item, anchored from the left.
  - [ ] Child items show the fixed structural arrow icon and an empty leading icon by default.
  - [ ] Parent items reserve vertical space for descendants at any depth.
  - [ ] Completion overlay colors only the completed time segment and does not obscure item text.
  - [ ] Long text does not overflow outside the item.
  - [ ] Item color comes from item state.

  **QA Scenarios**:
  ```text
  Scenario: Item content is left anchored
    Tool: Playwright browser use
    Steps: render item `* Focus block` from 06:00 to 12:00
    Expected: icon and text are visible inside the item near the left edge
    Evidence: evidence/task-4-item-content.png

  Scenario: Child item icon is structural
    Tool: Playwright browser use
    Steps: render a nested child item with an empty leading icon
    Expected: the fixed bent-arrow structural icon is visible and the empty icon slot does not render a default child icon
    Evidence: evidence/task-4-child-icon.png

  Scenario: Parent row expands for children
    Tool: Playwright browser use
    Steps: render a parent item with one child and two grandchildren under that child
    Expected: the parent reserves four vertical rows total and the descendants do not overlap other rows
    Evidence: evidence/task-4-parent-span.png

  Scenario: Completion overlay starts at current time
    Tool: Playwright browser use
    Steps: render an item spanning before and after the current time, activate completion, and inspect the bar
    Expected: the segment from current time to item end is green while the earlier segment keeps the item color
    Evidence: evidence/task-4-completion-overlay.png

  Scenario: Long title overflow
    Tool: Playwright browser use
    Steps: render a narrow item with a long title
    Expected: title clips or ellipsizes inside the item without overlapping the axis
    Evidence: evidence/task-4-long-title.png
  ```

  **Commit**: YES | Message: `feat(timeline): render todo items` | Files: item components and tests

- [ ] 5. Add Shared Add/Edit Customization Bubble

  **What to do**: Create one reusable customization component used for both adding and editing items. It appears as a speech-bubble style panel below the target item or creation point. It includes title, icon, start/end time controls, color selection, save, cancel, and delete only for existing items. For child items, the icon field controls the optional leading icon that appears before the fixed arrow. Add a compact check icon button on each item that toggles `completedFrom` using the current local time; double-click can mirror this action only if it remains distinguishable from opening the edit bubble. It updates existing items or creates a new item through typed state transitions.
  **Must NOT do**: Do not create separate visual implementations for add and edit. Do not add border controls.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 6, 7 | Blocked By: 3, 4

  **References**:
  - Pattern: Svelte event/state patterns from scaffold.
  - Design: custom CSS, compact utility-like classes are allowed, Tailwind is not.

  **Acceptance Criteria**:
  - [ ] Add and edit flows render the same customization component.
  - [ ] Bubble appears below the selected item or insertion point.
  - [ ] Color selector changes the item color.
  - [ ] Child item editing keeps the structural arrow fixed and leaves the leading icon optional.
  - [ ] Completion check button sets `completedFrom` to the current time clamped into the item range.
  - [ ] Completion can be cleared without changing item color, title, or timing.
  - [ ] Border customization is absent.
  - [ ] Empty title cannot be saved.
  - [ ] Escape closes the bubble and focus returns to the trigger.

  **QA Scenarios**:
  ```text
  Scenario: Add item through bubble
    Tool: Playwright browser use
    Steps: click add button, enter `Write spec`, choose color `#2f7d68`, save
    Expected: a timeline item appears with text `Write spec` and selected color
    Evidence: evidence/task-5-add-item.png

  Scenario: Edit item through same bubble
    Tool: Playwright browser use
    Steps: click existing item, change text to `Review spec`, save
    Expected: same item updates text and keeps timeline position
    Evidence: evidence/task-5-edit-item.png

  Scenario: Empty title validation
    Tool: Playwright browser use
    Steps: open add bubble, clear title, click save
    Expected: no item is created and a compact validation state is visible
    Evidence: evidence/task-5-empty-title.png

  Scenario: Mark item complete from now
    Tool: Playwright browser use
    Steps: click an item's completion check button while the current time falls inside the item range
    Expected: the segment from current time to the item end changes to the completion color
    Evidence: evidence/task-5-complete-from-now.png
  ```

  **Commit**: YES | Message: `feat(timeline): add shared item editor bubble` | Files: editor component, timeline state, tests

- [ ] 6. Enforce Single-Open Popover and Outside Close

  **What to do**: Centralize open-popover state so only one customization bubble can exist at a time. Add outside-click handling that closes the current bubble without losing already saved item data. Ensure opening add mode closes edit mode and opening edit mode closes add mode.
  **Must NOT do**: Do not attach multiple document-level listeners without cleanup.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 7 | Blocked By: 5

  **References**:
  - API/Type: component state introduced in Task 5.

  **Acceptance Criteria**:
  - [ ] Opening one item's bubble closes any other bubble.
  - [ ] Clicking outside closes the bubble.
  - [ ] Clicking inside the bubble does not close it prematurely.
  - [ ] Tests cover add/edit mode switching.
  - [ ] Escape closes the currently open bubble.

  **QA Scenarios**:
  ```text
  Scenario: Only one bubble open
    Tool: Playwright browser use
    Steps: open item A, then open item B
    Expected: item A bubble is gone and item B bubble is visible
    Evidence: evidence/task-6-single-open.png

  Scenario: Outside click closes bubble
    Tool: Playwright browser use
    Steps: open an item bubble, click empty timeline background
    Expected: no customization bubble remains visible
    Evidence: evidence/task-6-outside-close.png

  Scenario: Escape closes bubble
    Tool: Playwright browser use
    Steps: open an item bubble, press Escape
    Expected: no customization bubble remains visible and focus returns to the item
    Evidence: evidence/task-6-escape-close.png
  ```

  **Commit**: YES | Message: `feat(timeline): enforce single editor bubble` | Files: state/event handling and tests

- [ ] 7. Add Local Persistence and Full Browser QA

  **What to do**: If persistence is accepted, persist todos, parent/child links at arbitrary depth, sibling order, completion boundaries, and current visible settings to `localStorage` behind a typed boundary using storage key `timeline.todo.v1`. Load persisted state on startup. If JSON is corrupt or schema version is unsupported, reset to empty state without crashing. Add e2e tests for refresh survival. Run the complete browser QA flow and record screenshots.
  **Must NOT do**: Do not add backend persistence or remote sync.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 8, final verification | Blocked By: 6

  **References**:
  - API/Type: item model from Task 2.

  **Acceptance Criteria**:
  - [ ] Items survive refresh when `localStorage` is accepted.
  - [ ] Multi-level parent/child relationships and sibling order survive refresh when `localStorage` is accepted.
  - [ ] Completion boundaries survive refresh when `localStorage` is accepted.
  - [ ] Malformed stored data is ignored or reset safely without crashing the app.
  - [ ] Unsupported storage version resets safely without crashing the app.
  - [ ] Full Playwright suite passes.
  - [ ] Manual browser QA screenshots are captured.

  **QA Scenarios**:
  ```text
  Scenario: Refresh keeps item
    Tool: Playwright browser use
    Steps: create `Persist me`, reload page
    Expected: `Persist me` remains visible
    Evidence: evidence/task-7-refresh-persistence.png

  Scenario: Refresh keeps hierarchy
    Tool: Playwright browser use
    Steps: create a parent item with one child and two grandchildren, reload page
    Expected: the full hierarchy remains nested under the same ancestors and sibling order is preserved
    Evidence: evidence/task-7-refresh-hierarchy.png

  Scenario: Refresh keeps completion boundary
    Tool: Playwright browser use
    Steps: mark an item complete from now, reload page
    Expected: the completion overlay remains at the stored time boundary
    Evidence: evidence/task-7-refresh-completion.png

  Scenario: Malformed localStorage recovery
    Tool: Playwright browser use
    Steps: set timeline storage key to invalid JSON, reload page
    Expected: app loads empty timeline without console crash
    Evidence: evidence/task-7-malformed-storage.png
  ```

  **Commit**: YES | Message: `feat(timeline): persist local todo state` | Files: storage module and tests

- [ ] 8. Optional Tauri v2 Local Desktop Wrapper

  **What to do**: If accepted, add Tauri v2 after the browser app passes. Use Tauri's official Svelte-compatible setup or manual CLI integration with the existing frontend. Configure the frontend dev/build commands to Bun scripts. Keep Rust code minimal and limit verification to command-level smoke checks if no desktop automation surface is available.
  **Must NOT do**: Do not add custom Rust commands unless the browser app needs native functionality.

  **Parallelization**: Can Parallel: NO | Wave 3 optional | Blocks: final verification | Blocked By: 7

  **References**:
  - External: `https://v2.tauri.app/start/create-project/` - Tauri v2 project creation and Svelte/Bun support.

  **Acceptance Criteria**:
  - [ ] `bun tauri dev` or equivalent starts the desktop wrapper.
  - [ ] The wrapper points at the same frontend entry point as the browser app.
  - [ ] Rust code remains scaffold-only unless a native need is identified.

  **QA Scenarios**:
  ```text
  Scenario: Tauri wrapper smoke starts
    Tool: command
    Steps: run `bun tauri dev` or `bun tauri build`
    Expected: the wrapper starts or builds cleanly without Rust/toolchain errors
    Evidence: evidence/task-8-tauri-smoke.txt
  ```

  **Commit**: YES if accepted | Message: `feat(app): add tauri local wrapper` | Files: `src-tauri/*`, Tauri config, package scripts

## Final Verification Wave
> ALL must pass before implementation is considered complete.

- [ ] F1. Plan Compliance Audit
  - Verify every user requirement maps to an implemented behavior or explicit exclusion.
  - Command/evidence: `evidence/final-plan-compliance.txt`.

- [ ] F2. Dependency Guard
  - Verify `package.json` does not contain React or Tailwind.
  - Command/evidence: `evidence/final-dependency-guard.txt`.

- [ ] F3. Type/Test Gate
  - Run `bun run check`, `bun test` or generated unit command, and `bunx playwright test` or generated e2e command.
  - Command/evidence: `evidence/final-test-gate.txt`.

- [ ] F4. Real Browser QA
  - Start dev server and drive the app in a browser: create item, drag and resize it on the snap grid, nest child and grandchild items, mark an item complete from current time, zoom to 1-hour scale, edit color/text, verify single bubble, verify outside close.
  - Evidence: `evidence/final-browser-qa.png` plus action log.

- [ ] F5. Optional Tauri QA
  - Only if Task 8 is accepted. Run the Tauri smoke check and, if desktop automation is available, verify the same first-screen timeline and bubble behavior.
  - Evidence: `evidence/final-tauri-qa.txt` plus optional screenshot if desktop automation is available.

## Commit Strategy
- Do not auto-commit unless the user approves execution and commits.
- When committing, use small Conventional Commits matching each completed task.
- Recommended final branch name if needed: `codex/timeline-svelte-app`.

## Success Criteria
- The plan file exists at `C:\Users\steve\Desktop\projects\timeline\plans\timeline-svelte-app.md`.
- All implementation tasks include references, acceptance criteria, QA scenarios, and commit guidance.
- User decisions are explicit and have recommended defaults.
- The implementation path starts browser-first and keeps Tauri optional.
- Scope boundaries exclude React, Tailwind, deployment, backend, and border customization.
