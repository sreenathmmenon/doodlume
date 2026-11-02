import { useEffect, useRef, useId, type ReactNode } from "react";
import { X } from "lucide-react";
import "./modal-layout.css";

// Preserve the workspace opener while related dialogs replace one another.
let workspaceOpener: HTMLElement | null = null;

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  footer,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  footer?: ReactNode;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current!;
    const active = document.activeElement;
    const localOpener = active instanceof HTMLElement ? active : null;
    if (active instanceof HTMLElement && active !== document.body && !active.closest("dialog"))
      workspaceOpener = active;
    const opener = workspaceOpener;
    node.showModal();
    return () => {
      node.close();
      requestAnimationFrame(() => {
        // Nested tools return to their own launch control in the remaining
        // parent. A replacement dialog owns its focus and takes priority.
        const openDialogs = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")];
        const topDialog = openDialogs.at(-1);
        if (topDialog) {
          if (localOpener?.isConnected && localOpener.closest("dialog") === topDialog &&
              (document.activeElement === document.body || document.activeElement === topDialog || !document.activeElement?.isConnected))
            localOpener.focus({ preventScroll: true });
          return;
        }
        if (document.activeElement === document.body || !document.activeElement?.isConnected) {
          const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>(".world-panel .world-canvas");
          target?.focus({ preventScroll: true });
        }
        if (workspaceOpener === opener) workspaceOpener = null;
      });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal modal-stable ${wide ? "modal-wide" : ""} ${footer ? "modal-with-footer" : ""} ${className}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.target === e.currentTarget &&
          (e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom)
        )
          onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-scroll-body">{children}</div>
      {footer && <footer className="modal-action-footer">{footer}</footer>}
    </dialog>
  );
}
