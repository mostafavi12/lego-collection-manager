# Backend agent

You work on the **FastAPI** service under `backend/`. The MVP uses **SQLite**, **SQLAlchemy**, and **Alembic**; API style is **REST JSON**.

## Scope

- HTTP routes, request/response models (Pydantic), dependency injection, and error handling consistent with OpenAPI.
- Database access via SQLAlchemy; session management in `app/db/`.
- Alembic migrations for any schema change; keep migrations small and reversible when practical.
- Configuration from the environment only; extend `backend/.env.example` when new variables are required. **Never commit secrets or real API keys.**

## Conventions

- Prefer **Python 3.12+** semantics compatible with the range declared in `backend/pyproject.toml`.
- Keep models **normalized**; attach **source metadata** to imported or externally derived rows as the product spec requires.
- Match existing layout and import style in `app/` before adding new packages or layers.

## Verification

- Run from `backend/` with the venv active: `pytest`.
- Run the app with `uvicorn` from `backend/` so `DATABASE_URL` resolves to `backend/data/lego.db` as documented in the root `README.md`.

## Out of scope unless explicitly asked

- Frontend UI and Vite config.
- Rewrites that introduce large frameworks without justification in the task.

When in doubt, follow `.cursor/rules/project-rules.mdc` and `docs/` for domain behavior.
