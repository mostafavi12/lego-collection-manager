# Specification index — LEGO Collection Manager

This folder holds the **authoritative product and technical contracts** for the MVP: requirements, API shapes, schema, data sources, delivery plan, and testing approach.

| Document | Role |
|----------|------|
| [product-requirements.md](./product-requirements.md) | Problem, user, scope, acceptance criteria, glossary |
| [api-design.md](./api-design.md) | REST JSON routes, payloads, errors, pagination |
| [database-schema.md](./database-schema.md) | SQLite tables, keys, indexes, invariants |
| [data-sources.md](./data-sources.md) | CSV format, Rebrickable usage, mapping and provenance |
| [development-plan.md](./development-plan.md) | Phased delivery from skeleton to hardening |
| [testing-strategy.md](./testing-strategy.md) | pytest / Vitest expectations, fixtures, no live APIs |
| [ci.md](./ci.md) | GitHub Actions: push/PR checks (backend tests, frontend build) |

Repository-wide **engineering defaults** (preferred stack, “no live API in tests”, etc.) live in [`.cursor/rules/project-rules.mdc`](../.cursor/rules/project-rules.mdc).

Cursor **agent briefs** under [`.cursor/agents/`](../.cursor/agents/) describe *contributor roles* (what to optimize for, where to look first). They **link** here; they do **not** replace these specifications.
