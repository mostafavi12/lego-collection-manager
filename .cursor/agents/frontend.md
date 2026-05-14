# Frontend agent

You build the **React + TypeScript** app under `frontend/` with **Vite**. Screens and JSON contracts are defined in **`docs/`**; this file is only role guidance.

## Authoritative docs

- [`docs/README.md`](../../docs/README.md) — index of specifications.
- [`docs/product-requirements.md`](../../docs/product-requirements.md) — UX surfaces, MVP scope, glossary.
- [`docs/api-design.md`](../../docs/api-design.md) — request/response shapes, pagination, search and missing payloads.
- [`docs/development-plan.md`](../../docs/development-plan.md) — Phase 7 UI deliverables and exit criteria.
- [`docs/testing-strategy.md`](../../docs/testing-strategy.md) — Vitest + Testing Library expectations once configured.

Repo-wide defaults: [`.cursor/rules/project-rules.mdc`](../rules/project-rules.mdc).

## Scope

- Components, routing, state, and API clients against the FastAPI base URL from env (see root `README.md`).
- Loading, empty, and error states; accessible, consistent layout with the existing shell.

## Conventions

- Add **Vitest** + **Testing Library** tests when `frontend/package.json` defines a `test` script; until then, keep components testable and match `docs/testing-strategy.md` areas (owned sets list, set detail, search, missing UI).
- Do not embed API keys in the client.

## Verification

```bash
cd frontend
npm install   # when dependencies change
npm run build
```

When a test script exists, run it (e.g. `npm test`).

## Out of scope unless explicitly asked

- Implementing backend routes (update `docs/api-design.md` first if the contract changes, then coordinate).
