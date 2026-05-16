import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  deleteSetCopy,
  getSetCopy,
  mediaUrl,
  syncRebrickable,
  updateSetCopy,
} from "../api/client";
import type {
  MinifigPartLineDetail,
  RebrickableSyncResponse,
  SetCopyDetailResponse,
  SetPartLineDetail,
} from "../api/types";
import { AsyncMessage } from "../components/AsyncMessage";
import { Modal } from "../components/Modal";
import { CatalogSetImageEditor } from "../components/CatalogSetImageEditor";
import { InstanceQuantityEditor } from "../components/InstanceQuantityEditor";
import { MissingLineEditor } from "../components/MissingLineEditor";
import {
  PartLineModal,
  type PartLineModalSaveResult,
} from "../components/PartLineModal";
import { formatSetCopyTitle } from "../utils/setCopyTitle";

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

type PartInventorySort = "element_id" | "part_num" | "missing";
type PartImageDownloadMode = "none" | "missing" | "all";

function formatElementIds(elementIds: string[]): string {
  return elementIds.length > 0 ? elementIds.join(", ") : "No Element ID";
}

function formFromDetail(detail: SetCopyDetailResponse): InstanceForm {
  return {
    label: detail.label ?? detail.display_label,
    notes: detail.notes ?? "",
    age: detail.age != null ? String(detail.age) : "",
  setNum: String(detail.catalog.set_num),
    catalogName: detail.catalog.name ?? "",
    catalogTheme: detail.catalog.theme_name ?? "",
    catalogParts:
      detail.catalog.num_parts != null ? String(detail.catalog.num_parts) : "",
    catalogYear: detail.catalog.year != null ? String(detail.catalog.year) : "",
  };
}

function withRefreshToken(url: string | null, token: number): string | null {
  if (!url || token === 0 || !url.startsWith("/api/")) {
    return url;
  }
  return `${url}${url.includes("?") ? "&" : "?"}v=${token}`;
}

