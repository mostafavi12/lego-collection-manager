import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { deleteOwnedSet, getOwnedSet, updateOwnedSet } from "../api/client";
import type { OwnedSetDetailResponse } from "../api/types";
import { AsyncMessage } from "../components/AsyncMessage";
import { Modal } from "../components/Modal";
import { MissingLineEditor } from "../components/MissingLineEditor";

interface InstanceForm {
  label: string;
  notes: string;
  age: string;
  setNum: string;
  catalogName: string;
  catalogTheme: string;
  catalogParts: string;
  catalogYear: string;
}

function formFromDetail(detail: OwnedSetDetailResponse): InstanceForm {
  return {
    label: detail.label ?? detail.display_label,
    notes: detail.notes ?? "",
    age: detail.age != null ? String(detail.age) : "",
    setNum: detail.catalog.set_num,
    catalogName: detail.catalog.name ?? "",
    catalogTheme: detail.catalog.theme_name ?? "",
    catalogParts:
      detail.catalog.num_parts != null ? String(detail.catalog.num_parts) : "",
    catalogYear: detail.catalog.year != null ? String(detail.catalog.year) : "",
  };
}

export function OwnedSetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const ownedSetId = Number(id);
  const navigate = useNavigate();
  const [detail, setDetail] = useState<OwnedSetDetailResponse | null>(null);
  const [form, setForm] = useState<InstanceForm | null>(null);
  const [originalSetNum, setOriginalSetNum] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSetNumWarning, setShowSetNumWarning] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
      setForm(formFromDetail(data));
      setOriginalSetNum(data.catalog.set_num);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load set");
    } finally {
      setLoading(false);
    }
  }, [ownedSetId]);

  useEffect(() => {
    void load();
  }, [load]);

  function buildPatchBody(current: InstanceForm) {
    const ageTrimmed = current.age.trim();
    const partsTrimmed = current.catalogParts.trim();
    const yearTrimmed = current.catalogYear.trim();
    return {
      label: current.label.trim() || null,
      notes: current.notes.trim() || null,
      age: ageTrimmed === "" ? null : Number.parseInt(ageTrimmed, 10),
      set_num: current.setNum.trim(),
      catalog_name: current.catalogName.trim() || null,
      catalog_theme_name: current.catalogTheme.trim() || null,
      catalog_num_parts:
        partsTrimmed === "" ? null : Number.parseInt(partsTrimmed, 10),
      catalog_year: yearTrimmed === "" ? null : Number.parseInt(yearTrimmed, 10),
    };
  }

  async function saveForm(current: InstanceForm) {
    setSaving(true);
    setError(null);
    try {
      await updateOwnedSet(ownedSetId, buildPatchBody(current));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) {
      return;
    }
    if (form.setNum.trim() !== originalSetNum) {
      setShowSetNumWarning(true);
      return;
    }
    void saveForm(form);
  }

  async function confirmSetNumChange() {
    if (!form) {
      return;
    }
    setShowSetNumWarning(false);
    await saveForm(form);
  }

  function cancelSetNumChange() {
    if (!form) {
      return;
    }
    setForm({ ...form, setNum: originalSetNum });
    setShowSetNumWarning(false);
  }

  async function toggleInvestigated() {
    if (!detail) {
      return;
    }
    setSaving(true);
    try {
      await updateOwnedSet(detail.id, { investigated: !detail.investigated });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    setSaving(true);
    try {
      await deleteOwnedSet(ownedSetId);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  }

  if (loading && !detail) {
    return <AsyncMessage loading />;
  }

  if (!detail || !form) {
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
        <Link to="/">Collection</Link> / {detail.display_label} — {catalog.set_num}
      </p>

      <header className="detail-header">
        {catalog.image_url ? (
          <img src={catalog.image_url} alt="" className="detail-header__image" />
        ) : (
          <div className="detail-header__image detail-header__image--placeholder" />
        )}
        <div className="detail-header__body">
          <h1>
            {detail.display_label} — {catalog.set_num}
            {catalog.name ? ` (${catalog.name})` : ""}
          </h1>
        </div>
      </header>

      <AsyncMessage error={error} />

      <form className="instance-form" onSubmit={(e) => void onSubmit(e)}>
        <h2>Instance details</h2>
        <div className="instance-form__grid">
          <label className="form-field">
            Label
            <input
              value={form.label}
              disabled={saving}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </label>
          <label className="checkbox instance-form__checkbox">
            <input
              type="checkbox"
              checked={detail.investigated}
              disabled={saving}
              onChange={() => void toggleInvestigated()}
            />
            Investigated
          </label>
          <label className="form-field form-field--wide">
            Notes
            <textarea
              rows={2}
              value={form.notes}
              disabled={saving}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>

        <h2>Catalog</h2>
        <div className="instance-form__grid">
          <label className="form-field">
            Set number (this copy only)
            <input
              value={form.setNum}
              disabled={saving}
              onChange={(e) => setForm({ ...form, setNum: e.target.value })}
            />
          </label>
          <label className="form-field">
            Name
            <input
              value={form.catalogName}
              disabled={saving}
              onChange={(e) =>
                setForm({ ...form, catalogName: e.target.value })
              }
            />
          </label>
          <label className="form-field">
            Theme
            <input
              value={form.catalogTheme}
              disabled={saving}
              onChange={(e) =>
                setForm({ ...form, catalogTheme: e.target.value })
              }
            />
          </label>
          <label className="form-field">
            Age
            <input
              type="number"
              min={0}
              value={form.age}
              disabled={saving}
              onChange={(e) => setForm({ ...form, age: e.target.value })}
            />
          </label>
          <label className="form-field">
            Parts
            <input
              type="number"
              min={0}
              value={form.catalogParts}
              disabled={saving}
              onChange={(e) =>
                setForm({ ...form, catalogParts: e.target.value })
              }
            />
          </label>
          <label className="form-field">
            Year
            <input
              type="number"
              value={form.catalogYear}
              disabled={saving}
              onChange={(e) =>
                setForm({ ...form, catalogYear: e.target.value })
              }
            />
          </label>
        </div>

        <div className="instance-form__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            Save changes
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={saving}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete instance
          </button>
        </div>
      </form>

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

      {showSetNumWarning && (
        <Modal
          title="Change set number?"
          onClose={() => cancelSetNumChange()}
        >
          <p>
            You are about to change the LEGO set number for <strong>this copy
            only</strong> from {originalSetNum} to {form.setNum.trim()}. Other
            copies of {originalSetNum} are not affected. Missing-part marks on
            this instance will be cleared.
          </p>
          <div className="modal__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => cancelSetNumChange()}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={saving}
              onClick={() => void confirmSetNumChange()}
            >
              Continue
            </button>
          </div>
        </Modal>
      )}

      {showDeleteConfirm && (
        <Modal title="Delete this instance?" onClose={() => setShowDeleteConfirm(false)}>
          <p>
            This removes {detail.display_label} and its missing-part data.
            If it is the last copy of this catalog set, catalog and inventory data
            are removed too.
          </p>
          <div className="modal__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={saving}
              onClick={() => void onDelete()}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
