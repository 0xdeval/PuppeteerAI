# Maintainability-First Refactor and OSS Readiness Design

Date: 2026-05-11  
Status: Approved (conversation)  
Compatibility target: Keep endpoints; allow small behavior cleanup if documented

## 1. Goal and Scope

This project will be prepared for community publishing as an open source service focused on AI-driven automation for Facebook and X, with maintainability as the top priority.

Primary supported use cases:
1. Post personal posts on X using AI
2. Post replies for tweets using AI
3. Post personal posts on Facebook using AI
4. Post comments for a particular post on Facebook using AI
5. Parse posts of a particular Facebook profile

All currently shipped capabilities remain in scope, including Dolphin integration and multi-provider support.

## 2. Current Problems to Address

1. `server.js` centralizes route logic, orchestration, and response mapping, creating high change risk.
2. `/post`, `/reply`, and `/scrape` duplicate profile checks, rate-limit behavior, and browser error mapping.
3. Route-level logic directly handles low-level profile/cookie details in multiple places.
4. OSS contributor entry points are incomplete (contribution/security/process docs and templates).

## 3. Architecture (Option B: Boundary-First Refactor)

Target structure:

1. `src/http/routes/*`
   - Route registration only.
   - No business logic.
2. `src/http/handlers/*`
   - Parse requests and call services.
   - Convert domain/service outcomes into HTTP responses.
3. `src/http/middleware/*`
   - Auth and shared request middleware.
4. `src/services/automation-service.js`
   - Shared execution pipeline for `/post`, `/reply`, `/scrape`.
   - Centralizes profile readiness checks, rate-limit policy, browser run wrapper, and status normalization.
5. `src/services/profile-service.js`
   - Profile lifecycle and cookie-file related helper functions used by handlers.
6. Existing domains retained
   - `src/tasks/*` remains responsible for platform actions.
   - `src/ai/*` remains provider/vision layer.
   - `src/browser.js` and `src/dolphin.js` remain browser backend internals.

Boundary rule:
- Handlers do not perform browser orchestration.
- Services do not construct Express responses.

## 4. Shared Execution Flow Contract

For `/post`, `/reply`, and `/scrape`, use one service workflow:

1. Resolve and ensure profile (`platform + avatar -> profileId`).
2. Enforce readiness (`needs_login`/`login_expired` semantics preserved).
3. Apply rate limit policy:
   - Wait when retry window is short.
   - Return `429` for longer windows.
4. Execute browser job through one runner wrapper.
5. Normalize known browser exceptions:
   - `PROFILE_BUSY -> 429`
   - `BROWSER_TIMEOUT -> 504`
6. Normalize domain results:
   - Success statuses -> `200`
   - Relogin-required statuses -> `403` with `needs_relogin: true`
   - Unknown failures -> `500`

Compatibility note:
- Endpoints and core behavior are preserved.
- Minor response consistency cleanup is allowed and must be documented in README/API docs.

## 5. Redundancy Removal Plan

1. Replace repeated route blocks with service-level helpers for:
   - profile ensure/readiness checks
   - rate-limit handling
   - browser task wrapper
   - common status-to-response mapping inputs
2. Centralize cookie path/profile directory operations behind profile service helpers.
3. Remove unused imports/exports/helpers and stale comments.
4. Keep route files small and avoid cross-route copy-paste.

Non-goals:
- No feature removals.
- No framework migration.
- No large API redesign.

## 6. Testing and Verification Strategy

### API contract tests (behavior-level)
1. X post flow
2. X reply flow
3. Facebook post flow
4. Facebook comment/reply flow
5. Facebook profile scrape flow

### Service-level tests
1. Rate-limit wait vs reject behavior
2. Busy/timeout exception mapping
3. Relogin-required status mapping
4. Generic failure mapping

### Verification gates
1. Targeted tests for changed modules
2. Repository checks if configured (`lint`, `typecheck`, and other quality commands)
3. Manual smoke calls for key endpoints if automated coverage is incomplete

## 7. Open Source Readiness Deliverables

1. `README.md` refresh focused on:
   - clear project value proposition in opening section
   - concise feature/use-case list
   - quickstart with minimum required setup
   - architecture/workflow overview
   - API usage examples and limits
2. Add `CONTRIBUTING.md`:
   - local setup
   - coding/testing expectations
   - PR process
3. Add `SECURITY.md`:
   - vulnerability reporting process
   - secret handling expectations
4. Add issue and PR templates:
   - bug report
   - feature request
   - pull request checklist
5. Improve `.env.example` clarity with contributor-friendly comments.

README style target (based on referenced best-practice structure):
1. Strong top-level framing and quickstart near the top
2. Clear "how it works" section
3. Explicit contribution and community guidance
4. Practical, copy/paste-friendly setup snippets

## 8. Delivery Phases

1. **Phase A: Structural refactor**
   - Introduce route/handler/middleware/service boundaries.
   - Keep behavior equivalent.
2. **Phase B: Redundancy/dead-code cleanup**
   - Remove duplicated and unused code discovered during Phase A.
3. **Phase C: OSS docs/process surface**
   - README/CONTRIBUTING/SECURITY/templates/env docs.
4. **Phase D: Final verification**
   - Run verification commands/tests and document any known gaps.

## 9. Success Criteria

1. Core endpoints remain operational with documented compatibility-level adjustments.
2. `server.js` becomes a thin composition layer instead of a monolithic route host.
3. Shared logic duplication across post/reply/scrape routes is removed.
4. New contributors can set up and contribute using repository docs only.
5. Project README clearly communicates the five target use cases and operation model.

## 10. Risks and Mitigations

1. **Risk:** behavioral drift during extraction from `server.js`  
   **Mitigation:** contract tests before/after for key endpoints.
2. **Risk:** hidden coupling between route logic and profile/browser internals  
   **Mitigation:** extract in small slices and verify each route path incrementally.
3. **Risk:** docs drift from implementation  
   **Mitigation:** update API docs and README in same change set as refactor outputs.

