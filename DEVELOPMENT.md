# DEVELOPMENT — 개발 지식 & 방법론 상세 기록

이 문서는 Timeline 앱을 "사용 가능한 기본 수준"에서 "판매 가능한 프리미엄 수준"으로 끌어올린 작업 전 과정을, **문제 → 근본 원인 → 해결**과 **사용한 개발 방법론**으로 매우 상세히 단위별로 기록한 것입니다. 같은 코드베이스를 이어받는 사람이 "왜 이렇게 되어 있는지"를 추론 없이 이해할 수 있게 하는 것이 목표입니다.

> 표기: 코드/식별자/명령은 영어 그대로, 설명은 한국어로 적습니다.

---

## 0. 출발점 (Starting State)

작업을 시작했을 때의 사실관계:

- **스택**: SvelteKit 2 + Svelte 5(runes), TypeScript, Vite 8, Bun, Vitest, Playwright. React/Tailwind 없음.
- **구조**: `src/routes/+page.svelte`(앱 본체, ~841줄), `src/lib/timeline/model.ts`(순수 도메인 로직), `TimelineItemBar.svelte`, `IconPicker.svelte`, `model.spec.ts`(단위 테스트), `e2e/timeline.e2e.ts`(E2E 18~19개).
- **상태**: `plans/`에 작업 계획 3개, `.omo`/`.omc`에 에이전트 상태, `evidence/`에 디버그 산출물, `.debug-journal.md`에 과거 디버깅 기록이 이미 존재. 계획서 체크박스와 실제 코드가 **불일치**(drag-follow 플랜은 전부 미체크인데 코드·E2E엔 이미 구현됨).
- **디자인**: 기능은 동작하지만 "깔끔하나 기본적/유틸리티 수준". `plans/DESIGN.md`에 Vercel 기반 프리미엄 디자인 시스템 명세가 이미 있었음 → 이걸 북극성(north star)으로 채택.

### 방법론 원칙 (전 과정에서 일관 적용)

1. **추측 금지, 도구로 검증(grounding).** 계획서 체크박스를 믿지 않고 항상 `bun run check` / `test:unit` / `test:e2e`를 실제 실행해 현재 상태를 확정.
2. **증거 기반 디버깅(evidence-based).** 버그는 추론으로 단정하지 않고 계측(instrumentation)으로 재현해 근본 원인을 눈으로 확인한 뒤 고침.
3. **테스트를 계약으로.** 기존 E2E/단위 테스트가 인코딩한 동작은 보존. 동작을 **의도적으로** 바꿀 때만 테스트를 함께 갱신(약화/삭제로 통과시키지 않음).
4. **TDD 친화 + 순수 함수 우선.** 시간 계산 로직은 DOM 없는 순수 함수로 `model.ts`에 두고 Vitest로 고정.
5. **병렬 검증.** 파일 편집 후 `check`·`unit`·`e2e`를 돌려 회귀를 즉시 포착.

---

## 1. 베이스라인 확정 (계획서를 믿지 말 것)

**방법:** 계획서·디버그 저널·evidence 로그를 읽되, 최종 판단은 직접 실행으로.

- evidence의 `final-*.txt`는 **UTF-16**이라 일반 read로 안 열려서 PowerShell `Get-Content`로 읽음.
- 직접 실행 결과: `check` 0 errors, 단위 12개 통과, **E2E 2개 실패**.

발견한 모순: 계획서 `drag-follow-ux.md`는 전 항목 미체크인데 코드와 E2E에는 `data-drag-preview` / `data-drop-state` 등 drag-follow 기능이 이미 들어가 있었음. → "계획서 ≠ 실제"를 확인하고, **실제 코드 기준**으로 진행하기로 결정.

---

## 2. 핵심 버그: "아이템 클릭 시 편집 대신 새 아이템 생성"

가장 먼저 잡아야 했던, 실제 사용성을 망가뜨리는 회귀.

### 2.1 증상

두 개의 E2E가 실패:

- `only one editor opens and outside click closes it` — 둘째 아이템 클릭 후 `editor-title` 값이 빈 문자열.
- `editing keeps hierarchy and completion metadata` — child를 편집 후 저장했는데 원본 `child` 대신 **새 id `item-...`** 가 생성됨(편집이 아니라 추가가 일어남).

