import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  duplicateOwnedSet,
  getOwnedSet,
  updateOwnedSet,
} from "../api/client";
import type { OwnedSetDetailResponse } from "../api/types";
import { AsyncMessage } from "../components/AsyncMessage";
import { MissingLineEditor } from "../components/MissingLineEditor";

export function OwnedSetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const ownedSetId = Number(id);
  const navigate = useNavigate();
  const [detail, setDetail] = useState<OwnedSetDetailResponse | null>(null);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(ownedSetId)) {
      setError("Invalid set id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getOwnedSet(ownedSetId);
      setDetail(data);
      setLabel(data.label ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load set");
    } finally {
      setLoading(false);
    }
  }, [ownedSetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleInvestigated() {
    if (!detail) {
      return;
    }
    setSaving(true);
    try {
      await updateOwnedSet(detail.id, {
        investigated: !detail.investigated,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveLabel() {
    if (!detail) {
      return;
    }
    setSaving(true);
    try {
      await updateOwnedSet(detail.id, {
        label: label.trim() === "" ? null : label.trim(),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDuplicate() {
    if (!detail) {
      return;
    }
    setSaving(true);
    try {
      const created = await duplicateOwnedSet(detail.id);
      navigate(`/sets/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duplicate failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !detail) {
    return <AsyncMessage loading />;
  }

  if (!detail) {
    return (
      <section className="page">
        <AsyncMessage error={error ?? "Set not found"} />
        <Link to="/">Back to collection</Link>
      </section>
    );
  }

  const { catalog, inventory } = detail;

  return (
    <section className="page page--detail">
      <p className="breadcrumb">
        <Link to="/">Collection</Link> / {catalog.set_num}
      </p>

      <header className="detail-header">
        {catalog.image_url ? (
          <img
            src={catalog.image_url}
            alt=""
            className="detail-header__image"
          />
        ) : (
          <div className="detail-header__image detail-header__image--placeholder" />
        )}
        <div className="detail-header__body">
          <h1>
            {catalog.set_num}
            {catalog.name ? ` — ${catalog.name}` : ""}
          </h1>
          <p className="detail-header__meta">
            {catalog.year ?? "—"} · {catalog.theme_name ?? "Unknown"} ·{" "}
            {catalog.num_parts ?? "?"} parts · Instance #{detail.id}
          </p>
          <div className="detail-header__actions">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={detail.investigated}
                disabled={saving}
                onChange={() => void toggleInvestigated()}
              />
              Investigated
            </label>
            <div className="detail-header__label">
              <input
                type="text"
                value={label}
                placeholder="Label (e.g. eBay May 2026)"
                disabled={saving}
                onChange={(e) => setLabel(e.target.value)}
              />
              <button
                type="button"
                className="btn btn--secondary"
                disabled={saving}
                onClick={() => void saveLabel()}
              >
                Save label
              </button>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              disabled={saving}
              onClick={() => void onDuplicate()}
            >
              Add another copy
            </button>
          </div>
        </div>
      </header>

      <AsyncMessage error={error} />

      <section className="inventory-section">
        <h2>Parts inventory</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Color</th>
                <th>Qty</th>
                <th>Flags</th>
                <th>Missing</th>
              </tr>
            </thead>
            <tbody>
              {inventory.set_parts.map((line) => (
                <tr key={line.line_id}>
                  <td>
                    <div className="part-cell">
                      {line.image_url && (
                        <img src={line.image_url} alt="" className="part-cell__img" />
                      )}
                      <span>
                        <strong>{line.part_num}</strong>
                        {line.part_name ? ` — ${line.part_name}` : ""}
                      </span>
                    </div>
                  </td>
                  <td>{line.color_name}</td>
                  <td>{line.quantity}</td>
                  <td>
                    {line.is_spare && <span className="tag">spare</span>}
                    {line.is_alternate && <span className="tag">alt</span>}
                  </td>
                  <td>
                    <MissingLineEditor
                      ownedSetId={detail.id}
                      line={line}
                      lineRef={{ kind: "set", lineId: line.line_id }}
                      onUpdated={() => void load()}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {inventory.minifigs.length > 0 && (
        <section className="inventory-section">
          <h2>Minifigures</h2>
          {inventory.minifigs.map((mf) => (
            <article key={mf.line_id} className="minifig-block">
              <h3>
                {mf.minifig_num}
                {mf.name ? ` — ${mf.name}` : ""} ×{mf.quantity}
              </h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Color</th>
                      <th>Qty</th>
                      <th>Missing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mf.parts.map((line) => (
                      <tr key={line.line_id}>
                        <td>
                          <strong>{line.part_num}</strong>
                          {line.part_name ? ` — ${line.part_name}` : ""}
                        </td>
                        <td>{line.color_name}</td>
                        <td>{line.quantity}</td>
                        <td>
                          <MissingLineEditor
                            ownedSetId={detail.id}
                            line={line}
                            lineRef={{
                              kind: "minifig",
                              lineId: line.line_id,
                            }}
                            onUpdated={() => void load()}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
