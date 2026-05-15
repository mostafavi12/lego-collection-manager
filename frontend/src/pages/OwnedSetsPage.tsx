import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { duplicateOwnedSet, listOwnedSets } from "../api/client";
import type { OwnedSetListItem } from "../api/types";
import { AsyncMessage } from "../components/AsyncMessage";

const PAGE_SIZE = 20;

type InvestigatedFilter = "all" | "true" | "false";

function instanceLabel(item: OwnedSetListItem): string {
  if (item.label) {
    return item.label;
  }
  return `Copy #${item.id}`;
}

export function OwnedSetsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<OwnedSetListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<InvestigatedFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const investigated =
        filter === "all" ? undefined : filter === "true";
      const data = await listOwnedSets({
        limit: PAGE_SIZE,
        offset,
        investigated,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sets");
    } finally {
      setLoading(false);
    }
  }, [filter, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDuplicate(id: number) {
    setActionId(id);
    setError(null);
    try {
      const created = await duplicateOwnedSet(id);
      navigate(`/sets/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duplicate failed");
    } finally {
      setActionId(null);
    }
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="page">
      <header className="page__header">
        <h1>Owned sets</h1>
        <p className="page__lede">{total} instance{total === 1 ? "" : "s"} in your collection</p>
      </header>

      <div className="toolbar">
        <label className="toolbar__field">
          Investigation
          <select
            value={filter}
            onChange={(e) => {
              setOffset(0);
              setFilter(e.target.value as InvestigatedFilter);
            }}
          >
            <option value="all">All</option>
            <option value="false">Not investigated</option>
            <option value="true">Investigated</option>
          </select>
        </label>
      </div>

      <AsyncMessage error={error} loading={loading && items.length === 0} />

      {!loading && items.length === 0 && !error && (
        <p className="empty-state">
          No owned sets yet.{" "}
          <Link to="/import">Import a CSV</Link> to get started.
        </p>
      )}

      <ul className="set-list" aria-label="Owned sets">
        {items.map((item) => (
          <li key={item.id} className="set-card">
            <Link to={`/sets/${item.id}`} className="set-card__main">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt=""
                  className="set-card__image"
                />
              ) : (
                <div className="set-card__image set-card__image--placeholder" />
              )}
              <div className="set-card__body">
                <h2 className="set-card__title">
                  {item.set_num}
                  {item.name ? ` — ${item.name}` : ""}
                </h2>
                <p className="set-card__meta">
                  {item.year ?? "—"} · {item.theme_name ?? "Unknown theme"} ·{" "}
                  {instanceLabel(item)}
                </p>
                <div className="set-card__badges">
                  <span
                    className={
                      item.investigated
                        ? "badge badge--ok"
                        : "badge badge--pending"
                    }
                  >
                    {item.investigated ? "Investigated" : "Not investigated"}
                  </span>
                  {item.missing_count > 0 && (
                    <span className="badge badge--warn">
                      {item.missing_count} missing
                    </span>
                  )}
                  <span className="badge badge--muted">
                    Sync: {item.catalog_sync_state}
                  </span>
                </div>
              </div>
            </Link>
            <button
              type="button"
              className="btn btn--secondary set-card__duplicate"
              disabled={actionId === item.id}
              onClick={() => void onDuplicate(item.id)}
            >
              Add copy
            </button>
          </li>
        ))}
      </ul>

      {total > PAGE_SIZE && (
        <div className="pagination">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
