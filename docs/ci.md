# Continuous integration

GitHub Actions runs on **every push** and **every pull request** (all branches). It verifies:

| Check | Command (same as CI) | Working directory |
|-------|----------------------|-------------------|
| Backend tests | `pip install -r requirements-dev.txt` then `pytest` | `backend/` |
| Frontend production build | `npm ci` then `npm run build` | `frontend/` |

The backend job installs from [`backend/requirements-dev.txt`](../backend/requirements-dev.txt) so CI does not need a **PEP 517** editable build (`hatchling`); `pytest` still resolves the `app` package via [`backend/pyproject.toml`](../backend/pyproject.toml) (`tool.pytest.ini_options.pythonpath = ["."]`). For local development, `pip install -e ".[dev]"` from the root README remains the preferred path when it works.

## Workflow file

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — defines the jobs above.

The workflow runs **two parallel jobs** (`backend`, `frontend`). Either failing fails the workflow run for that commit.

## Local parity

Before pushing, you can mirror CI from the repository root:

```bash
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt && pytest
```

```bash
cd frontend && npm ci && npm run build
```

The backend install matches the README **fallback** (`requirements-dev.txt`); use `pip install -e ".[dev]"` locally when you want editable installs and packaging checks.

## Secrets and network

- **No API keys** are required for these jobs. Tests must not call live external APIs (see [`.cursor/rules/project-rules.mdc`](../.cursor/rules/project-rules.mdc) and [`testing-strategy.md`](./testing-strategy.md)).
- The frontend build does not need `VITE_API_BASE_URL` unless the Vite config treats it as required at build time; if that changes, document any required `env:` entries in the workflow and here.

## Optional: branch protection

In the GitHub repository **Settings → Branches**, you can require the **CI** workflow (or the individual job names) to pass before merging. Exact UI labels depend on GitHub’s current checks API.

## Related documents

- [README.md](./README.md) — index of all specification files in `docs/`
- [testing-strategy.md](./testing-strategy.md)
- [development-plan.md](./development-plan.md)
