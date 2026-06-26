# Timeline Drag Follow UX

## TL;DR
> Summary:      Make dragged timeline bars visually follow the mouse during move drags, expose active drop affordances, and preserve existing one-hour snap/reparent/unparent behavior.
> Deliverables:
> - Pointer-follow drag preview for move drags
> - Parent/root drop affordance data attributes and styling hooks
> - Focused Playwright coverage plus evidence screenshots
> Effort:       Short
> Risk:         Medium - drag behavior spans live item time mutation, layout drop logic, and browser mouse event tests

## Scope
### Must have
- Implement in `C:\Users\steve\Desktop\projects\timeline`.
- While a move drag is active, the dragged bar visibly follows both X and Y mouse movement before mouseup.
- Preserve current final time behavior: move and resize still snap to one-hour boundaries even when visible scale is six hours.
- Preserve current final layout behavior: vertical drag can reorder, valid item hover can reparent, empty track/root space can unparent.
- Expose stable test hooks for drag preview state, drop state, and drop target state.
- Add/keep automated Playwright tests that fail before implementation and pass after implementation.
- Capture evidence under `evidence/`.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not rewrite the timeline architecture or split `src/routes/+page.svelte` unless absolutely required for the task.
- Do not change storage keys, initial seed data, item model shape, or editor behavior.
- Do not alter unrelated visual design, add new features, or refactor tests outside drag UX coverage.
- Do not implement custom drag-and-drop libraries; use the existing mouse event flow.
- Do not depend on human manual testing; all verification must be agent-executed.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Playwright e2e and existing Svelte checks
- QA policy: every task has agent-executed scenarios
- Evidence: `evidence/task-<N>-<slug>.<ext>`

## Execution strategy
### Parallel execution waves
> Target 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks to maximize parallelism.

Wave 1 (no dependencies):
- Task 1: Confirm failing drag-follow and affordance tests
- Task 2: Add drag-derived UI state in page component
- Task 3: Extend item bar props/test hooks/styles

Wave 2 (after Wave 1):
- Task 4: Wire page state into rendered bars and surface
- Task 5: Preserve drop application and click suppression behavior
- Task 6: Capture automated QA evidence

Wave 3 (after Wave 2):
- Task 7: Run full verification and prepare commit

Critical path: Task 1 -> Task 2 -> Task 4 -> Task 6 -> Task 7

### Dependency matrix
| Task | Depends on | Blocks | Can parallelize with |
|------|------------|--------|----------------------|
| 1    | none       | 4, 6, 7 | 2, 3                 |
| 2    | none       | 4, 5    | 1, 3                 |
| 3    | none       | 4       | 1, 2                 |
| 4    | 1, 2, 3    | 5, 6, 7 | none                 |
| 5    | 2, 4       | 6, 7    | none                 |
| 6    | 1, 4, 5    | 7       | none                 |
| 7    | 6          | none    | none                 |

## Todos
> Implementation + Test = ONE task. Never separate.
> Every task MUST have: References + Acceptance Criteria + QA Scenarios + Commit.

