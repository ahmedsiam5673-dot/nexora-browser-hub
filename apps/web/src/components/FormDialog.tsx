"use client";
import { useId, useRef, type ReactNode } from "react";
import { Message, PendingContext, useActionSubmit, type ServerAction } from "./ActionForm";

/** Edit-in-a-dialog using the native <dialog> element. */
export function FormDialog({ triggerLabel, title, submitLabel = "Save", action, children, triggerClassName = "btn-ghost min-h-9 px-3" }: {
  triggerLabel: string; title: string; submitLabel?: string; action: ServerAction; children: ReactNode; triggerClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { state, pending, onSubmit } = useActionSubmit(action, { onSuccess: () => ref.current?.close() });
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => ref.current?.showModal()}>{triggerLabel}</button>
      <dialog ref={ref} aria-labelledby={titleId} className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-line bg-surface p-6 text-ink shadow-xl">
        <form onSubmit={onSubmit} className="space-y-4">
          <PendingContext.Provider value={pending}>
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {children}
            <Message state={state} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => ref.current?.close()}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
            </div>
          </PendingContext.Provider>
        </form>
      </dialog>
    </>
  );
}