### 2.2 진단 방법 (계측으로 재현)

추론만으로는 "왜 add가 실행되는지" 확정이 안 돼서, 다음을 **임시로** 넣고 단발 디버그 스펙을 작성해 콘솔을 캡처:

```ts
// openEditor 진입부
console.error("OPEN_EDITOR", mode, anchorId, "suppress=" + suppressNextOpen)
// handleSurfaceClick 내부
console.error("SURFACE_CLICK hasItem=" + hasItem, "targetTag=" + ...)
```

그리고 `page.evaluate`로 클릭 지점의 `getBoundingClientRect` + `document.elementFromPoint`를 찍는 PROBE를 추가.

**관측 결과:**

```
PROBE = { rect:{w:194,h:131}, center hit: BUTTON.resize-handle (grandchild-a),
          transform: scale(0.96) }
SURFACE_CLICK hasItem=false targetTag=DIV.track
OPEN_EDITOR add undefined
```

즉:
1. child "Outline" 바의 박스가 **194×131px**. `min-height: rowSpan*48-8`로 그려서 **자식 행들까지 물리적으로 덮는 overlap** 상태.
2. 클릭이 item이 아니라 `.track`에 떨어져서 item의 edit 핸들러가 **아예 호출되지 않고** surface의 add가 대신 실행됨.

### 2.3 더 깊은 근본 원인 (두 겹)

추가 계측으로 진짜 원인이 **두 개**임을 확인:

- **(A) 겹침 레이아웃** — 부모 바가 `min-height`로 자식 행을 덮어 히트테스트가 모호.
- **(B) 드래그 중 `pointer-events:none`의 순간 적용** — 결정적 원인. `isDragging`이 `dragState.kind === "move"`로 계산되는데, 이 `dragState`는 **단순 클릭의 mousedown에서도** set됨. 그래서 click 시퀀스(mousedown→mouseup→click) 동안 바에 `.dragging { pointer-events: none }`가 잠깐 걸리고, 그 타이밍에 `click`의 타깃이 **아래의 track**으로 새어버림 → surface의 add가 edit를 덮어씀.

### 2.4 해결

두 원인을 모두 제거:

- **(B) 수정 — 가장 중요.** 드래그 상태를 "실제로 움직였을 때(`moved`)"만 활성화:
  ```ts
  // before
  const activeMoveDrag = $derived(dragState?.kind === "move" ? dragState : undefined)
  // after
  const activeMoveDrag = $derived(dragState?.kind === "move" && dragState.moved ? dragState : undefined)
  ```
  이로써 단순 클릭은 절대 `.dragging`/`pointer-events:none` 상태가 되지 않음. 드래그 프리뷰·드롭 감지도 자연스럽게 "실제 이동 후"에만 동작(올바른 동작).

- **(A) 수정 — 레이아웃 모델 변경.** 겹치는 컨테이너 대신 **한 행 = 한 아이템(Gantt 스타일)** 으로 재구성해 히트테스트를 명확화. `TimelineItemBar`의 클릭 핸들러에 `event.stopPropagation()`을 추가해 surface add가 item edit를 덮지 못하게 함.

- 추가로 `model.ts`에 순수 함수 `computeDepths()`를 도입해 들여쓰기/중첩 깊이를 계산(단위 테스트로 고정).

> 참고: 2.5 단계에서 사용자의 요청으로 (A)의 "한 행" 결정 중 **부모 높이 확장**은 다시 살아납니다(아래 9장). 핵심은 **(B)가 진짜 원인**이었고, (B)를 고친 덕분에 겹침이 있어도 클릭이 안전해졌다는 점입니다.

---

## 3. 디자인 시스템 정립 (Vercel 기반)

**방법:** `plans/DESIGN.md`(Vercel 분석)를 토큰으로 코드화.

- `src/app.css` 신설 — 색(canvas/ink/body/hairline…), 브랜드 메시 그라데이션, radius, spacing(4px 베이스), **스택 섀도우**(여러 작은 오프셋 + inset hairline), 타이포 변수, 모션 토큰(ease-out/spring, dur-1/2/3), 그리고 `prefers-reduced-motion` 전역 가드.
- `src/app.html` — 웹폰트 link(처음 Inter+JetBrains Mono, 이후 9.2에서 Pretendard로 교체).
- `+layout.svelte`에서 `import "../app.css"`.

