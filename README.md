# LEGO Collection Manager

Local-first LEGO collection manager (MVP in progress). This repository contains a **FastAPI** backend, a **React + Vite** frontend, and product documentation under `docs/`.

## Prerequisites

- **Python 3.10+** (installable range in `backend/pyproject.toml`). **Python 3.12+** is the target in [`.cursor/rules/project-rules.mdc`](.cursor/rules/project-rules.mdc); use 3.12 when you can.
- **Node.js** 20+ and npm (for the frontend)

## Backend

From the repository root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

If `pip install -e ".[dev]"` fails (for example, build tooling issues), install dependencies directly:

```bash
pip install -r requirements-dev.txt
```

Then:

```bash
cp .env.example .env        # optional; defaults match .env.example
mkdir -p data
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **Health check:** [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health) returns `{"status":"ok"}`.
- **API docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) (OpenAPI).

**CSV import** (`POST /api/imports/csv`) is implemented. Rebrickable sync, owned-set browse APIs, missing parts, search, and the collection UI are not implemented yet.

Configuration is read from the environment (see [`backend/.env.example`](backend/.env.example)). The default `DATABASE_URL` points at `sqlite:///./data/lego.db` relative to the **current working directory**; run Alembic and uvicorn from `backend/` so the database file is created at `backend/data/lego.db`.

### Tests

```bash
cd backend
source .venv/bin/activate
pytest
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Then open the URL printed by Vite (typically [http://127.0.0.1:5173](http://127.0.0.1:5173)).

```bash
npm run build   # production build
```

## Continuous integration

On **GitHub**, every **push** and **pull request** runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml): backend **`pytest`** and frontend **`npm ci`** + **`npm run build`**. Details and local parity commands are in [`docs/ci.md`](docs/ci.md).

For a broader local check (install, tests, migration, API probe, frontend build), run from the repository root:

```bash
./scripts/smoke.sh
```

See [`docs/smoke-test.md`](docs/smoke-test.md).

## Sample data

Example owned set numbers for CSV import experiments live in [`data/sample_sets.csv`](data/sample_sets.csv).

## Documentation

Product and technical specs are in [`docs/`](docs/). Use [`docs/README.md`](docs/README.md) as an index of each specification file.

During development, use the [**smoke** agent](.cursor/agents/smoke.md) or `./scripts/smoke.sh` for a quick health check. Before committing or opening a PR, use the [**pre-submit** agent](.cursor/agents/pre-submit.md) for doc consistency and CI/acceptance review.
