# Clarity, engineered: website and workspace design

## Approved direction

The user approved the interactive design study on 2026-11-18 and requested its
implementation across AgentSpark. This is a presentation and public-positioning
change, not a workflow, permission, scoring or infrastructure redesign.

## Phases

- [x] Phase 1: shared ink/forest, ivory and lime tokens; original shared brand mark;
  dark/light appearance preserved across public pages, workspace and Chat.
- [x] Phase 2: product-first homepage, original evidence-to-decision illustration,
  ivory product-story section, editorial capability layouts, refined public-page
  templates, directories, trust content, footer and opt-in consulting surfaces.
- [x] Phase 3: complete frontend/backend/browser regression qualification and
  final desktop/mobile visual acceptance.

## Experience contract

- Home leads with "Clarity before commitment." and the enterprise AI decision
  workspace. Its primary link opens the existing public example assessment;
  discovery and assessment actions retain their protected, existing entry points.
- Consulting remains reachable through navigation, contextual links and the
  footer. Service pages explicitly identify a separately scoped engagement.
  Existing routes, scheduling consent, direct links and privacy behavior remain.
  No new consulting brand, domain or business/legal details are invented.
- The original vector illustration shows fictional source perspectives, a
  decision lens and a reviewable brief. No live integrations, measured savings,
  customer endorsements, autonomous actions or production results are implied.
- Product demonstrations remain manually controlled, keyboard-operable and
  explicitly fictional. The five existing stages, source inspection, readiness
  gaps and human-approval boundaries remain available.
- The illustration has a keyboard-operable pause/resume control. Reduced-motion
  preference disables decorative animation, including on preference changes.
  Static initial HTML remains readable without JavaScript; no content depends
  on scrolling or an animation completing before it can be read.
- All 24 public routes remain prerendered and linked, with route-specific
  metadata. The workspace stays a private, non-indexable client shell.
- Public and private components reuse semantic theme tokens. Chat removes its
  separate hardcoded violet palette; real generation progress remains intact.
- Existing self-hosted fonts are reused. No new dependency, remote imagery,
  tracking, video download, model call or infrastructure is introduced.

## Validation record

- Final frontend check passed: six dependency-security regressions, application
  and browser-test TypeScript checks, and production build. All 24 public routes
  prerender successfully. The existing workspace bundle-size warning remains;
  this is not a production performance benchmark.
- Backend check passed: 626 tests, the E2E scenario, scoring and portfolio
  evaluations, and dependency consistency.
- Initial targeted browser run: 26 passed; one strict mobile-boundary assertion
  exposed a transient 3D transform during viewport changes. Mobile now explicitly
  disables that hover transform and transition instead of relaxing the assertion.
- Existing tests are updated only for intentional copy, palette, layout and
  consulting-placement changes. Workflow, authorization, privacy, no-write,
  scheduler-consent, source-inspection and reduced-motion checks remain.
- The complete standard browser run executed 346 cases: 344 passed and two
  no-JavaScript cases exposed an outdated single-action locator. The test now
  verifies that both the hero and final discovery actions are disabled.
- Final affected-area qualification passed all 107 cases across Chromium and
  mobile Safari, including those two corrected cases, every public route's
  layout/contrast checks, motion, no-JavaScript navigation and the new hero
  regression. A visual check also caught a legacy diagram connector colour:
  pseudo-elements now use standalone selectors, rather than invalid branches
  inside `:is()`, with an explicit browser regression. Together the runs cover
  all 346 standard cases with passing results.
- The separate authenticated Discovery suite passed all 11 desktop/mobile cases,
  including drafts, reviewer permissions, workspace scoping and handoff
  provenance. Its initial invocation passed every case but failed teardown
  because of the temporary database filename; rerunning with the required
  isolated-archive prefix passed, including cleanup.
- Manual visual acceptance covered desktop/mobile Home, dark Chat and a
  representative public architecture page in both themes. The local demo
  preview is available at <http://127.0.0.1:8902/>; it does not call a live model.
- The feature is implemented on `feat/clarity-engineered-design`. Staging is
  unchanged; merge and deployment require separate approval.

## Product experience pilot

### Why a second iteration

User feedback identified that the first implementation retained too much of the
old page architecture. In particular, the Readiness page still led with a
text-heavy two-column hero, repeated method cards and lengthy explanatory blocks.
The user selected a working Home and Readiness pilot before another overall rollout.

