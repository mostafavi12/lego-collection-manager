import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getIncompleteSetsReport, mediaUrl } from "../api/client";
import type { IncompleteSetReportItem } from "../api/types";
import { AsyncMessage } from "../components/AsyncMessage";
import { formatSetCopyTitle } from "../utils/setCopyTitle";

const PAGE_SIZE = 50;

function formatElementIds(elementIds: string[]): string {
  return elementIds.length > 0 ? elementIds.join(", ") : "No Element ID";
}

export function IncompleteSetsReportPage() {
  const [items, setItems] = useState<IncompleteSetReportItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getIncompleteSetsReport({
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setItems(data.items);
      setTotal(data.total);
      setOffset(nextOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function goToPage(nextPage: number) {
    const nextOffset = (nextPage - 1) * PAGE_SIZE;
    void load(nextOffset);
  }

  return (
    <section className="page">
      <header className="page__header">
        <p className="page__breadcrumb">
          <Link to="/reports">Reports</Link>
        </p>
        <h1>Incomplete sets</h1>
        <p className="page__lede">
          Set copies with at least one missing part. Expand a row to see missing
          lines for that copy.
        </p>
      </header>

      <AsyncMessage error={error} loading={loading && items.length === 0} />

      {!loading && items.length === 0 && !error && (
        <p className="empty-state">No incomplete sets in your collection.</p>
      )}

      {items.length > 0 && (
        <div className="incomplete-sets" aria-label="Incomplete sets">
          {items.map((item) => (
            <details key={item.id} className="incomplete-sets__item">
              <summary className="incomplete-sets__summary">
                <span className="incomplete-sets__title">
                  <Link to={`/sets/${item.id}`} onClick={(e) => e.stopPropagation()}>
                    {formatSetCopyTitle(item.set_num, item.name, item.display_label)}
                  </Link>
                </span>
                <span className="incomplete-sets__meta">
                  {item.missing_line_count} line
                  {item.missing_line_count === 1 ? "" : "s"},{" "}
                  {item.missing_parts_total} missing part
                  {item.missing_parts_total === 1 ? "" : "s"}
                  {!item.investigated && " · Not investigated"}
                </span>
              </summary>
              <div className="incomplete-sets__body">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th scope="col">Image</th>
                      <th scope="col">Part</th>
                      <th scope="col">Color</th>
                      <th scope="col">Element ID</th>
                      <th scope="col">Missing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.missing_lines.map((line) => (
                      <tr
                        key={`${line.part_id}-${line.color_id}-${line.part_num}`}
                      >
                        <td>
                          {line.part_image_url ? (
                            <img
                              className="inventory-table__thumb"
                              src={mediaUrl(line.part_image_url) ?? undefined}
                              alt=""
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <span className="inventory-table__part-num">
                            {line.part_num}
                          </span>
                          {line.part_name && (
                            <span className="inventory-table__part-name">
                              {line.part_name}
                            </span>
                          )}
                        </td>
                        <td>{line.color_name ?? line.color_id}</td>
                        <td>{formatElementIds(line.element_ids)}</td>
                        <td>{line.quantity_missing}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
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
              Page {page} of {pageCount}
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
        </div>
      )}
    </section>
  );
}