export function SetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const setCopyId = Number(id);
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SetCopyDetailResponse | null>(null);
  const [form, setForm] = useState<InstanceForm | null>(null);
  const [originalSetNum, setOriginalSetNum] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<RebrickableSyncResponse | null>(null);
  const [syncDownloadSetImages, setSyncDownloadSetImages] = useState(true);
  const [syncPartImageDownloadMode, setSyncPartImageDownloadMode] =
    useState<PartImageDownloadMode>("none");
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [imageRefreshToken, setImageRefreshToken] = useState(0);
  const [partSort, setPartSort] = useState<PartInventorySort>("element_id");
  const [showSetNumWarning, setShowSetNumWarning] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [partModal, setPartModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; inventoryKind: "set_part"; line: SetPartLineDetail }
    | { mode: "edit"; inventoryKind: "minifig_part"; line: MinifigPartLineDetail }
    | null
  >(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(setCopyId)) {
      setError("Invalid set id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getSetCopy(setCopyId);
      setDetail(data);
      setForm(formFromDetail(data));
      setOriginalSetNum(String(data.catalog.set_num));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load set");
    } finally {
      setLoading(false);
    }
  }, [setCopyId]);

  function onPartModalSaved(result?: PartLineModalSaveResult) {
    if (result?.imageChanged) {
      setImageRefreshToken(Date.now());
    }
    void load();
  }

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
      await updateSetCopy(setCopyId, buildPatchBody(current));
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
      await updateSetCopy(detail.id, { investigated: !detail.investigated });
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
      await deleteSetCopy(setCopyId);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  }

  async function onSyncThisSet() {
    if (!detail) {
      return;
    }
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const result = await syncRebrickable([detail.id], {
        download_set_images: syncDownloadSetImages,
        part_image_download_mode: syncPartImageDownloadMode,
      });
      setSyncResult(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
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
  const pageTitle = formatSetCopyTitle(
    catalog.set_num,
    catalog.name,
    detail.display_label,
  );
  const visibleSetParts = [...inventory.set_parts]
    .filter((line) => !showMissingOnly || line.missing_quantity > 0)
    .sort((a, b) => {
      if (partSort === "missing") {
        return (
          b.missing_quantity - a.missing_quantity ||
          formatElementIds(a.element_ids).localeCompare(formatElementIds(b.element_ids), undefined, { numeric: true })
        );
      }
      if (partSort === "part_num") {
        return a.part_num.localeCompare(b.part_num, undefined, { numeric: true });
      }
      return formatElementIds(a.element_ids).localeCompare(formatElementIds(b.element_ids), undefined, { numeric: true });
    });

  return (
    <section className="page page--detail">
      <p className="breadcrumb">
        <Link to="/">Collection</Link> / {pageTitle}
      </p>

      <header className="detail-header">
        <CatalogSetImageEditor
          catalogSetId={catalog.catalog_set_id}
          imageUrl={catalog.image_url}
          setNum={catalog.set_num}
          onUpdated={() => void load()}
        />
        <div className="detail-header__body">
          <h1>{pageTitle}</h1>
        </div>
      </header>

      <AsyncMessage error={error} />

      <details className="sync-panel">
        <summary>
          <h2>Sync from Rebrickable</h2>
        </summary>
        <p className="form-hint">
          Refresh shared catalog and inventory data for this set copy’s catalog set.
        </p>
        <div className="sync-panel__controls">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={syncDownloadSetImages}
              disabled={syncing || saving}
              onChange={(e) => setSyncDownloadSetImages(e.target.checked)}
            />
            Download set images into the local database
          </label>
          <fieldset className="sync-panel__radio-group">
            <legend>Part image downloads</legend>
            <label className="checkbox">
              <input
                type="radio"
                name="set-detail-part-image-download-mode"
                value="none"
                checked={syncPartImageDownloadMode === "none"}
                disabled={syncing || saving}
                onChange={() => setSyncPartImageDownloadMode("none")}
              />
              Do not download images for parts
            </label>
            <label className="checkbox">
              <input
                type="radio"
                name="set-detail-part-image-download-mode"
                value="missing"
                checked={syncPartImageDownloadMode === "missing"}
                disabled={syncing || saving}
                onChange={() => setSyncPartImageDownloadMode("missing")}
              />
              Download part images only for missing parts
            </label>
            <label className="checkbox">
              <input
                type="radio"
                name="set-detail-part-image-download-mode"
                value="all"
                checked={syncPartImageDownloadMode === "all"}
                disabled={syncing || saving}
                onChange={() => setSyncPartImageDownloadMode("all")}
              />
              Download all part images
            </label>
          </fieldset>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={syncing || saving}
            onClick={() => void onSyncThisSet()}
          >
            {syncing ? "Syncing…" : "Sync this set"}
          </button>
        </div>
        {syncResult && (
          <div className="import-result" role="status">
            Synced {syncResult.sets_synced} set
            {syncResult.sets_synced === 1 ? "" : "s"};{" "}
            {syncResult.inventory_lines_written} inventory lines;{" "}
            {syncResult.parts_upserted} parts upserted.
            {syncResult.set_images_downloaded > 0 && (
              <>
                {" "}
                Downloaded {syncResult.set_images_downloaded} set image
                {syncResult.set_images_downloaded === 1 ? "" : "s"}.
              </>
            )}
            {syncResult.minifig_images_downloaded > 0 && (
              <>
                {" "}
                Downloaded {syncResult.minifig_images_downloaded} minifigure image
                {syncResult.minifig_images_downloaded === 1 ? "" : "s"}.
              </>
            )}
            {syncResult.part_images_downloaded > 0 && (
              <>
                {" "}
                Downloaded {syncResult.part_images_downloaded} part image
                {syncResult.part_images_downloaded === 1 ? "" : "s"}.
              </>
            )}
            {syncResult.sets_failed.length > 0 && (
              <ul className="import-errors">
                {syncResult.sets_failed.map((fail) => (
                  <li key={fail.set_num}>
                    {fail.set_num}: {fail.message}
                  </li>
                ))}
              </ul>
            )}
            {syncResult.image_downloads_failed.length > 0 && (
              <ul className="import-errors">
                {syncResult.image_downloads_failed.map((fail) => (
                  <li key={`${fail.target}-${fail.url}`}>
                    {fail.target}: {fail.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </details>

      <form className="instance-form" onSubmit={(e) => void onSubmit(e)}>
        <h2>Copy details</h2>
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
            Recommended age (years)
            <input
              type="number"
              min={0}
              aria-label="Recommended age"
              placeholder="e.g. 8"
              value={form.age}
              disabled={saving}
              onChange={(e) => setForm({ ...form, age: e.target.value })}
            />
            <span className="form-hint">
              Rebrickable often omits this field. Enter the minimum age from the
              box or LEGO.com when you care to track it. Applies to all copies
              of this set number.
            </span>
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
            Delete this copy
          </button>
        </div>
      </form>

      <section className="inventory-section">
        <div className="inventory-section__header">
          <button
            type="button"
            className="btn btn--small btn--primary inventory-section__add"
            aria-label="Add part"
            onClick={() => setPartModal({ mode: "create" })}
          >
            +
          </button>
          <h2>Parts inventory</h2>
        </div>
        <div className="inventory-controls">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showMissingOnly}
              onChange={(e) => setShowMissingOnly(e.target.checked)}
            />
            Missing parts only
          </label>
          <label className="toolbar__field">
            Sort parts
            <select
              value={partSort}
              onChange={(e) => setPartSort(e.target.value as PartInventorySort)}
            >
              <option value="element_id">Element ID</option>
              <option value="part_num">Part number</option>
              <option value="missing">Missing quantity</option>
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Element ID</th>
                <th>Qty</th>
                <th>Missing</th>
              </tr>
            </thead>
            <tbody>
              {visibleSetParts.map((line) => {
                const thumb = withRefreshToken(
                  mediaUrl(line.image_url ?? line.part_image_url),
                  imageRefreshToken,
                );
                return (
                  <tr
                    key={line.instance_line_id}
                    className="data-table__row--clickable"
                    onClick={() =>
                      setPartModal({ mode: "edit", inventoryKind: "set_part", line })
                    }
                  >
                    <td>
                      <div className="part-cell">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            className="part-cell__img"
                          />
                        ) : null}
                        <span>
                          <strong>{line.part_num}</strong>
                          {line.part_name ? ` — ${line.part_name}` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="part-aliases-cell">
                      {formatElementIds(line.element_ids)}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <InstanceQuantityEditor
                        setCopyId={detail.id}
                        line={line}
                        onUpdated={() => void load()}
                      />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <MissingLineEditor
                        setCopyId={detail.id}
                        line={line}
                        inventoryKind="set_part"
                        onUpdated={() => void load()}
                      />
                    </td>
                  </tr>
                );
              })}
              {visibleSetParts.length === 0 && (
                <tr>
                  <td colSpan={4}>No matching set parts.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {inventory.minifigs.length > 0 && (
        <section className="inventory-section">
          <h2>Minifigures</h2>
          {inventory.minifigs.map((mf) => (
            <article key={mf.line_id} className="minifig-block">
              <div className="minifig-block__header">
                {mf.image_url ? (
                  <img
                    src={mediaUrl(mf.image_url) ?? undefined}
                    alt=""
                    className="minifig-block__img"
                  />
                ) : null}
                <h3>
                  {mf.minifig_num}
                  {mf.name ? ` — ${mf.name}` : ""} ×{mf.quantity}
                </h3>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Element ID</th>
                      <th>Qty</th>
                      <th>Missing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mf.parts.map((line) => {
                      const thumb = withRefreshToken(
                        mediaUrl(line.image_url ?? line.part_image_url),
                        imageRefreshToken,
                      );
                      return (
                        <tr
                          key={line.instance_line_id}
                          className="data-table__row--clickable"
                          onClick={() =>
                            setPartModal({
                              mode: "edit",
                              inventoryKind: "minifig_part",
                              line,
                            })
                          }
                        >
                          <td>
                            <div className="part-cell">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt=""
                                  className="part-cell__img"
                                />
                              ) : null}
                              <span>
                                <strong>{line.part_num}</strong>
                                {line.part_name ? ` — ${line.part_name}` : ""}
                              </span>
                            </div>
                          </td>
                          <td>{formatElementIds(line.element_ids)}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <InstanceQuantityEditor
                              setCopyId={detail.id}
                              line={line}
                              onUpdated={() => void load()}
                            />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <MissingLineEditor
                              setCopyId={detail.id}
                              line={line}
                              inventoryKind="minifig_part"
                              onUpdated={() => void load()}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
      )}

      {partModal && (
        <PartLineModal
          mode={partModal.mode}
          setCopyId={detail.id}
          inventoryKind={
            partModal.mode === "edit" ? partModal.inventoryKind : "set_part"
          }
          line={partModal.mode === "edit" ? partModal.line : undefined}
          onClose={() => setPartModal(null)}
          onSaved={onPartModalSaved}
        />
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
        <Modal title="Delete this copy?" onClose={() => setShowDeleteConfirm(false)}>
          <p>
            This removes <strong>{pageTitle}</strong> from your collection and
            its missing-part data for this copy. If it is the{" "}
            <strong>last copy</strong> of LEGO set <strong>{catalog.set_num}</strong>,
            shared catalog and inventory rows for that set number are removed from
            the database too.
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
