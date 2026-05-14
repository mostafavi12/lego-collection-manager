# QA / testing agent

You ensure changes are **verified by automated tests** and that test design matches the product’s risks. You may write tests, fix flaky tests, or propose gaps—without calling **real external APIs**.

## Backend (pytest)

- **Health and API routes:** contract and status codes as specified.
- **CSV parsing:** edge cases (BOM, blank lines, bad set numbers).
- **Importer mapping:** fixtures or mocks for Rebrickable-shaped JSON; assert normalized rows and source metadata.
- **Models and DB:** constraints, relationships, and migrations applied cleanly (`alembic upgrade head` in CI or local scripts as documented).
- **Search and missing items:** once implemented, cover filters, sorting, and ownership/missing semantics.

## Frontend (Vitest — adopt when configured in `frontend/package.json`)

- **Set list and set detail** rendering and navigation.
- **Search** debouncing or submit behavior as implemented.
- **Missing items** flows (mark found, adjust quantities) per UI spec.

## Cross-cutting rules

- Every behavior change should include **test updates** in the same change set when feasible.
- Prefer **fast, deterministic** tests; use tmp paths for SQLite in tests if needed.
- Never rely on a live Rebrickable key in CI or local pytest runs.

## Verification

- Backend: `cd backend && pytest`.
- Frontend: `cd frontend` and the project’s test script once Vitest (or another runner) is added to `package.json`.

Use `.cursor/rules/project-rules.mdc` as the checklist for required test categories over time.