원칙: 마케팅 페이지가 아니라 **도구(tool)** 이므로 디자인 "언어"(타이포·색·섀도우·간격·mono 라벨·은은한 그라데이션 액센트)만 차용하고 레이아웃은 생산성 도구에 맞게 적용.

---

## 4. 컴포넌트 재작성

### 4.1 `TimelineItemBar.svelte`

- **한 행 높이**로 변경(겹침 제거). 모든 테스트 훅 보존: `data-testid`, `data-start-label/-end-label/-row-span/-drag-preview/-drop-target/-visual-state/-parent-id`, `child-structural-icon-{id}`(텍스트 `->`), `child-leading-icon-{id}`, `completion-overlay-{id}`(`data-left-percent`/`data-width-percent`), `resize-{id}`, `complete-{id}`, `item-title-{id}`.
- 프리미엄 스타일: top sheen `::before`, 호버 리프트, child용 색 `color-mix` + 중첩 rail `::after` + depth 들여쓰기.
- 완료 토글은 "C" 텍스트 → **체크 SVG**로 교체(테스트가 텍스트를 검사하지 않음을 확인 후).
- 시간 범위 라벨은 호버 시 페이드 인.

### 4.2 `TimelineNowLine.svelte` (신설)

- 현재 시각을 view 범위 대비 left%로 환산, 30초마다 갱신, 범위 밖이면 숨김.
- `pointer-events: none` — **드롭 감지(`elementFromPoint`)를 방해하지 않도록** 필수.

### 4.3 `+page.svelte`

- depth/통계 derived 추가, 줌 버튼(±)·Today·now-line·빈 상태·컬러 프리셋·Enter 저장.
- 마크업/스타일 전면 프리미엄화(브랜드/툴바/축/팝오버).

---

## 5. 애니메이션과 테스트 안정성의 충돌 (중요한 교훈)

프리미엄을 위해 애니메이션을 넣자 **E2E가 깨짐**. 이유와 해결을 정확히 기록:

### 5.1 `scale` 이름 충돌

`import { scale } from "svelte/transition"`가 `let scale = $state<TickScale>("6h")`(틱 스케일 상태)와 충돌 → `Identifier 'scale' has already been declared`.
**해결:** `import { scale as scaleIn }`로 별칭, 마크업도 `transition:scaleIn`.

### 5.2 `top` 트랜지션이 boundingBox 테스트를 깨뜨림

재정렬을 부드럽게 하려 `transition: top`을 넣었더니, `dragging vertically can reorder` 테스트가 **mouseup 직후 boundingBox를 즉시 읽는데** 그 순간 바들이 `top` 애니메이션 중간값이라 focus.y와 child.y가 **같게** 측정됨. 같은 이유로 unparent 드래그의 시작점도 애니메이션 중이라 빗나감.
**해결:** 위치 애니메이션(`top`)과 진입/이탈 트랜지션은 **포기**. 대신 호버/드래그-추종/섀도우/팝오버/완료/스와치 등 **측정에 영향 없는** 애니메이션만 유지. 드래그 중에는 transform 트랜지션도 끔(`.item.dragging`은 transition 없음 → 포인터를 지연 없이 추종).

**교훈:** Playwright는 boundingBox를 즉시(retry 없이) 읽으므로, **요소의 위치/크기를 애니메이션하면 측정 기반 테스트가 깨진다.** 위치 애니메이션은 피하고, 색/그림자/투명도/스케일 등 비측정 속성만 애니메이션한다.

### 5.3 shell 하단 패딩 4px

`track fills the viewport` 테스트가 surface 하단이 뷰포트-32px 이내여야 하는데 36px 패딩으로 4px 모자람(684 < 688).
**해결:** shell 하단 패딩 36→22px.

---

## 6. 빈 상태 재시드(re-seed) 버그

`loadItems()`가 저장값이 `"[]"`(빈 배열)일 때 `createInitialItems()`로 **재시드**하던 로직 → 사용자가 모두 지워도 데모가 다시 생기고, **빈 상태 UI에 도달 불가**.
**해결:** `stored === null`(최초 실행)일 때만 시드, 유효한 배열이면 빈 배열이라도 그대로 존중(`return loaded`). E2E는 `removeItem`(=null)을 쓰므로 시드 동작 유지 → 회귀 없음.

