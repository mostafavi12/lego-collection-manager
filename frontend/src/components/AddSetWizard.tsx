import { FormEvent, useState } from "react";

import { createOwnedSet, fetchAddSetPreview } from "../api/client";
import type {
  ManualAddPartInput,
  OwnedSetAddPreviewResponse,
} from "../api/types";
import { AsyncMessage } from "./AsyncMessage";
import { Modal } from "./Modal";

interface AddSetWizardProps {
  onClose: () => void;
  onCreated: (ownedSetId: number) => void;
}

interface PartDraft {
  part_num: string;
  part_name: string;
  color_id: string;
  color_name: string;
  quantity: string;
}

const emptyPart = (): PartDraft => ({
  part_num: "",
  part_name: "",
  color_id: "0",
  color_name: "Black",
  quantity: "1",
});

export function AddSetWizard({ onClose, onCreated }: AddSetWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [setNum, setSetNum] = useState("");
  const [preview, setPreview] = useState<OwnedSetAddPreviewResponse | null>(null);
  const [label, setLabel] = useState("");
  const [catalogName, setCatalogName] = useState("");
  const [catalogTheme, setCatalogTheme] = useState("");
  const [catalogYear, setCatalogYear] = useState("");
  const [catalogParts, setCatalogParts] = useState("");
  const [age, setAge] = useState("");
  const [parts, setParts] = useState<PartDraft[]>([emptyPart()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onNext(event: FormEvent) {
    event.preventDefault();
    const trimmed = setNum.trim();
    if (!trimmed) {
      setError("Enter a LEGO set number");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAddSetPreview(trimmed);
      setPreview(result);
      setLabel(result.suggested_label);
      if (result.catalog_exists) {
        setCatalogName(result.set_name ?? "");
        setCatalogTheme(result.theme_name ?? "");
        setCatalogYear(result.year != null ? String(result.year) : "");
        setCatalogParts(
          result.num_parts != null ? String(result.num_parts) : "",
        );
        setAge(result.age != null ? String(result.age) : "");
      } else {
        setCatalogName("");
        setCatalogTheme("");
        setCatalogYear("");
        setCatalogParts("");
        setAge("");
        setParts([emptyPart()]);
      }
      setStep(2);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not look up set number",
      );
    } finally {
      setLoading(false);
    }
  }

  function buildPartsPayload(): ManualAddPartInput[] {
    return parts
      .map((row) => ({
        part_num: row.part_num.trim(),
        part_name: row.part_name.trim() || null,
        color_id: Number.parseInt(row.color_id, 10) || 0,
        color_name: row.color_name.trim() || null,
        quantity: Number.parseInt(row.quantity, 10),
      }))
      .filter((row) => row.part_num.length > 0);
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (!preview) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (preview.catalog_exists) {
        const created = await createOwnedSet({
          set_num: preview.set_num,
          label: label.trim() || null,
        });
        onCreated(created.id);
        return;
      }

      const yearTrimmed = catalogYear.trim();
      const partsTrimmed = catalogParts.trim();
      const ageTrimmed = age.trim();
      const partRows = buildPartsPayload();
      for (const row of partRows) {
        if (!Number.isFinite(row.quantity) || row.quantity < 1) {
          setError("Each part needs a quantity of at least 1");
          setLoading(false);
          return;
        }
      }

      const created = await createOwnedSet({
        set_num: preview.set_num,
        label: label.trim() || null,
        age: ageTrimmed === "" ? null : Number.parseInt(ageTrimmed, 10),
        catalog: {
          name: catalogName.trim() || null,
          theme_name: catalogTheme.trim() || null,
          year: yearTrimmed === "" ? null : Number.parseInt(yearTrimmed, 10),
          num_parts:
            partsTrimmed === "" ? null : Number.parseInt(partsTrimmed, 10),
        },
        parts: partRows.length > 0 ? partRows : undefined,
      });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add set");
    } finally {
      setLoading(false);
    }
  }

  function backToStepOne() {
    setStep(1);
    setPreview(null);
    setError(null);
  }

  if (step === 1) {
    return (
      <Modal title="Add LEGO set" onClose={onClose}>
        <form onSubmit={(e) => void onNext(e)}>
          <p>Enter the LEGO set number for the set you want to add.</p>
          <AsyncMessage error={error} />
          <label className="form-field form-field--wide">
            LEGO set number
            <input
              value={setNum}
              disabled={loading}
              placeholder="e.g. 6024-1"
              onChange={(e) => setSetNum(e.target.value)}
              autoFocus
            />
          </label>
          <div className="modal__actions">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={loading}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? "Checking…" : "Next"}
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  if (!preview) {
    return null;
  }

  const copyNumber = preview.existing_copy_count + 1;

  return (
    <Modal
      title={
        preview.catalog_exists
          ? `Add instance — ${preview.set_num}`
          : `New set — ${preview.set_num}`
      }
      onClose={onClose}
    >
      <form onSubmit={(e) => void onAdd(e)}>
        <AsyncMessage error={error} />

        {preview.catalog_exists ? (
          <>
            <p className="add-set-wizard__intro">
              You are adding a <strong>new instance</strong> of LEGO set{" "}
              <strong>{preview.set_num}</strong>
              {preview.set_name ? ` (${preview.set_name})` : ""}. This will be{" "}
              <strong>copy #{copyNumber}</strong>. Shared catalog fields and parts
              inventory are shown below (read-only).
            </p>

            <div className="add-set-wizard__catalog">
              {preview.image_url ? (
                <img
                  src={preview.image_url}
                  alt=""
                  className="add-set-wizard__image"
                />
              ) : (
                <div
                  className="add-set-wizard__image add-set-wizard__image--placeholder"
                  aria-hidden
                />
              )}
              <div className="add-set-wizard__fields">
                <label className="form-field">
                  LEGO set name
                  <input value={catalogName} readOnly />
                </label>
                <label className="form-field">
                  Theme
                  <input value={catalogTheme} readOnly />
                </label>
                <label className="form-field">
                  Number of parts
                  <input value={catalogParts} readOnly />
                </label>
                <label className="form-field">
                  Age
                  <input value={age} readOnly />
                </label>
                <label className="form-field">
                  Instance label
                  <input
                    value={label}
                    disabled={loading}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </label>
              </div>
            </div>

            {preview.set_parts.length > 0 ? (
              <div className="add-set-wizard__parts">
                <h3>Parts inventory</h3>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Part</th>
                        <th>Color</th>
                        <th>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.set_parts.map((line) => (
                        <tr
                          key={`${line.part_num}-${line.color_name}`}
                        >
                          <td>
                            <strong>{line.part_num}</strong>
                            {line.part_name ? ` — ${line.part_name}` : ""}
                          </td>
                          <td>{line.color_name}</td>
                          <td>{line.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="form-hint">
                No parts in the catalog template yet. You can add parts on the set
                detail page after creating this instance.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="add-set-wizard__intro">
              Set number <strong>{preview.set_num}</strong> is not in your
              collection yet. Enter catalog details (optional) or leave them blank
              and fill them in later on the set detail page.
            </p>
            <div className="instance-form__grid">
              <label className="form-field">
                LEGO set name
                <input
                  value={catalogName}
                  disabled={loading}
                  onChange={(e) => setCatalogName(e.target.value)}
                />
              </label>
              <label className="form-field">
                Theme
                <input
                  value={catalogTheme}
                  disabled={loading}
                  onChange={(e) => setCatalogTheme(e.target.value)}
                />
              </label>
              <label className="form-field">
                Number of parts
                <input
                  type="number"
                  value={catalogParts}
                  disabled={loading}
                  onChange={(e) => setCatalogParts(e.target.value)}
                />
              </label>
              <label className="form-field">
                Age
                <input
                  type="number"
                  value={age}
                  disabled={loading}
                  onChange={(e) => setAge(e.target.value)}
                />
              </label>
              <label className="form-field">
                Instance label
                <input
                  value={label}
                  disabled={loading}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
            </div>
          </>
        )}

        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={loading}
            onClick={onClose}
          >
            Cancel
          </button>
          {!preview.catalog_exists && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={loading}
              onClick={backToStepOne}
            >
              Back
            </button>
          )}
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? "Adding…" : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
