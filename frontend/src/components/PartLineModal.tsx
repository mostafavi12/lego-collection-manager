import { FormEvent, useEffect, useState } from "react";

import {
  addSetPartLine,
  deletePartImage,
  mediaUrl,
  deleteSetPartLine,
  patchPartAliases,
  patchInstanceInventoryLine,
  updateSetPartLine,
  uploadPartImage,
} from "../api/client";
import type { MinifigPartLineDetail, SetPartLineDetail } from "../api/types";
import {
  AliasChipEditor,
  normalizePartAliases,
} from "./AliasChipEditor";
import { AsyncMessage } from "./AsyncMessage";
import { Modal } from "./Modal";

type InventoryPartLineDetail = SetPartLineDetail | MinifigPartLineDetail;
type InventoryKind = "set_part" | "minifig_part";
export interface PartLineModalSaveResult {
  imageChanged: boolean;
}

interface PartLineModalProps {
  mode: "create" | "edit";
  setCopyId: number;
  inventoryKind?: InventoryKind;
  line?: InventoryPartLineDetail;
  onClose: () => void;
  onSaved: (result?: PartLineModalSaveResult) => void;
}

export function PartLineModal({
  mode,
  setCopyId,
  inventoryKind = "set_part",
  line,
  onClose,
  onSaved,
}: PartLineModalProps) {
  const isEdit = mode === "edit" && line !== undefined;
  const isSetPartEdit = isEdit && inventoryKind === "set_part";
  const isMinifigPartEdit = isEdit && inventoryKind === "minifig_part";

  const [partNum, setPartNum] = useState(line?.part_num ?? "");
  const [partName, setPartName] = useState(line?.part_name ?? "");
  const [colorId, setColorId] = useState(
    line != null ? String(line.color_id) : "0",
  );
  const [colorName, setColorName] = useState(line?.color_name ?? "Black");
  const [quantity, setQuantity] = useState(
    line != null ? String(line.quantity) : "1",
  );
  const [missingQuantity, setMissingQuantity] = useState(
    line != null ? String(line.missing_quantity) : "0",
  );
  const [aliases, setAliases] = useState<string[]>(
    line != null && "aliases" in line ? line.aliases : [],
  );
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isEdit && line) {
      setPartNum(line.part_num);
      setPartName(line.part_name ?? "");
      setColorId(String(line.color_id));
      setColorName(line.color_name);
      setQuantity(String(line.quantity));
      setMissingQuantity(String(line.missing_quantity));
      setAliases("aliases" in line ? line.aliases : []);
      setPendingImage(null);
      setRemoveCurrentImage(false);
    }
  }, [isEdit, line]);

  useEffect(() => {
    if (pendingImage == null) {
      setPendingPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingImage);
    setPendingPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  function onPendingFileSelected(file: File | undefined) {
    setPendingImage(file ?? null);
    if (file) {
      setRemoveCurrentImage(false);
    }
  }

  function onRemovePendingOrCurrentImage() {
    setPendingImage(null);
    setRemoveCurrentImage(true);
  }

  async function saveAliases(partId: number, canonicalPartNum: string) {
    const normalized = normalizePartAliases(canonicalPartNum, aliases);
    await patchPartAliases(partId, { aliases: normalized });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsedQty = Number.parseInt(quantity, 10);
    if (!Number.isFinite(parsedQty) || parsedQty < 1) {
      setError("Quantity must be at least 1");
      return;
    }
    const parsedMissing = Number.parseInt(missingQuantity, 10);
    if (
      !Number.isFinite(parsedMissing) ||
      parsedMissing < 0 ||
      parsedMissing > parsedQty
    ) {
      setError(`Missing quantity must be between 0 and ${parsedQty}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isEdit && line) {
        const imageChanged = pendingImage != null || removeCurrentImage;
        const shouldPatchMissing = parsedMissing !== line.missing_quantity;
        const patchedMissingBeforeQuantity = parsedMissing < line.missing_quantity;
        if (shouldPatchMissing && patchedMissingBeforeQuantity) {
          await patchInstanceInventoryLine(setCopyId, line.instance_line_id, {
            quantity_missing: parsedMissing,
          });
        }
        if (inventoryKind === "set_part") {
          await updateSetPartLine(setCopyId, line.instance_line_id, {
            part_name: partName.trim() || null,
            color_id: Number.parseInt(colorId, 10) || 0,
            color_name: colorName.trim() || null,
            quantity: parsedQty,
          });
        } else {
          await patchInstanceInventoryLine(setCopyId, line.instance_line_id, {
            quantity: parsedQty,
          });
        }
        try {
          await saveAliases(line.part_id, line.part_num);
        } catch (aliasErr) {
          setError(
            aliasErr instanceof Error
              ? `${aliasErr.message} (line was updated; retry aliases)`
              : "Alias update failed (line was updated)",
          );
          onSaved({ imageChanged });
          return;
        }
        if (shouldPatchMissing && !patchedMissingBeforeQuantity) {
          await patchInstanceInventoryLine(setCopyId, line.instance_line_id, {
            quantity_missing: parsedMissing,
          });
        }
        if (pendingImage) {
          try {
            await uploadPartImage(line.part_id, pendingImage);
          } catch (uploadErr) {
            setError(
              uploadErr instanceof Error
                ? `${uploadErr.message} (line was updated; retry image)`
                : "Image upload failed (line was updated)",
            );
            onSaved({ imageChanged });
            return;
          }
        } else if (removeCurrentImage) {
          try {
            await deletePartImage(line.part_id);
          } catch (deleteErr) {
            setError(
              deleteErr instanceof Error
                ? `${deleteErr.message} (line was updated; retry image removal)`
                : "Image removal failed (line was updated)",
            );
            onSaved({ imageChanged });
            return;
          }
        }
      } else {
        const trimmedPart = partNum.trim();
        if (!trimmedPart) {
          setError("Part number is required");
          setLoading(false);
          return;
        }
        const created = await addSetPartLine(setCopyId, {
          part_num: trimmedPart,
          part_name: partName.trim() || null,
          color_id: Number.parseInt(colorId, 10) || 0,
          color_name: colorName.trim() || null,
          quantity: parsedQty,
        });
        try {
          await saveAliases(created.part_id, trimmedPart);
        } catch (aliasErr) {
          setError(
            aliasErr instanceof Error
              ? `${aliasErr.message} (part was added; retry aliases from edit)`
              : "Alias update failed (part was added)",
          );
          onSaved({ imageChanged: pendingImage != null });
          return;
        }
        if (pendingImage) {
          try {
            await uploadPartImage(created.part_id, pendingImage);
          } catch (uploadErr) {
            setError(
              uploadErr instanceof Error
                ? `${uploadErr.message} (part was added; retry image from edit)`
                : "Image upload failed (part was added)",
            );
            onSaved({ imageChanged: false });
            return;
          }
        }
      }
      onSaved({
        imageChanged:
          (isEdit && (pendingImage != null || removeCurrentImage)) ||
          (!isEdit && pendingImage != null),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save part");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!line) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await deleteSetPartLine(setCopyId, line.instance_line_id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete part");
    } finally {
      setLoading(false);
      setConfirmDelete(false);
    }
  }

  const title = isEdit ? "Edit part" : "Add part";
  const imageUrl = line?.part_image_url ?? line?.image_url ?? null;
  const displayImageUrl = pendingPreview ?? (removeCurrentImage ? null : mediaUrl(imageUrl));
  const canonicalPartNum = isEdit ? (line?.part_num ?? "") : partNum.trim();

  return (
    <Modal title={title} onClose={onClose}>
      {confirmDelete && line && isSetPartEdit ? (
        <>
          <p>
            Remove <strong>{line.part_num}</strong> ({line.color_name}) from
            this instance&apos;s inventory?
          </p>
          <AsyncMessage error={error} />
          <div className="modal__actions">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={loading}
              onClick={() => setConfirmDelete(false)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={loading}
              onClick={() => void onDelete()}
            >
              {loading ? "Deleting…" : "Delete"}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)}>
          <p>
            {isEdit
              ? isMinifigPartEdit
                ? "Update this copy's quantity, aliases, and shared part image."
                : "Update catalog part details and this copy's quantity."
              : "Add a part to this instance's inventory (shared catalog template)."}
          </p>
          <AsyncMessage error={error} />
          <div className="instance-form__grid">
            <label className="form-field">
              Part number
              <input
                value={partNum}
                disabled={loading || isEdit}
                readOnly={isEdit}
                onChange={(e) => setPartNum(e.target.value)}
                autoFocus={!isEdit}
              />
            </label>
            <label className="form-field">
              Part name
              <input
                value={partName}
                disabled={loading || isMinifigPartEdit}
                readOnly={isMinifigPartEdit}
                onChange={(e) => setPartName(e.target.value)}
                autoFocus={isEdit}
              />
            </label>
            <label className="form-field">
              Color ID
              <input
                value={colorId}
                disabled={loading || isMinifigPartEdit}
                readOnly={isMinifigPartEdit}
                onChange={(e) => setColorId(e.target.value)}
              />
            </label>
            <label className="form-field">
              Color name
              <input
                value={colorName}
                disabled={loading || isMinifigPartEdit}
                readOnly={isMinifigPartEdit}
                onChange={(e) => setColorName(e.target.value)}
              />
            </label>
            <label className="form-field">
              Quantity
              <input
                type="number"
                min={1}
                value={quantity}
                disabled={loading}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            {isEdit && (
              <label className="form-field">
                Missing
                <input
                  type="number"
                  min={0}
                  max={quantity}
                  value={missingQuantity}
                  disabled={loading}
                  onChange={(e) => setMissingQuantity(e.target.value)}
                />
              </label>
            )}
          </div>

          <AliasChipEditor
            partNum={canonicalPartNum}
            aliases={aliases}
            onChange={setAliases}
            disabled={loading || !canonicalPartNum}
          />

          <div className="part-line-modal__image">
            <p className="form-hint">Part image (shared across all sets)</p>
            {isEdit && line ? (
              <div className="image-blob-editor">
                {displayImageUrl ? (
                  <img
                    src={displayImageUrl}
                    alt={`Part ${line.part_num}`}
                    className="image-blob-editor__preview"
                  />
                ) : (
                  <div className="image-blob-editor__placeholder" aria-hidden />
                )}
                <div className="image-blob-editor__actions">
                  <label className="btn btn--small btn--secondary">
                    Part photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="sr-only"
                      disabled={loading}
                      onChange={(e) =>
                        onPendingFileSelected(e.target.files?.[0])
                      }
                    />
                  </label>
                  {displayImageUrl && (
                    <button
                      type="button"
                      className="btn btn--small btn--ghost"
                      disabled={loading}
                      onClick={onRemovePendingOrCurrentImage}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="image-blob-editor">
                {pendingPreview ? (
                  <img
                    src={pendingPreview}
                    alt="Selected part"
                    className="image-blob-editor__preview"
                  />
                ) : (
                  <div className="image-blob-editor__placeholder" aria-hidden />
                )}
                <label className="btn btn--small btn--secondary">
                  Part photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="sr-only"
                    disabled={loading}
                    onChange={(e) =>
                      onPendingFileSelected(e.target.files?.[0])
                    }
                  />
                </label>
              </div>
            )}
          </div>

          <div className="modal__actions">
            {isEdit ? (
              <>
                {isSetPartEdit && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={loading}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={loading}
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={loading}
                >
                  {loading ? "Saving…" : "Update"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={loading}
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={loading}
                >
                  {loading ? "Adding…" : "Add"}
                </button>
              </>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