부수: 빈 상태 UI("No time-boxes yet" + 그라데이션 아트 + 힌트) 추가, 날짜 라벨을 한국어 고정에서 `Intl.DateTimeFormat`(로케일) 포맷으로 변경.

---

## 7. 생산성/마감 기능

- 키보드: `N` 추가(입력 중·모디파이어 시 무시), `Enter` 저장(`textarea` 예외), `Esc` 닫기.
- 줌 버튼(±), Today 점프, 추가 버튼 `title="Add item (N)"`.
- 브랜드 favicon을 Svelte 기본 로고 → 그라데이션 타임라인 마크 SVG로 교체.

---

## 8. 휠/터치패드 가로 스크롤 (의도적 동작 변경 + 테스트 갱신)

**요청:** "휠로 가로 스크롤. 드래그 스크롤은 짜증난다."

**충돌:** 기존 E2E `plain wheel zooms without requiring modifier keys`는 **평범한 휠 = 줌**을 요구. 사용자의 새 요구와 정면 충돌.

**결정:** 사용자(최신 지시) 우선. 표준 패턴 채택 — **평범한 휠/트랙패드 = 가로 패닝, `Ctrl/⌘ + 휠` = 줌.**

```ts
function handleWheel(event: WheelEvent): void {
  if (event.ctrlKey || event.metaKey) {           // 줌
    if (event.deltaY === 0) return
    event.preventDefault()
    scale = event.deltaY < 0 ? zoomIn(scale) : zoomOut(scale)
    return
  }
  const delta = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (delta === 0) return
  event.preventDefault()                            // 가로 패닝 (px→time 1:1)
  const panMs = pixelsToMilliseconds(delta)
  viewStart = new Date(viewStart.getTime() + panMs)
  viewEnd = new Date(viewEnd.getTime() + panMs)
}
```

**테스트 갱신(약화 아님, 의도 인코딩):** `plain wheel zooms...` → `plain wheel pans the timeline horizontally without zooming`(스케일 불변 + 틱 x 이동 확인)으로 재작성하고, 줌 보장은 `ctrl wheel still zooms the scale`로 분리. 드래그 패닝/줌 버튼은 그대로 유지.

> `preventDefault`가 먹는 이유: wheel 리스너는 일반 엘리먼트에서 기본 non-passive라 가능. (document/window였다면 passive 기본이라 막혔을 것.)

---

## 9. 후속 요청들

### 9.1 부모 = 컨테이너(자식 높이만큼 세로 확장)

**요청:** 드래그로 부모-자식이 되면 부모 바를 자식 높이만큼 키워 감싸달라.

**판단:** 이는 2.2의 "겹침"으로 보이지만, 2.3에서 밝혔듯 클릭 버그의 **진짜 원인은 (B) pointer-events**였고 이미 고쳤음. 따라서 부모 높이 확장을 **안전하게** 되살릴 수 있음. 자식은 부모보다 DOM 뒤에 렌더 → 페인트 순서상 위에 얹힘 → 자식 클릭은 자식이, 부모는 헤더 행에서 클릭됨.

**구현:**
- 바 높이를 `rowSpan * rowHeight - barInset`로(부모는 서브트리 행 수만큼 키움), `--row-h`(헤더 한 행 높이) CSS 변수 도입.
- `.item-content` 높이를 `var(--row-h)`로 **헤더 행에 고정**(긴 부모에서 제목이 가운데로 가지 않게).
- 완료 토글 위치 `top: calc(var(--row-h)/2)`로 헤더 중앙 고정.
- `class:is-parent`(rowSpan>1) 추가.
- 드롭 감지는 기존 로직이 이미 부모의 **헤더 행으로 히트영역을 제한**(`pointerY > rowTopPx + rowHeight`면 무시)하므로 그대로 동작.

검증: 부모 "Launch plan"이 4행 높이 컨테이너로, 그 안에 "Outline"(또 손자 2개를 감싸는 컨테이너)이 중첩되어 보이고, 클릭/드래그/E2E 전부 정상.

### 9.2 로고/부제목 제거 + 한글 폰트 Pretendard Variable