- [ ] 1. Confirm the current failing specs define the desired behavior

  What to do: Run the existing targeted Playwright specs for drag-follow preview and drop affordances. Based on exploration, `e2e/timeline.e2e.ts` already contains specs for `data-drag-preview`, pointer-follow bounding box movement, `data-drop-state`, and `data-drop-target`; confirm they fail for the current implementation before changing source.
  Must NOT do: Do not edit source or tests in this task.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [4, 6, 7] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Test:     `e2e/timeline.e2e.ts:213` - existing spec expects dragged item to follow pointer before drop
  - Test:     `e2e/timeline.e2e.ts:234` - existing spec expects parent/root drop affordance attributes
  - Test:     `e2e/timeline.e2e.ts:258` - existing reparent/reorder behavior to preserve
  - Test:     `e2e/timeline.e2e.ts:292` - existing unparent behavior to preserve
  - API/Type: `playwright.config.ts:4` - e2e web server uses `bun run build && bun run preview` on port 4173
  - External: `https://playwright.dev/docs/api/class-mouse` - mouse movement uses viewport CSS pixels and supports `move`, `down`, `up`

  Acceptance criteria (agent-executable only):
  - [ ] `bunx playwright test e2e/timeline.e2e.ts -g "dragged item follows the pointer before drop|dragging shows parent and root drop affordances"` exits non-zero before implementation
  - [ ] Failure output is saved to `evidence/task-1-drag-follow-baseline.txt`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: baseline failing drag-follow specs
    Tool:     bash
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; bunx playwright test e2e/timeline.e2e.ts -g "dragged item follows the pointer before drop|dragging shows parent and root drop affordances" *> evidence/task-1-drag-follow-baseline.txt
    Expected: Command exits non-zero and output mentions missing `data-drag-preview` or `data-drop-state`/`data-drop-target`
    Evidence: evidence/task-1-drag-follow-baseline.txt

  Scenario: existing snap/reparent tests are identifiable
    Tool:     bash
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; bunx playwright test e2e/timeline.e2e.ts -g "item drag uses one-hour snap|dragging vertically can reorder and reparent|dragging a child onto empty track" *> evidence/task-1-existing-drag-behavior.txt
    Expected: Command completes with either pass or unrelated current failures; output identifies all three selected tests
    Evidence: evidence/task-1-existing-drag-behavior.txt
  ```

  Commit: NO | Message: `test(timeline): capture drag ux baseline` | Files: [evidence/task-1-drag-follow-baseline.txt, evidence/task-1-existing-drag-behavior.txt]

- [ ] 2. Derive live drag preview and drop affordance state

  What to do: In `src/routes/+page.svelte`, add small derived helpers from existing `dragState` to compute active move drag id, pointer delta, preview transform, drop state (`none`, `parent`, `root`), and active drop target id. Reuse existing `findDropParent`, `rowIndexFromClientY`, and `pointerCurrentX/Y`; if helper reuse causes side effects, extract a pure lookup helper and keep `applyDropLayout` behavior unchanged.
  Must NOT do: Do not change `TimelineItem` model, localStorage format, seed data, or drag finalization semantics.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [4, 5] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/routes/+page.svelte:46` - current `DragState` move variant already stores start/current X/Y
  - Pattern:  `src/routes/+page.svelte:253` - mousemove updates moved state and live item time
  - Pattern:  `src/routes/+page.svelte:277` - move drags already update `pointerCurrentX/Y`
  - Pattern:  `src/routes/+page.svelte:392` - final drop layout consumes completed move drag
  - Pattern:  `src/routes/+page.svelte:412` - current parent target detection uses `elementFromPoint`
  - API/Type: `src/lib/timeline/model.ts:123` - time snap helper used by current drag movement

  Acceptance criteria (agent-executable only):
  - [ ] `bun run check` passes after helper changes
  - [ ] During an active move drag, a page-level derived value can distinguish parent target, root track space, and no active move
  - [ ] Existing `applyDropLayout` still receives the final `pointerCurrentX/Y` values on mouseup

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: typecheck drag state helpers
    Tool:     bash
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; bun run check *> evidence/task-2-drag-state-check.txt
    Expected: Command exits 0 with no Svelte or TypeScript diagnostics
    Evidence: evidence/task-2-drag-state-check.txt

  Scenario: no source-wide model churn
    Tool:     bash
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; git diff -- src/lib/timeline/model.ts package.json bun.lock > evidence/task-2-no-model-churn.diff
    Expected: Diff is empty for model and dependency files unless the executor documents a concrete necessity
    Evidence: evidence/task-2-no-model-churn.diff
  ```

  Commit: YES | Message: `feat(timeline): derive drag preview state` | Files: [src/routes/+page.svelte]

- [ ] 3. Extend item bars with preview and drop-target hooks

  What to do: In `src/lib/timeline/TimelineItemBar.svelte`, add minimal props for preview active state, preview transform, and drop target state. Render `data-drag-preview="true|false"` and `data-drop-target="true|false"`, apply a transform that combines existing child scale with drag translation, and add focused styles for dragging and target affordance.
  Must NOT do: Do not change title truncation, completion toggle behavior, resize handle behavior, or child structural icon semantics.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [4] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/lib/timeline/TimelineItemBar.svelte:4` - component props are explicit and typed
  - Pattern:  `src/lib/timeline/TimelineItemBar.svelte:71` - root item element owns test ids and data attributes
  - Pattern:  `src/lib/timeline/TimelineItemBar.svelte:83` - inline style currently sets left, width, top, and min-height
  - Pattern:  `src/lib/timeline/TimelineItemBar.svelte:129` - absolute-positioned bar styles
  - Pattern:  `src/lib/timeline/TimelineItemBar.svelte:144` - child visual state currently uses `transform: scale(0.96)`
  - Test:     `e2e/timeline.e2e.ts:223` - expected `data-drag-preview="true"` during drag
  - Test:     `e2e/timeline.e2e.ts:250` - expected `data-drop-target="true"` on hovered parent

  Acceptance criteria (agent-executable only):
  - [ ] `bun run check` passes
  - [ ] Existing child scale remains visible for child rows when not dragging
  - [ ] Dragging transform does not break existing absolute left/width time placement after mouseup

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: item bar typecheck
    Tool:     bash
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; bun run check *> evidence/task-3-item-bar-check.txt
    Expected: Command exits 0 with no missing prop, style, or Svelte diagnostics
    Evidence: evidence/task-3-item-bar-check.txt

  Scenario: child visual state still exists
    Tool:     bash
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; bunx playwright test e2e/timeline.e2e.ts -g "child item icon is structural and parent row expands" *> evidence/task-3-child-visual-regression.txt
    Expected: Command exits 0 and confirms `data-visual-state="child"` behavior remains intact
    Evidence: evidence/task-3-child-visual-regression.txt
  ```

  Commit: YES | Message: `feat(timeline): render drag preview affordances` | Files: [src/lib/timeline/TimelineItemBar.svelte]

- [ ] 4. Wire preview/drop state through the timeline render

  What to do: Pass the derived drag preview and drop target props from `src/routes/+page.svelte` into each `TimelineItemBar`. Add `data-drop-state` to the timeline surface or track so tests can observe `parent`, `root`, and `none`. Keep panning class behavior unchanged.
  Must NOT do: Do not add nested cards, explanatory UI text, or new controls.

  Parallelization: Can parallel: NO | Wave 2 | Blocks: [5, 6, 7] | Blocked by: [1, 2, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/routes/+page.svelte:536` - surface element already owns app role, wheel, pan, click, and test id
  - Pattern:  `src/routes/+page.svelte:569` - track element owns `data-testid="timeline-track"` and dimensions
  - Pattern:  `src/routes/+page.svelte:576` - item rendering loop has item id and row index needed to mark active item/target
  - Pattern:  `src/routes/+page.svelte:585` - move/resize callbacks are already passed into the bar
  - Test:     `e2e/timeline.e2e.ts:213` - live preview bounding-box assertions
  - Test:     `e2e/timeline.e2e.ts:234` - live drop affordance assertions
  - External: `https://playwright.dev/docs/screenshots` - screenshots can be saved directly to evidence paths

  Acceptance criteria (agent-executable only):
  - [ ] `bunx playwright test e2e/timeline.e2e.ts -g "dragged item follows the pointer before drop|dragging shows parent and root drop affordances"` exits 0
  - [ ] During drag, the active item has `data-drag-preview="true"` and its bounding box moves right and down before mouseup
  - [ ] During parent hover, surface has `data-drop-state="parent"` and target item has `data-drop-target="true"`
  - [ ] During root hover, surface has `data-drop-state="root"` and prior parent target has `data-drop-target="false"`

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: pointer-follow and affordance specs pass
    Tool:     bash
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; bunx playwright test e2e/timeline.e2e.ts -g "dragged item follows the pointer before drop|dragging shows parent and root drop affordances" *> evidence/task-4-drag-preview-tests.txt
    Expected: Command exits 0 with both selected Playwright tests passing
    Evidence: evidence/task-4-drag-preview-tests.txt

  Scenario: visual evidence while dragging
    Tool:     playwright(real Chrome)
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; run a Playwright script that opens http://127.0.0.1:4173 after `bun run preview`, drags `timeline-item-focus` to `timeline-item-project`, pauses before mouseup, and saves `page.screenshot({ path: "evidence/task-4-drag-preview.png", fullPage: true })`
    Expected: Screenshot shows the focus item offset under the pointer and project row marked as the drop target
    Evidence: evidence/task-4-drag-preview.png
  ```

  Commit: YES | Message: `feat(timeline): wire drag preview into timeline` | Files: [src/routes/+page.svelte, src/lib/timeline/TimelineItemBar.svelte, e2e/timeline.e2e.ts]

- [ ] 5. Regression-test final drag semantics

  What to do: Run and, if needed, minimally adjust implementation so existing final drag semantics still pass: one-hour snap at six-hour visible scale, reorder/reparent, unparent onto empty root space, resize snapping, and click suppression after drag. If a regression appears, fix implementation rather than weakening assertions.
  Must NOT do: Do not remove or loosen the existing Playwright expectations.

  Parallelization: Can parallel: NO | Wave 2 | Blocks: [6, 7] | Blocked by: [2, 4]

  References (executor has NO interview context - be exhaustive):
  - Test:     `e2e/timeline.e2e.ts:48` - existing drag and resize snap behavior
  - Test:     `e2e/timeline.e2e.ts:195` - one-hour move snap at six-hour visible scale
  - Test:     `e2e/timeline.e2e.ts:258` - reorder and reparent behavior
  - Test:     `e2e/timeline.e2e.ts:292` - unparent behavior
  - Pattern:  `src/routes/+page.svelte:285` - stopDrag suppresses click-open and applies drop layout
  - Pattern:  `src/routes/+page.svelte:450` - pixels-to-time conversion depends on track width and visible range

  Acceptance criteria (agent-executable only):
  - [ ] Drag/resize snap, one-hour snap, reparent, and unparent tests pass together
  - [ ] Dragging an item and releasing does not open the editor popover
  - [ ] No implementation change introduces persistent preview offset after mouseup

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: final drag behavior regression suite
    Tool:     bash
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; bunx playwright test e2e/timeline.e2e.ts -g "dragging and resizing preview snapped positions|item drag uses one-hour snap|dragging vertically can reorder and reparent|dragging a child onto empty track" *> evidence/task-5-drag-regressions.txt
    Expected: Command exits 0 with all selected drag behavior tests passing
    Evidence: evidence/task-5-drag-regressions.txt

  Scenario: no editor opens after drag release
    Tool:     playwright(real Chrome)
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; drive `timeline-item-focus` 150px right and 80px down, release, then assert `page.getByTestId("editor-popover").count()` equals 0 and save screenshot to `evidence/task-5-no-editor-after-drag.png`
    Expected: Editor popover count is 0 after mouseup
    Evidence: evidence/task-5-no-editor-after-drag.png
  ```

  Commit: YES | Message: `fix(timeline): preserve drag drop semantics` | Files: [src/routes/+page.svelte, src/lib/timeline/TimelineItemBar.svelte, e2e/timeline.e2e.ts]

