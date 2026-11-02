import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  ChevronDown,
  FolderHeart,
  Plus,
} from "lucide-react";
import { Modal } from "./Modal";
import "./WorldLibrary.css";
import { validateImportArtwork } from "../lib/import-artwork";
import {
  importWorlds,
  MAX_BACKUP_BYTES,
  parseBackup,
  serializeBackup,
  BackupSizeError,
  type SavedWorld,
} from "../lib/library";

function download(
  entries: SavedWorld[],
  name: string,
  currentVersionOnly = false,
) {
  const url = URL.createObjectURL(
    new Blob([serializeBackup(entries, { currentVersionOnly })], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^a-z0-9-]+/gi, "-").slice(0, 60)}.doodlume.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function WorldLibrary({
  entries,
  getCurrent,
  onOpen,
  onImport,
  onClose,
  loadError,
  onRetry,
  onCreate,
}: {
  entries: SavedWorld[];
  loadError: string;
  onRetry: () => void;
  onCreate?: () => void;
  getCurrent: () => SavedWorld;
  onOpen: (entry: SavedWorld) => void;
  onImport: (entries: SavedWorld[]) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    inspection = useRef<AbortController | null>(null);
  useEffect(() => () => inspection.current?.abort(), []);
  const [pending, setPending] = useState<SavedWorld[] | null>(null),
    [copies, setCopies] = useState(false);
  const [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [backupFallback, setBackupFallback] = useState<SavedWorld | null>(null);
  const conflicts =
    pending?.filter((e) => entries.some((old) => old.world.id === e.world.id))
      .length ?? 0;
  const count = (pending?.length ?? 0) - (copies ? 0 : conflicts);
  function backup(
    worlds: SavedWorld[],
    name: string,
    currentVersionOnly = false,
  ) {
    try {
      setError("");
      setNotice("");
      setBackupFallback(null);
      download(
        worlds,
        currentVersionOnly ? `${name}-current-version-only` : name,
        currentVersionOnly,
      );
      setNotice(
        currentVersionOnly
          ? "Current version downloaded with artwork and progress. Undo history is not included; your stored history is unchanged."
          : "Backup downloaded with artwork, progress and undo history.",
      );
    } catch (e) {
      if (
        e instanceof BackupSizeError &&
        worlds.length === 1 &&
        !currentVersionOnly &&
        worlds[0].history?.length
      )
        setBackupFallback(worlds[0]);
      setError(
        e instanceof Error ? e.message : "The backup could not be created.",
      );
    }
  }
  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    inspection.current?.abort();
    const controller = new AbortController();
    inspection.current = controller;
    setError("");
    setNotice("");
    setPending(null);
    setBackupFallback(null);
    setWorking(true);
    setCopies(false);
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error("Choose a backup smaller than 64 MB.");
      const text = await file.text();
      if (controller.signal.aborted) return;
      const entries = parseBackup(text);
      await validateImportArtwork(entries, controller.signal);
      if (!controller.signal.aborted) setPending(entries);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(
        e instanceof Error
          ? e.message
          : "This backup could not be opened. Nothing was imported.",
      );
    } finally {
      if (inspection.current === controller) {
        inspection.current = null;
        if (!controller.signal.aborted) setWorking(false);
      }
    }
  }
  async function restore() {
    if (!pending || working) return;
    setWorking(true);
    setError("");
    try {
      const result = await importWorlds(entries, pending, copies);
      onImport(result.entries);
      setPending(null);
      setNotice(
        `${result.imported} ${result.imported === 1 ? "world imported" : "worlds imported"}.${result.skipped ? ` ${result.skipped} already saved; existing versions kept.` : " Existing worlds are unchanged."}`,
      );
      requestAnimationFrame(() => trigger.current?.focus());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Import did not finish. Earlier saves are unchanged.",
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <Modal title="Your worlds" onClose={onClose} wide className={`world-library-modal ${entries.length <= 1 ? "library-single" : entries.length === 2 ? "library-pair" : ""}`}>
      <div className="library-meta"><span>{entries.length} {entries.length === 1 ? "world" : "worlds"} · Saved on this device</span></div>
      <details className="library-utilities">
        <summary>Import &amp; backup <ChevronDown size={14} /></summary>
      <div className="library-actions">
        <button
          className="secondary-button"
          onClick={() => {
            const current = getCurrent();
            backup([current], current.world.name);
          }}
        >
          <ArrowDownToLine size={16} /> Back up open world
        </button>
        <button
          className="secondary-button"
          disabled={!entries.length}
          onClick={() => backup(entries, "Doodlume-library")}
        >
          <ArrowDownToLine size={16} /> Back up library
        </button>
        <button
          ref={trigger}
          className="secondary-button"
          disabled={working}
          onClick={() => input.current?.click()}
        >
          <ArrowUpFromLine size={16} /> Import backup
        </button>
        <input
          hidden
          type="file"
          ref={input}
          accept=".json,application/json"
          onChange={choose}
        />
      </div>
      </details>
      {loadError && (
        <div className="library-error" role="alert">
          <p>{loadError}</p>
          <button className="secondary-button" onClick={onRetry}>
            Retry loading
          </button>
        </div>
      )}
      {error && (
        <p className="library-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="library-notice" role="status">
          {notice}
        </p>
      )}
      {working && !pending && (
        <p className="library-notice" role="status">
          Checking backup artwork…
        </p>
      )}
      {backupFallback && (
        <section
          className="library-import"
          aria-label="Backup current version without undo history"
        >
          <p>
            Download the current artwork and progress without undo history. Your
            saved world and its history stay unchanged.
          </p>
          <button
            className="secondary-button"
            onClick={() =>
              backup([backupFallback], backupFallback.world.name, true)
            }
          >
            <ArrowDownToLine size={16} /> Back up current version only
          </button>
        </section>
      )}
      {pending && (
        <section className="library-import" aria-label="Review backup import">
          <h3>
            {pending.length} {pending.length === 1 ? "world" : "worlds"} in this
            backup
          </h3>
          <p>
            Artwork and progress are included.{" "}
            {pending.reduce(
              (total, entry) => total + (entry.history?.length ?? 0),
              0,
            )}{" "}
            undo checkpoints in this backup.
          </p>
          {conflicts > 0 && (
            <>
              <p>
                {conflicts} already saved here. Existing versions stay
                unchanged.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={copies}
                  onChange={(e) => setCopies(e.target.checked)}
                />{" "}
                Import existing worlds as separate copies
              </label>
            </>
          )}
          <div className="library-actions">
            <button
              className="text-button"
              disabled={working}
              onClick={() => {
                setPending(null);
                trigger.current?.focus();
              }}
            >
              Cancel import
            </button>
            <button
              className="primary-button"
              disabled={!count || working}
              onClick={() => void restore()}
            >
              {working
                ? "Importing…"
                : `Import ${count} ${count === 1 ? "world" : "worlds"}`}
            </button>
          </div>
        </section>
      )}
      {entries.length ? (
        <div className="saved-worlds">
          {entries.map((entry) => (
            <div className="saved-world-row" key={entry.world.id}>
              <button
                className="saved-world-open"
                aria-label={`Open ${entry.world.name}, version ${entry.world.revision}, saved ${new Date(entry.savedAt).toLocaleString()}`}
                onClick={() => onOpen(entry)}
              >
                <img src={entry.world.sourceImage} alt="" />
                <span>
                  <strong>{entry.world.name}</strong>
                  <small>
                    {entry.state.completed
                      ? "Completed"
                      : `${entry.state.collected.length} ${entry.state.collected.length === 1 ? "item" : "items"} found`}
                    {" · "}Version {entry.world.revision}
                  </small>
                  <small className="saved-world-date">
                    Saved {new Date(entry.savedAt).toLocaleString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "numeric", minute: "2-digit", second: "2-digit",
                    })}
                  </small>
                  <span className="saved-world-open-label">Open world <ChevronRight size={15} /></span>
                </span>
                <ChevronRight size={18} />
              </button>
              <button
                className="saved-world-backup"
                aria-label={`Back up world: ${entry.world.name}`}
                title="Download this world with artwork, progress and undo history"
                onClick={() => backup([entry], entry.world.name)}
              >
                <ArrowDownToLine size={15} /> Back up world
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-worlds">
          <FolderHeart size={38} strokeWidth={1.2} />
          <h3>Your worlds start here</h3>
          <p>Turn an image into a game, then save it here.</p>
          {onCreate && <button className="primary-button" onClick={onCreate}><Plus size={17} /> Create a world</button>}
        </div>
      )}
    </Modal>
  );
}