- 상단 brand-mark(그라데이션 사각형)와 tagline 제거, `h1 "Timeline"`만 유지(관련 CSS도 정리).
- 웹폰트를 Pretendard Variable로 교체: `app.html`에 jsDelivr CDN(`pretendardvariable.min.css`) 추가, `--font-sans`를 `"Pretendard Variable", Pretendard, system-ui, …`로. 시계/숫자 라벨용 mono(JetBrains Mono)는 유지.

---

## 10. 검증 전략 (Definition of Done)

매 변경마다 그리고 최종에 모두 green을 확인:

- `bun run check` → 0 errors / 0 warnings
- `bun run test:unit -- --run` → 13 passed (`computeDepths` 테스트 추가 포함)
- `bun run test:e2e` → 전 항목 passed (휠 동작 변경분 반영)
- `bun run build` → 성공
- **브라우저 시각 QA** — 임시 Playwright 스펙으로 default/editor/empty/iconpicker/parent-container 스크린샷을 캡처해 육안 검수 후 반복(임시 스펙·산출물은 정리). 큐레이션한 결과는 `docs/images/`.

이미지 기반 검수에서 본 실제 결함과 수정:
- IconPicker가 토큰 미적용 → 디자인 시스템에 맞게 재작성(포커스 링/그림자/스프링 pop/호버 스케일).
- 빈 상태가 실제로 비어 보이는지 확인(6장 수정의 시각 확인).

---

## 11. 알려진 한계 (정직하게)

- **터치 드래그 미지원** — 마우스 이벤트 기반(데스크톱 도구 v1 기준).
- **좁은 아이템 라벨 클리핑** — 6h 줌에서 1h짜리 아이템은 폭이 좁아 제목이 가려질 수 있음(시간 정확도 유지를 위한 의도적 트레이드오프).
- **`+page.svelte`가 큼** — 단일 컴포넌트 LOC가 큼(드래그/줌/에디터/영속화가 한 곳). 순수 로직을 `model.ts`로, now-line을 별도 컴포넌트로 빼며 줄였으나, 추가 분해(에디터 컴포넌트 추출 등) 여지가 있음. 테스트 보존을 위해 보수적으로 유지.

---

## 12. 한 줄 요약 (재현 가능한 교훈)

- 버그는 **계측으로 재현해 근본 원인을 본 뒤** 고친다. (클릭 버그의 진짜 원인은 겹침이 아니라 `pointer-events` 순간 적용이었다.)
- **Playwright boundingBox 테스트가 있으면 요소의 위치/크기를 애니메이션하지 않는다.**
- 동작을 의도적으로 바꿀 땐 **테스트도 그 의도로 갱신**하되, 통과를 위해 약화/삭제하지 않는다.
- 순수 시간 로직은 DOM과 분리해 단위 테스트로 고정한다.
- 디자인은 토큰화하고, 마케팅 명세라도 "도구"에 맞게 언어만 차용한다.

---

# Part II — 2차 이터레이션 (배포 이후 기능 고도화)

깃 배포(`stevenahhh/timeline`) 이후 들어온 후속 요구를 같은 방법론(문제→근본원인→해결, 테스트=계약)으로 처리한 기록.

## 13. 줌 모델 전면 재설계: 라벨만 바뀌던 줌 → 실제 간트 크기 변화

**문제(요구):** "Ctrl+휠로 실제 간트 형태의 크기를 줄여/키워. 단위는 1시간이 기본이되, 좁아지면 2h·3h 등 동적으로."

**기존 한계:** `scale: 6h|3h|1h` 이산 상태가 **틱 라벨 밀도만** 바꿀 뿐, 보이는 시간 범위(viewStart~viewEnd)는 24h 고정이라 바 크기가 안 변했음.

