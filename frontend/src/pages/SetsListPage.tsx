import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { listSetCopies } from "../api/client";
import type { SetCopyListItem } from "../api/types";
import { AsyncMessage } from "../components/AsyncMessage";
import { AddSetWizard } from "../components/AddSetWizard";
import { MakeACopyDialog } from "../components/MakeACopyDialog";
import { formatSetCopyTitle } from "../utils/setCopyTitle";

const PAGE_SIZE = 20;

type InvestigatedFilter = "all" | "true" | "false";
type SetSortBy = "created" | "set_num" | "name" | "theme" | "num_parts" | "age";
type SortDir = "asc" | "desc";

function formatMeta(item: SetCopyListItem): string {
  const theme = item.theme_name?.trim() || "Unknown theme";
  const parts = item.num_parts != null ? String(item.num_parts) : "?";
  const age = item.age != null ? String(item.age) : "?";
  return `${theme} · ${parts} parts · Age ${age}`;
}

export function SetsListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<SetCopyListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<InvestigatedFilter>("all");
  const [themeFilter, setThemeFilter] = useState("");
  const [sortBy, setSortBy] = useState<SetSortBy>("created");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [categorized, setCategorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyDialogId, setCopyDialogId] = useState<number | null>(null);
  const [addSetOpen, setAddSetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const investigated =
        filter === "all" ? undefined : filter === "true";
      const data = await listSetCopies({
        limit: PAGE_SIZE,
        offset,
        investigated,
        theme: themeFilter || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sets");
    } finally {
      setLoading(false);
    }
  }, [filter, offset, sortBy, sortDir, themeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const state = location.state as { openAddSet?: boolean } | null;
    if (state?.openAddSet) {
      setAddSetOpen(true);
      navigate("/", { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const themeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((item) => item.theme_name?.trim())
            .filter((theme): theme is string => Boolean(theme)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const groupedItems = useMemo(() => {
    const byTheme = new Map<string, Map<string, SetCopyListItem[]>>();
    for (const item of items) {
      const theme = item.theme_name?.trim() || "Unknown theme";
      const age = item.age != null ? `Age ${item.age}` : "Age unknown";
      const ageMap = byTheme.get(theme) ?? new Map<string, SetCopyListItem[]>();
      const bucket = ageMap.get(age) ?? [];
      bucket.push(item);
      ageMap.set(age, bucket);
      byTheme.set(theme, ageMap);
    }
    return Array.from(byTheme.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  function renderSetCard(item: SetCopyListItem) {
    return (
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
              {formatSetCopyTitle(item.set_num, item.name, item.display_label)}
            </h2>
            <p className="set-card__meta">{formatMeta(item)}</p>
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
            </div>
          </div>
        </Link>
        <button
          type="button"
          className="btn btn--secondary set-card__duplicate"
          onClick={() => setCopyDialogId(item.id)}
        >
          Make a copy
        </button>
      </li>
    );
  }

  return (
    <section className="page">
      <header className="page__header">
        <h1>Your sets</h1>
        <p className="page__lede">
          {total} copy{total === 1 ? "" : "ies"} in your collection (each LEGO set
          number may appear multiple times).
        </p>
      </header>

      <div className="toolbar">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setAddSetOpen(true)}
        >
          Add set
        </button>
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
        <label className="toolbar__field">
          Theme
          <select
            value={themeFilter}
            onChange={(e) => {
              setOffset(0);
              setThemeFilter(e.target.value);
            }}
          >
            <option value="">All themes</option>
            {themeOptions.map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar__field">
          Sort by
          <select
            value={sortBy}
            onChange={(e) => {
              setOffset(0);
              setSortBy(e.target.value as SetSortBy);
            }}
          >
            <option value="created">Added order</option>
            <option value="set_num">Set number</option>
            <option value="name">Set name</option>
            <option value="theme">Theme</option>
            <option value="num_parts">Number of parts</option>
            <option value="age">Age</option>
          </select>
        </label>
        <label className="toolbar__field">
          Direction
          <select
            value={sortDir}
            onChange={(e) => {
              setOffset(0);
              setSortDir(e.target.value as SortDir);
            }}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={categorized}
            onChange={(e) => setCategorized(e.target.checked)}
          />
          Group by theme and age
        </label>
      </div>

      <AsyncMessage error={error} loading={loading && items.length === 0} />

      {!loading && items.length === 0 && !error && (
        <p className="empty-state">
          Nothing in your collection yet.{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => setAddSetOpen(true)}
          >
            Add a set manually
          </button>{" "}
          or <Link to="/import">import a CSV</Link> to get started.
        </p>
      )}

      {categorized ? (
        <div className="set-categories" aria-label="Sets grouped by theme and age">
          {groupedItems.map(([theme, ageMap]) => (
            <section key={theme} className="set-category">
              <h2>{theme}</h2>
              {Array.from(ageMap.entries()).map(([age, bucket]) => (
                <section key={`${theme}-${age}`} className="set-category__age">
                  <h3>{age}</h3>
                  <ul className="set-list">{bucket.map(renderSetCard)}</ul>
                </section>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <ul className="set-list" aria-label="Sets in collection">
          {items.map(renderSetCard)}
        </ul>
      )}

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

      {addSetOpen && (
        <AddSetWizard
          onClose={() => setAddSetOpen(false)}
          onCreated={(newId) => {
            setAddSetOpen(false);
            navigate(`/sets/${newId}`);
          }}
        />
      )}

      {copyDialogId != null && (
        <MakeACopyDialog
          setCopyId={copyDialogId}
          onClose={() => setCopyDialogId(null)}
          onCreated={(newId) => navigate(`/sets/${newId}`)}
        />
      )}
    </section>
  );
}
