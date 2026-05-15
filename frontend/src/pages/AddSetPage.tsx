import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  createOwnedSet,
  fetchAddSetPreview,
} from "../api/client";
import type {
  ManualAddPartInput,
  OwnedSetAddPreviewResponse,
} from "../api/types";
import { AsyncMessage } from "../components/AsyncMessage";

type Step = "set_num" | "existing" | "new";

interface PartDraft {
  part_num: string;
  part_name: string;
  color_id: string;
  color_name: string;
  quantity: string;
  is_spare: boolean;
  is_alternate: boolean;
}

const emptyPart = (): PartDraft => ({
  part_num: "",
  part_name: "",
  color_id: "0",
  color_name: "Black",
  quantity: "1",
  is_spare: false,
  is_alternate: false,
});

export function AddSetPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("set_num");
  const [setNum, setSetNum] = useState("");
  const [preview, setPreview] = useState<OwnedSetAddPreviewResponse | null>(
    null,
  );
  const [label, setLabel] = useState("");
  const [age, setAge] = useState("");
  const [catalogName, setCatalogName] = useState("");
  const [catalogTheme, setCatalogTheme] = useState("");
  const [catalogYear, setCatalogYear] = useState("");
  const [catalogParts, setCatalogParts] = useState("");
  const [parts, setParts] = useState<PartDraft[]>([emptyPart()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCheckSetNum(event: FormEvent) {
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
      setStep(result.catalog_exists ? "existing" : "new");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not look up set number");
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
        is_spare: row.is_spare,
        is_alternate: row.is_alternate,
      }))
      .filter((row) => row.part_num.length > 0);
  }

  async function submitCreate(body: Parameters<typeof createOwnedSet>[0]) {
    setLoading(true);
    setError(null);
    try {
      const created = await createOwnedSet(body);
      navigate(`/sets/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create set");
    } finally {
      setLoading(false);
    }
  }

  async function onCreateExisting(event: FormEvent) {
    event.preventDefault();
    if (!preview) {
      return;
    }
    const ageTrimmed = age.trim();
    await submitCreate({
      set_num: preview.set_num,
      label: label.trim() || null,
      age: ageTrimmed === "" ? null : Number.parseInt(ageTrimmed, 10),
    });
  }

  async function onCreateNew(event: FormEvent) {
    event.preventDefault();
    if (!preview) {
      return;
    }
    const yearTrimmed = catalogYear.trim();
    const partsTrimmed = catalogParts.trim();
    const ageTrimmed = age.trim();
    const partRows = buildPartsPayload();
    for (const row of partRows) {
      if (!Number.isFinite(row.quantity) || row.quantity < 1) {
        setError("Each part needs a quantity of at least 1");
        return;
      }
    }

    await submitCreate({
      set_num: preview.set_num,
      label: label.trim() || null,
      age: ageTrimmed === "" ? null : Number.parseInt(ageTrimmed, 10),
      catalog: {
        name: catalogName.trim() || null,
        theme_name: catalogTheme.trim() || null,
        year: yearTrimmed === "" ? null : Number.parseInt(yearTrimmed, 10),
        num_parts: partsTrimmed === "" ? null : Number.parseInt(partsTrimmed, 10),
      },
      parts: partRows.length > 0 ? partRows : undefined,
    });
  }

  function backToSetNum() {
    setStep("set_num");
    setPreview(null);
    setError(null);
  }

  return (
    <section className="page">
      <header className="page__header">
        <h1>Add LEGO set</h1>
        <p className="page__lede">
          Enter a set number to add a new copy or register a set that is not in
          your collection yet.
        </p>
      </header>

      <AsyncMessage error={error} loading={loading && step === "set_num"} />

      {step === "set_num" && (
        <form className="import-card instance-form" onSubmit={(e) => void onCheckSetNum(e)}>
          <h2>Set number</h2>
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
          <div className="instance-form__actions">
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? "Checking…" : "Continue"}
            </button>
            <Link to="/" className="btn btn--ghost">
              Cancel
            </Link>
          </div>
        </form>
      )}

      {step === "existing" && preview && (
        <form className="import-card instance-form" onSubmit={(e) => void onCreateExisting(e)}>
          <h2>New copy of {preview.set_num}</h2>
          <p>
            This set number is already in your collection
            {preview.set_name ? ` (${preview.set_name})` : ""}. You are creating{" "}
            <strong>copy #{preview.existing_copy_count + 1}</strong> with the same
            catalog and parts inventory.
          </p>
          <div className="instance-form__grid">
            <label className="form-field">
              Label
              <input
                value={label}
                disabled={loading}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <label className="form-field">
              Age (optional)
              <input
                type="number"
                value={age}
                disabled={loading}
                onChange={(e) => setAge(e.target.value)}
              />
            </label>
          </div>
          <div className="instance-form__actions">
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? "Creating…" : "Create copy"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={loading}
              onClick={backToSetNum}
            >
              Back
            </button>
          </div>
        </form>
      )}

      {step === "new" && preview && (
        <form className="import-card instance-form" onSubmit={(e) => void onCreateNew(e)}>
          <h2>New set {preview.set_num}</h2>
          <p>
            This set number is not in your collection yet. Add catalog details and
            parts now, or leave them blank and fill them in on the set detail page
            later.
          </p>

          <h3>Instance</h3>
          <div className="instance-form__grid">
            <label className="form-field">
              Label
              <input
                value={label}
                disabled={loading}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <label className="form-field">
              Age (optional)
              <input
                type="number"
                value={age}
                disabled={loading}
                onChange={(e) => setAge(e.target.value)}
              />
            </label>
          </div>

          <h3>Catalog (optional)</h3>
          <div className="instance-form__grid">
            <label className="form-field">
              Name
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
              Year
              <input
                type="number"
                value={catalogYear}
                disabled={loading}
                onChange={(e) => setCatalogYear(e.target.value)}
              />
            </label>
            <label className="form-field">
              Part count
              <input
                type="number"
                value={catalogParts}
                disabled={loading}
                onChange={(e) => setCatalogParts(e.target.value)}
              />
            </label>
          </div>

          <h3>Parts (optional)</h3>
          <p className="form-hint">
            Rebrickable color IDs work best (e.g. 0 = Black). You can add more parts
            on the detail page after creating the set.
          </p>
          {parts.map((row, index) => (
            <div key={index} className="add-set-part-row">
              <label className="form-field">
                Part number
                <input
                  value={row.part_num}
                  disabled={loading}
                  onChange={(e) => {
                    const next = [...parts];
                    next[index] = { ...row, part_num: e.target.value };
                    setParts(next);
                  }}
                />
              </label>
              <label className="form-field">
                Part name
                <input
                  value={row.part_name}
                  disabled={loading}
                  onChange={(e) => {
                    const next = [...parts];
                    next[index] = { ...row, part_name: e.target.value };
                    setParts(next);
                  }}
                />
              </label>
              <label className="form-field">
                Color ID
                <input
                  value={row.color_id}
                  disabled={loading}
                  onChange={(e) => {
                    const next = [...parts];
                    next[index] = { ...row, color_id: e.target.value };
                    setParts(next);
                  }}
                />
              </label>
              <label className="form-field">
                Color name
                <input
                  value={row.color_name}
                  disabled={loading}
                  onChange={(e) => {
                    const next = [...parts];
                    next[index] = { ...row, color_name: e.target.value };
                    setParts(next);
                  }}
                />
              </label>
              <label className="form-field">
                Qty
                <input
                  type="number"
                  min={1}
                  value={row.quantity}
                  disabled={loading}
                  onChange={(e) => {
                    const next = [...parts];
                    next[index] = { ...row, quantity: e.target.value };
                    setParts(next);
                  }}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={row.is_spare}
                  disabled={loading}
                  onChange={(e) => {
                    const next = [...parts];
                    next[index] = { ...row, is_spare: e.target.checked };
                    setParts(next);
                  }}
                />
                Spare
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={row.is_alternate}
                  disabled={loading}
                  onChange={(e) => {
                    const next = [...parts];
                    next[index] = { ...row, is_alternate: e.target.checked };
                    setParts(next);
                  }}
                />
                Alt
              </label>
              {parts.length > 1 && (
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={loading}
                  onClick={() => setParts(parts.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn--secondary btn--small"
            disabled={loading}
            onClick={() => setParts([...parts, emptyPart()])}
          >
            Add part row
          </button>

          <div className="instance-form__actions">
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? "Creating…" : "Create set"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={loading}
              onClick={backToSetNum}
            >
              Back
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