**해결 — 범위 기반(연속) 줌:**
- `scale` 상태 제거. **`viewEnd - viewStart`(범위)가 곧 줌 레벨**. 줌인=범위 축소(바 커짐), 줌아웃=범위 확대(바 작아짐).
- `zoomBy(factor, anchorClientX)` 추가: **커서 위치(시간)를 고정점으로** 범위를 스케일(포인터 앵커 줌). `Ctrl+휠`은 `Math.exp(deltaY*0.0015)` 배율로 부드럽게.
- 클램프: 최소 2h, 최대 96h.
- **동적 틱**(`model.ts`에 순수 함수 추가):
  - `niceTickHours(rangeHours, trackWidthPx, minLabelPx=64)` — `[1,2,3,6,12,24]` 중 라벨이 64px 이상 확보되는 **가장 조밀한** 간격을 선택. 줌인하면 1h, 좁아지면 2h→3h→6h…
  - `generateHourTicks(start, end, intervalHours)` — 임의 시 간격으로 시계 정렬 틱 생성. 기존 `generateTicks(scale)`는 이걸 위임하도록 리팩터(기존 단위 테스트 유지).
  - 단위 테스트 추가: `niceTickHours`(24h/1200px→2h, 12h→1h, 96h→6h, 0 입력 방어), `generateHourTicks`(2h 간격 라벨).
- `scale-label`는 `tickHours` 기반(`"1 hour"`/`"N hours"`)으로 표시.

**테스트 갱신(의도 인코딩):** 이산 스케일을 검증하던 `ctrl+wheel ... one-hour scale`/`plain wheel zooms`/`ctrl wheel ... 3 hours` 3개를 새 모델로 재작성. 특히 줌 검증은 라벨 대신 **바의 실제 폭 증가**(`focus.boundingBox().width`)로 바꿔 사용자 의도("간트 크기 변화")를 직접 측정.

## 14. 휠 동작 재설계 + 헤더 sticky

**문제:** 처음엔 "휠=가로 스크롤"을 원했지만, 곧 "아이템이 많아지면 세로 스크롤도 필요"를 인지.

**해결 — 적응형 휠(`handleWheel`):**
- `Ctrl/⌘+휠` → 줌.
- 가로 의도(`Shift+휠` 또는 `|deltaX|>|deltaY|` 트랙패드) → 가로 패닝(`preventDefault`).
- 세로 휠 → **행이 넘치면 네이티브 세로 스크롤(preventDefault 안 함)**, 안 넘치면 가로 패닝으로 재활용.
- `.timeline`을 `overflow-y:auto`로, `.date-axis`/`.axis`를 **`position:sticky`**로 고정. 한 스크롤 컨테이너 안에 헤더+트랙이 같이 있어 `clientWidth`(스크롤바 제외)를 공유 → **틱과 바의 정렬 불일치 없음**.

## 15. 상단 정리 + Now

- scale `±` 버튼 제거(줌은 Ctrl+휠로 일원화), `scale-pill`은 읽기 전용 표시로 유지(테스트가 `scale-label` 참조).
- `Today`(그날 0시로 점프) → **`Now`**(현재 시각을 화면 **중앙**에 두도록 `jumpToNow`, 현재 범위 유지).

## 16. 사이드바 + 달력 히트맵

**요구:** Add item 옆 버튼으로 열고 닫는, 타임라인과 같은 디자인의 **리사이즈 가능한** 사이드바. 안에는 지난 아이템을 빨리 찾는 **달력**(날짜 원형 배경을, 그 달 기준 아이템 수에 비례해 진하게; 클릭 시 그 날짜로 이동).

**해결:**
- 레이아웃: `topbar` 아래를 `.workspace`(flex row)로 묶어 `timeline`(flex:1) + `aside.sidebar`(가변 폭) 배치. 사이드바는 타임라인과 동일 토큰(`--r-lg`, `--shadow-3`, canvas).
- 토글: Add item 옆 아이콘 버튼(`panel-toggle`) → `sidebarOpen`. `transition:slide(axis x)`로 열림/닫힘.
- 리사이즈: 좌측 엣지 핸들 `mousedown`→문서 리스너로 `sidebarWidth` 갱신(240~560px 클램프). 컴포넌트 파괴 시 리스너 정리(onDestroy).
- **`TimelineCalendar.svelte`**(신규): 6주×7일 그리드, 각 셀은 그 날과 겹치는 아이템 수 집계. **그 달 내 최대값으로 정규화**해 `intensity = 0.18 + 0.82*(count/max)` 알파의 보라색 원(`rgba(109,74,255,intensity)`). 오늘/선택일 강조, 월 이동, 날짜 클릭 → `jumpToDate`.
- 부가: 선택일 아이템 목록(색 점+제목+시각), 클릭 시 편집.

## 17. 기본 36시간 + now-line 가시성/추종 (테스트 결정성과의 균형)

