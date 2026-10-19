"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import { Message, PendingContext, useActionSubmit, type ServerAction } from "./ActionForm";

/** Confirmation dialog on the native <dialog> element (focus trap, Esc to close, modal semantics built in). */
export function ConfirmForm({
  action, triggerLabel, title, description, confirmLabel, requireText, hidden, triggerClassName = "btn-ghost", children,
}: {
  action: ServerAction;
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  /** If set, the user must type this exact text to enable the confirm button. */
  requireText?: string;
  hidden?: Record<string, string>;
  triggerClassName?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [typed, setTyped] = useState("");
  const { state, pending, onSubmit } = useActionSubmit(action, { onSuccess: () => ref.current?.close() });
  const needsText = requireText !== undefined;

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => ref.current?.showModal()}>
        {triggerLabel}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-line bg-surface p-6 text-ink shadow-xl"
        onClose={() => setTyped("")}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <PendingContext.Provider value={pending}>
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted">{description}</p>
            {children}
            {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            {needsText && (
              <div>
                <label className="label" htmlFor={`${titleId}-t`}>Type <b>{requireText}</b> to confirm</label>
                <input id={`${titleId}-t`} className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              </div>
            )}
            <Message state={state} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => ref.current?.close()}>Cancel</button>
              <button type="submit" className="btn-danger" disabled={pending || (needsText && typed !== requireText)}>
                {pending ? "Working…" : confirmLabel}
              </button>
            </div>
          </PendingContext.Provider>
        </form>
      </dialog>
    </>
  );
}
