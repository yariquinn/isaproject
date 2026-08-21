"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

// App-wide confirmation dialog. Replaces the browser's native window.confirm
// (the ugly "site says…" chrome popup) with an in-app modal that matches the
// rest of the portal. Call `confirm({...})` and await the boolean result.
type ConfirmOpts = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmCtx = (opts: ConfirmOpts | string) => Promise<boolean>;

const Ctx = createContext<ConfirmCtx | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmCtx>((o) => {
    const normalized: ConfirmOpts = typeof o === "string" ? { message: o } : o;
    setOpts(normalized);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  }, []);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {opts && (
        <div className="modal-backdrop confirm-backdrop" onClick={() => close(false)}>
          <div
            className="modal confirm-modal"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="confirm-title">{opts.title ?? "Are you sure?"}</h3>
            <p className="confirm-message">{opts.message}</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => close(false)} autoFocus>
                {opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                className={opts.danger === false ? "btn" : "btn confirm-danger"}
                onClick={() => close(true)}
              >
                {opts.confirmLabel ?? "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmCtx {
  const c = useContext(Ctx);
  // Safe fallback so components can call it unconditionally (resolves true,
  // matching the previous window.confirm-less default of proceeding).
  return c ?? (async () => true);
}