**요구:** 기본 스케일 ~36h, 열면 now-line이 보이고 시간 따라 추종.

**핵심 판단(왜 "now 중앙 고정"이 아니라 "[자정, +36h]"인가):**
뷰를 매번 "현재 시각 중앙"으로 열면 실행 시각에 따라 고정 시드 아이템(예: 18–21시 long)이 화면 밖으로 나가 **E2E가 시간대 의존으로 불안정**해짐. 반면 시드는 라벨 단언(`"12:00"` 등) 때문에 **고정 시계시각**이어야 함. 두 제약을 동시에 만족하는 유일 해는 **뷰를 자정 기준 36h(`[startOfDay, +36h]`)** 로 두는 것 — 0~24시 아이템이 항상 0~36h 안에 들어오고, now(0~24시)도 항상 보임. 결정적이며 now-line도 보장 표시.

- `defaultRangeMs = 36*hourMs`. now-line은 `TimelineNowLine`이 주기적으로 위치 갱신(추종). `Now` 버튼은 중앙 정렬.

**이 변경이 깬 것과 해결:**
- **중복 틱 testid:** 범위>24h면 `tick-12:00`이 12시/36시 두 번 → strict-mode 충돌. → 해당 테스트들에 `.first()` 부여.
- **드래그 환산 상수:** `width*(6/24)` → `/36` (뷰 폭 변경 반영).
- **빈 트랙 클릭 테스트:** 중앙(=18시)엔 long 아이템이 있어 add가 안 됨 → 아이템 없는 우측 빈 영역(34/36→다음날 10시) 클릭으로 변경.
- **포인터 앵커 줌:** 중앙이 18시라 줌인 후 11시가 화면 밖 → 검증 틱을 18시 부근 홀수시(`tick-17:00`)로 교체.

## 18. 좁은 바에서 제목이 사라진 버그 (time-range 레이아웃 squeeze)

**증상:** 36h로 바뀌자 `editing keeps hierarchy` 테스트에서 편집된 child 제목이 **hidden**. 단, `item-title-child`는 제자리 편집됨(새 아이템 아님)=로직은 정상.

**근본 원인:** 내가 4장에서 추가한 호버용 `.time-range`가 `opacity:0`이어도 **flex 레이아웃 폭을 점유**. 36h에서 child 바 폭이 135px로 좁아지자 `구조아이콘+gap+time-range(≈50px)`가 콘텐츠 폭을 초과 → 제목이 0px로 밀려 `toBeVisible`이 hidden 판정.

**해결:** `.time-range`를 기본 `display:none`으로(레이아웃 미점유), 호버 시에만 `display:inline-block`. 비호버(기본) 상태에서 제목이 전체 폭 확보 → 가시. 교훈: **투명도로 숨긴 요소도 레이아웃 폭을 먹는다 — 좁은 컨테이너에서는 `display:none`/absolute로 빼라.**

## 19. 성능 최적화

- 틱 렌더의 `computeItemPosition({...items[0], ...})` 핵(아이템 스프레드, 빈 배열 시 위험) 제거 → 순수 `viewLeftPercent(at)` 직접 계산.
- 트랙 그리드 라인을 틱과 **동일 위치로 동적 렌더**(정적 25% 배경 그라데이션 제거) → 줌/패닝과 항상 정렬.
- 드래그 중 바에 `will-change: transform`(GPU 합성), 드래그 중 transform 트랜지션 비활성(포인터 지연 0).
- `overscroll-behavior: contain`으로 스크롤 체이닝 차단.

## 20. 폰트 전체 통일/강제 (Pretendard Variable)

- JetBrains Mono 제거, `--font-mono`를 `var(--font-sans)`로 묶어 **시간/숫자 포함 전체를 Pretendard Variable**로. `body`에 `font-variant-numeric: tabular-nums`로 숫자 정렬, `button/input/select/textarea`에 폰트 강제 상속.

## 21. 2차 이터레이션 검증 결과

모든 게이트 green 유지: `check` 0/0, 단위 **15** passed(`niceTickHours`·`generateHourTicks` 추가), e2e **20** passed, `build` 성공. 사이드바/달력/36h/now-line은 실제 브라우저 스크린샷으로 시각 확인(`docs/images/hero.png`, `sidebar.png`).