The reference was Apple's product-led presentation, inspected directly at its
[MacBook Pro overview](https://www.apple.com/macbook-pro/) and
[product detail page](https://www.apple.com/macbook-pro/proled-xdr-display/).
The transferable principles are a strong visual focus, short benefit-led copy,
deliberate hierarchy and progressive disclosure. The pilot does not copy Apple's
assets, identity or page implementation, and is not a claim of equivalent
production, performance or accessibility qualification.

### Implemented scope

- [x] New page architecture on two explicitly opted-in preview URLs:
  `/?design=pilot` and `/consulting/readiness?design=pilot`.
- [x] A compact header, centred editorial hero and large, original product
  demonstration instead of the existing homepage illustration and capability
  grid. Three manually selected chapters show source perspectives, alternative
  approaches and a reviewable recommendation.
- [x] Inspectable source statements and selectable process/rules/AI alternatives.
  The controls change meaningful content, not merely decorative highlights.
  Source references and a full-example destination keep the reasoning inspectable.
- [x] A dark, full-width evidence chapter and a restrained unknowns section,
  replacing repeated feature-card sections. Real controls produce short,
  reduced-motion-aware scene transitions; there is no autoplay or scroll hijack.
- [x] A tangible, interactive Readiness brief showing an opportunity shortlist,
  readiness gaps and a bounded next step. The delivery method appears once as
  a simple timeline. Scope and scheduling details use native disclosures.
- [x] Separate advisory positioning, fixed scheduling destination and existing
  protected workspace/discovery/intake callbacks. The shared booking opener
  now explicitly receives focus before opening its dialog so Safari can restore
  focus correctly after dismissal.
- [x] Independent, scoped neutral theme variables and both appearance modes.
  No new fonts, packages, remote imagery, videos or Apple assets are introduced.
- [ ] User approval of this pilot.
- [ ] Any site-wide replacement, workspace redesign, merge or deployment.

### Isolation and limitations

`design=pilot` is recognised only on Home and Readiness. The original pages remain
available without the query, and each pilot footer links to the current design
for direct comparison. The preview navigation keeps the opt-in between its two
pages; other destinations still open the existing public pages.

This is a client-side visual pilot, not a replacement of the 24 prerendered public
documents. With JavaScript disabled, both URLs serve their existing, complete
public page rather than an empty preview. If approved for rollout, the selected
design must replace the actual route templates, metadata and prerender contracts
and undergo full release qualification; the query gate is not the final product.

All preview data is explicitly fictional and unverified. Exploring it performs
no analysis, workflow creation, approval, inference or external request. Actual
discovery and intake buttons still enter the existing protected application.
Nothing about the demo represents an already delivered customer engagement.

### Pilot qualification

- Frontend check passed: six dependency-security tests, application and browser
  TypeScript checks, production build and all 24 original public prerenders.
  The existing workspace chunk-size warning remains.
- **20 targeted browser cases passed**: 16 pilot cases across Chromium and mobile
  Safari, plus four existing consulting regressions. Coverage includes real
  keyboard interactions, sources and alternatives, gated entry points, no writes
  or unsolicited external calls, opt-in booking, Escape/focus restoration,
  preference changes and no-JavaScript fallback. In-page links use router-aware
  fragment navigation with target focus, avoiding the application's POP/blocker
  warning; this is also covered by a browser regression.
- Both pilot pages and every demo chapter passed actual-surface text contrast and
  viewport containment checks at 320, 390, 768 and 1440 pixels in light/dark modes,
  on both browser projects. The hero regression also measures a substantial
  product visual in the first desktop viewport rather than just checking colours.
- **89 original public-page/workspace appearance browser cases passed** separately,
  confirming unchanged static routes, metadata, no-JavaScript navigation, booking
  privacy, appearance persistence and assessment/blueprint readability.
- Initial pilot checks caught interference from the old generic `.landing`
  styles, an exact-text locator including a disclosure glyph, and Safari's
  pointer-focus behaviour. These were corrected before the passing runs; no
  contrast or viewport thresholds were relaxed.
- Manual visual review covered the two new desktop compositions, mobile
  Readiness and the mobile product comparison scene. Local preview health
  returned `ok`, demo mode, live inference off.
- No backend implementation or dependency manifest changed; the prior 626-test
  backend qualification was not rerun or represented as a fresh pilot result.
- Work is isolated on `feat/product-experience-design-pilot`. Staging is unchanged.
