import { FormEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { importCsv, syncRebrickable } from "../api/client";
import type { CsvImportResponse, RebrickableSyncResponse } from "../api/types";
import { AsyncMessage } from "../components/AsyncMessage";

type PartImageDownloadMode = "none" | "missing" | "all";
type ExistingSetMode = "skip" | "copy";

export function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvResult, setCsvResult] = useState<CsvImportResponse | null>(null);
  const [syncResult, setSyncResult] = useState<RebrickableSyncResponse | null>(null);
  const [loading, setLoading] = useState<"csv" | "sync" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadSetImages, setDownloadSetImages] = useState(true);
  const [partImageDownloadMode, setPartImageDownloadMode] =
    useState<PartImageDownloadMode>("none");
  const [existingSetMode, setExistingSetMode] = useState<ExistingSetMode>("skip");

  async function onCsvSubmit(event: FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV or text file first");
      return;
    }
    setLoading("csv");
    setError(null);
    setCsvResult(null);
    try {
      const result = await importCsv(file, existingSetMode);
      setCsvResult(result);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(null);
    }
  }

  async function onSync() {
    setLoading("sync");
    setError(null);
    setSyncResult(null);
    try {
      const result = await syncRebrickable(undefined, {
        download_set_images: downloadSetImages,
        part_image_download_mode: partImageDownloadMode,
      });
      setSyncResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="page">
      <header className="page__header">
        <h1>Import</h1>
        <p className="page__lede">
          Add LEGO sets from a comma-separated list or{" "}
          <Link to="/" state={{ openAddSet: true }}>
            add one set manually
          </Link>
          . CSV import fetches catalog and inventory from Rebrickable (no
          images).
        </p>
      </header>

      <AsyncMessage
        error={error}
        loading={loading === "sync" && !syncResult}
      />

      <article className="import-card">
        <h2>CSV import</h2>
        <p>
          Upload a plain text file with comma-separated LEGO set numbers (no
          header). Each token creates a <strong>new physical copy</strong> in your
          loads set metadata and parts from Rebrickable when the API key is
          configured. Images are not downloaded. Recommended{" "}
          <strong>age</strong> is often missing from Rebrickable — set it on the
          set detail page after import if you want it.
        </p>
        <form onSubmit={(e) => void onCsvSubmit(e)}>
          <fieldset className="sync-panel__radio-group">
            <legend>Existing LEGO sets</legend>
            <label className="checkbox">
              <input
                type="radio"
                name="existing-set-mode"
                value="skip"
                checked={existingSetMode === "skip"}
                disabled={loading === "csv"}
                onChange={() => setExistingSetMode("skip")}
              />
              Skip already existing LEGO Sets
            </label>
            <label className="checkbox">
              <input
                type="radio"
                name="existing-set-mode"
                value="copy"
                checked={existingSetMode === "copy"}
                disabled={loading === "csv"}
                onChange={() => setExistingSetMode("copy")}
              />
              Create a new copy for already existing LEGO Sets
            </label>
          </fieldset>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/plain" />
          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading === "csv"}
          >
            {loading === "csv" ? "Importing…" : "Import CSV"}
          </button>
        </form>
        {csvResult && (
          <div className="import-result" role="status">
            <p>
              Created <strong>{csvResult.instances_created}</strong> instance
              {csvResult.instances_created === 1 ? "" : "s"}; fetched{" "}
              <strong>{csvResult.sets_fetched}</strong> from Rebrickable
              {csvResult.existing_sets_skipped > 0 && (
                <>
                  {" "}
                  ({csvResult.existing_sets_skipped} existing set
                  {csvResult.existing_sets_skipped === 1 ? "" : "s"} skipped)
                </>
              )}
              {csvResult.catalog_stubs_created > 0 && (
                <>
                  {" "}
                  ({csvResult.catalog_stubs_created} catalog stub
                  {csvResult.catalog_stubs_created === 1 ? "" : "s"} when fetch
                  failed)
                </>
              )}
              .
            </p>
            {csvResult.sets_failed.length > 0 && (
              <ul className="import-errors">
                {csvResult.sets_failed.map((fail) => (
                  <li key={`${fail.token_index}-${fail.set_num}`}>
                    Token {fail.token_index} ({fail.set_num}): {fail.message}
                  </li>
                ))}
              </ul>
            )}
            {csvResult.errors.length > 0 && (
              <ul className="import-errors">
                {csvResult.errors.map((err) => (
                  <li key={err.token_index}>
                    Token {err.token_index}: {err.message}
                  </li>
                ))}
              </ul>
            )}
            <Link to="/">View collection</Link>
          </div>
        )}
      </article>

      <article className="import-card import-card--secondary">
        <h2>Rebrickable sync (optional)</h2>
        <p>
          Re-fetch catalog data for sets you already own. Useful after manual
          edits or if a CSV token failed. Requires{" "}
          <code>REBRICKABLE_API_KEY</code> on the server.
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={downloadSetImages}
            disabled={loading === "sync"}
            onChange={(e) => setDownloadSetImages(e.target.checked)}
          />
          Download set images into the local database
        </label>
        <fieldset className="sync-panel__radio-group">
          <legend>Part image downloads</legend>
          <label className="checkbox">
            <input
              type="radio"
              name="part-image-download-mode"
              value="none"
              checked={partImageDownloadMode === "none"}
              disabled={loading === "sync"}
              onChange={() => setPartImageDownloadMode("none")}
            />
            Do not download images for parts
          </label>
          <label className="checkbox">
            <input
              type="radio"
              name="part-image-download-mode"
              value="missing"
              checked={partImageDownloadMode === "missing"}
              disabled={loading === "sync"}
              onChange={() => setPartImageDownloadMode("missing")}
            />
            Download part images only for missing parts
          </label>
          <label className="checkbox">
            <input
              type="radio"
              name="part-image-download-mode"
              value="all"
              checked={partImageDownloadMode === "all"}
              disabled={loading === "sync"}
              onChange={() => setPartImageDownloadMode("all")}
            />
            Download part images for all sets
          </label>
        </fieldset>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={loading === "sync"}
          onClick={() => void onSync()}
        >
          {loading === "sync" ? "Syncing…" : "Sync entire collection"}
        </button>
        {syncResult && (
          <div className="import-result" role="status">
            <p>
              Synced <strong>{syncResult.sets_synced}</strong> set
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
            </p>
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
      </article>
    </section>
  );
}
