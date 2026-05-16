import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { listSetCopies, listSetCopyThemeOptions } from "../api/client";
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

function pageFromSearch(search: string): number {
  const value = Number(new URLSearchParams(search).get("page") ?? "1");
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function offsetForPage(page: number): number {
  return (page - 1) * PAGE_SIZE;
}

export function SetsListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<SetCopyListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [themeOptions, setThemeOptions] = useState<string[]>([]);
  const [offset, setOffset] = useState(() =>
    offsetForPage(pageFromSearch(location.search)),
  );
  const [filter, setFilter] = useState<InvestigatedFilter>("all");
  const [themeFilter, setThemeFilter] = useState("");
  const [sortBy, setSortBy] = useState<SetSortBy>("created");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [categorized, setCategorized] = useState(false);
  const [pageInput, setPageInput] = useState(() =>
    String(pageFromSearch(location.search)),
  );
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
    let ignore = false;
    async function loadThemeOptions() {
      try {
        const data = await listSetCopyThemeOptions();
        if (!ignore) {
          setThemeOptions(Array.isArray(data.themes) ? data.themes : []);
        }
      } catch {
        if (!ignore) {
          setThemeOptions([]);
        }
      }
    }
    void loadThemeOptions();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    setOffset(offsetForPage(pageFromSearch(location.search)));
  }, [location.search]);

  useEffect(() => {
    const state = location.state as { openAddSet?: boolean } | null;
    if (state?.openAddSet) {
      setAddSetOpen(true);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  useEffect(() => {
    if (total === 0) {
      return;
    }
    if (page > totalPages) {
      goToPage(totalPages, { replace: true });
    }
  }, [page, total, totalPages]);

  function goToPage(nextPage: number, options?: { replace?: boolean }) {
    if (!Number.isFinite(nextPage)) {
      return;
    }
    const clampedPage = Math.min(Math.max(nextPage, 1), totalPages);
    setOffset(offsetForPage(clampedPage));
    const search = new URLSearchParams(location.search);
    if (clampedPage === 1) {
      search.delete("page");
    } else {
      search.set("page", String(clampedPage));
    }
    const searchText = search.toString();
    navigate(
      {
        pathname: location.pathname,
        search: searchText ? `?${searchText}` : "",
      },
      { replace: options?.replace ?? false },
    );
  }

  function resetToFirstPage() {
    goToPage(1, { replace: true });
  }
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
              resetToFirstPage();
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
              resetToFirstPage();
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
              resetToFirstPage();
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
              resetToFirstPage();
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
          <div className="pagination__main">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={offset === 0 || loading}
              onClick={() => goToPage(page - 1)}
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
              onClick={() => goToPage(page + 1)}
            >
              Next
            </button>
          </div>
          {totalPages > 2 && (
            <div className="pagination__goto">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={loading}
                onClick={() => goToPage(Number(pageInput))}
              >
                Go to page #
              </button>
              <input
                type="number"
                value={pageInput}
                disabled={loading}
                aria-label="Page number"
                onChange={(e) => setPageInput(e.target.value)}
              />
            </div>
          )}
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