- [ ] 6. Capture full automated QA evidence

  What to do: Run the full check/test suite and capture targeted screenshots for the normal timeline, active drag preview, parent drop affordance, and root drop affordance. Use Playwright real Chromium/Chrome; if Chrome is unavailable, install/use the Playwright Chromium browser already managed by Playwright.
  Must NOT do: Do not rely on visual inspection alone; pair screenshots with assertions.

  Parallelization: Can parallel: NO | Wave 2 | Blocks: [7] | Blocked by: [1, 4, 5]

  References (executor has NO interview context - be exhaustive):
  - API/Type: `package.json:11` - `bun run check` command
  - API/Type: `package.json:14` - full test command combines unit and e2e
  - API/Type: `package.json:15` - e2e command installs Playwright then runs tests
  - API/Type: `playwright.config.ts:4` - preview server command for e2e
  - External: `https://playwright.dev/docs/api/class-testinfo` - screenshots and other files can be attached through `testInfo`
  - External: `https://playwright.dev/docs/screenshots` - page screenshots can be written to `evidence/`

  Acceptance criteria (agent-executable only):
  - [ ] `bun run check` exits 0
  - [ ] `bun run test` exits 0
  - [ ] Evidence files exist for command output and screenshots

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: full automated verification
    Tool:     bash
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; bun run check *> evidence/task-6-check.txt; bun run test *> evidence/task-6-test.txt
    Expected: Both commands exit 0; `task-6-test.txt` reports all Vitest and Playwright tests passing
    Evidence: evidence/task-6-check.txt, evidence/task-6-test.txt

  Scenario: screenshot evidence set
    Tool:     playwright(real Chrome)
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; run a Playwright evidence script that captures normal timeline, mid-drag preview, parent drop state, and root drop state screenshots to `evidence/task-6-normal.png`, `evidence/task-6-preview.png`, `evidence/task-6-parent-drop.png`, and `evidence/task-6-root-drop.png`
    Expected: All four PNG files exist and each screenshot has non-zero dimensions
    Evidence: evidence/task-6-normal.png, evidence/task-6-preview.png, evidence/task-6-parent-drop.png, evidence/task-6-root-drop.png
  ```

  Commit: YES | Message: `test(timeline): cover drag preview ux` | Files: [e2e/timeline.e2e.ts, evidence/task-6-check.txt, evidence/task-6-test.txt]

- [ ] 7. Prepare commit-ready final state

  What to do: Review diffs for surgical scope, confirm no unrelated files changed, and commit if the working directory is a Git repo. Based on exploration, `C:\Users\steve\Desktop\projects\timeline` did not report as a Git repo; if that remains true, copy the final diff/evidence summary into `evidence/task-7-final-state.txt` and do not fake a commit.
  Must NOT do: Do not initialize a Git repository or move files between `Documents\ProjectTimeline` and `Desktop\projects\timeline` without explicit caller instruction.

  Parallelization: Can parallel: NO | Wave 3 | Blocks: [] | Blocked by: [6]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `AGENTS.md:1` - target app has an empty local instructions file, so caller-provided instructions govern
  - API/Type: `package.json:6` - package scripts define valid project commands
  - Pattern:  `src/routes/+page.svelte:209` - drag start remains in page component
  - Pattern:  `src/lib/timeline/TimelineItemBar.svelte:71` - bar render remains the only item DOM surface

  Acceptance criteria (agent-executable only):
  - [ ] `git -C C:\Users\steve\Desktop\projects\timeline rev-parse --is-inside-work-tree` result is captured
  - [ ] If Git repo exists, commit includes only source/test/evidence files for this task and has the plan footer
  - [ ] If Git repo does not exist, no commit is attempted and final state evidence names changed files

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: repository state decision
    Tool:     bash
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; git rev-parse --is-inside-work-tree *> evidence/task-7-git-state.txt
    Expected: Output determines whether commit is possible; if exit is non-zero, executor records no-commit decision
    Evidence: evidence/task-7-git-state.txt

  Scenario: final diff scope
    Tool:     bash
    Steps:    cd C:\Users\steve\Desktop\projects\timeline; git diff -- src/routes/+page.svelte src/lib/timeline/TimelineItemBar.svelte e2e/timeline.e2e.ts > evidence/task-7-final-diff.patch
    Expected: Diff contains only drag-follow UX, drop affordance, and test/evidence changes
    Evidence: evidence/task-7-final-diff.patch
  ```

  Commit: YES | Message: `feat(timeline): make dragged items follow pointer` | Files: [src/routes/+page.svelte, src/lib/timeline/TimelineItemBar.svelte, e2e/timeline.e2e.ts, plans/drag-follow-ux.md]

## Final verification wave (MANDATORY - after all implementation tasks)
> Runs in PARALLEL. ALL must APPROVE. Surface results to the caller and wait for an explicit "okay" before declaring complete.
- [ ] F1. Plan compliance audit - every task done, every acceptance criterion met
- [ ] F2. Code quality review - diagnostics clean, idioms match, no dead code
- [ ] F3. Real manual QA - every QA scenario executed with evidence captured
- [ ] F4. Scope fidelity - nothing extra shipped beyond Must-Have, nothing Must-NOT-Have introduced

## Commit strategy
- One logical change per commit. Conventional Commits (`<type>(<scope>): <subject>` body + footer).
- Atomic: every commit builds and passes tests on its own.
- No "WIP" / "fix typo squash later" commits on the final branch - clean up before merge.
- Reference the plan file path in the final commit footer: `Plan: plans/drag-follow-ux.md`.

## Success criteria
- All Must-Have shipped; all QA scenarios pass with captured evidence; F1-F4 approved; commit history clean.
