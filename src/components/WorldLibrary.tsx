import { useRef, useState, type ChangeEvent } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  FolderHeart,
} from "lucide-react";
import { Modal } from "./Modal";
import {
  importWorlds,
  MAX_BACKUP_BYTES,
  parseBackup,
  serializeBackup,
  type SavedWorld,
} from "../lib/library";

function download(entries: SavedWorld[], name: string) {
  const url = URL.createObjectURL(
    new Blob([serializeBackup(entries)], { type: "application/json" }),
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
}: {
  entries: SavedWorld[];
  loadError: string;
  onRetry: () => void;
  getCurrent: () => SavedWorld;
  onOpen: (entry: SavedWorld) => void;
  onImport: (entries: SavedWorld[]) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState<SavedWorld[] | null>(null),
    [copies, setCopies] = useState(false);
  const [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const conflicts =
    pending?.filter((e) => entries.some((old) => old.world.id === e.world.id))
      .length ?? 0;
  const count = (pending?.length ?? 0) - (copies ? 0 : conflicts);
  function backup(worlds: SavedWorld[], name: string) {
    try {
      setError("");
      download(worlds, name);
      setNotice("Backup downloaded with artwork, progress and undo history.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The backup could not be created.",
      );
    }
  }
  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");
    setPending(null);
    setWorking(true);
    setCopies(false);
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error("Choose a backup smaller than 64 MB.");
      setPending(parseBackup(await file.text()));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "This backup could not be opened. Nothing was imported.",
      );
    } finally {
      setWorking(false);
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
    <Modal title="Your worlds" onClose={onClose}>
      <p className="modal-copy">
        Saved on this device. Back up your creations to keep a portable copy.
      </p>
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
      {pending && (
        <section className="library-import" aria-label="Review backup import">
          <h3>
            {pending.length} {pending.length === 1 ? "world" : "worlds"} in this
            backup
          </h3>
          <p>Artwork, progress and undo history are included.</p>
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
                onClick={() => onOpen(entry)}
              >
                <img src={entry.world.sourceImage} alt="" />
                <span>
                  <strong>{entry.world.name}</strong>
                  <small>
                    {entry.state.collected.length}{" "}
                    {entry.state.collected.length === 1 ? "item" : "items"}{" "}
                    found · {new Date(entry.savedAt).toLocaleDateString()}
                    {entry.state.completed ? " · Completed" : ""}
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
              <button
                className="saved-world-backup"
                aria-label={`Back up ${entry.world.name}`}
                title="Back up this world"
                onClick={() => backup([entry], entry.world.name)}
              >
                <ArrowDownToLine size={17} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-worlds">
          <FolderHeart size={38} strokeWidth={1.2} />
          <h3>Your creations belong here.</h3>
          <p>Save your open world or import a backup to begin.</p>
        </div>
      )}
    </Modal>
  );
}
