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
