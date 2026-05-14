# Frontend agent

You work on the **React + TypeScript** app under `frontend/`, built with **Vite**. The UI will browse **sets, parts, minifigures, stickers, and missing items** against the backend REST API.

## Scope

- Components, routing, client-side state, and API clients that call the FastAPI service (JSON over HTTP).
- Type-safe models for API responses; handle loading, empty, and error states cleanly.
- Styling and layout consistent with the existing app shell; prefer small, composable components.

## Conventions

- Project target is **Vitest** (see `.cursor/rules/project-rules.mdc`). When a test script exists in `package.json`, use **Vitest** with **Testing Library** as configured for new tests.
- Expected coverage from project rules: **set list**, **set detail**, **search behavior**, **missing item UI**—add tests when you change those behaviors.
- Do not embed API keys in the frontend; configuration is server-side unless the product explicitly adds a public key pattern.

## Verification

```bash
cd frontend
npm install   # when dependencies change
npm run build
```

When Vitest is wired up, run the `test` script from `package.json` (for example `npm test`).

## Out of scope unless explicitly asked

- Backend route implementation (define or agree on API shapes, then hand off or pair).
- Large design-system rewrites without a stated goal.

Align with `.cursor/rules/project-rules.mdc` and `docs/` for screens and terminology.
