import { FormEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { importCsv, syncRebrickable } from "../api/client";
import type { CsvImportResponse, RebrickableSyncResponse } from "../api/types";
import { AsyncMessage } from "../components/AsyncMessage";

export function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvResult, setCsvResult] = useState<CsvImportResponse | null>(null);
  const [syncResult, setSyncResult] = useState<RebrickableSyncResponse | null>(null);
  const [loading, setLoading] = useState<"csv" | "sync" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const result = await importCsv(file);
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
      const result = await syncRebrickable();
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
          Add owned sets from a comma-separated list or{" "}
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
          header). Each token creates a <strong>new</strong> owned instance and
          loads set metadata and parts from Rebrickable when the API key is
          configured. Images are not downloaded.
        </p>
        <form onSubmit={(e) => void onCsvSubmit(e)}>
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
        <button
          type="button"
          className="btn btn--secondary"
          disabled={loading === "sync"}
          onClick={() => void onSync()}
        >
          {loading === "sync" ? "Syncing…" : "Sync all owned sets"}
        </button>
        {syncResult && (
          <div className="import-result" role="status">
            <p>
              Synced <strong>{syncResult.sets_synced}</strong> set
              {syncResult.sets_synced === 1 ? "" : "s"};{" "}
              {syncResult.inventory_lines_written} inventory lines;{" "}
              {syncResult.parts_upserted} parts upserted.
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
          </div>
        )}
      </article>
    </section>
  );
}
