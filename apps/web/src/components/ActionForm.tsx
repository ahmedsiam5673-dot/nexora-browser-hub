"use client";
import { createContext, useContext, useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";

const PendingContext = createContext(false);

export type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Runs a server action from a submit event. Unlike <form action>, inputs are NOT cleared on validation errors. */
export function useActionSubmit(action: ServerAction, opts: { resetOnSuccess?: boolean; onSuccess?: () => void } = {}) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      try {
        const result = await action(null, data);
        setState(result);
        if (result?.ok) {
          if (opts.resetOnSuccess) form.reset();
          opts.onSuccess?.();
        }
      } catch {
        setState({ ok: false, message: "Something went wrong. Please try again." });
      }
    });
  };
  return { state, pending, onSubmit };
}

export function SubmitButton({ children, className = "btn-primary", pendingLabel = "Saving…" }: { children: ReactNode; className?: string; pendingLabel?: string }) {
  const pending = useContext(PendingContext);
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function Message({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`rounded-xl px-3 py-2 text-sm ${state.ok ? "bg-ok-bg text-ok" : "bg-danger-bg text-danger"}`}>
      {state.message}
    </p>
  );
}

export function ActionForm({
  action, children, className = "space-y-4", resetOnSuccess = false,
}: { action: ServerAction; children: ReactNode; className?: string; resetOnSuccess?: boolean }) {
  const { state, pending, onSubmit } = useActionSubmit(action, { resetOnSuccess });
  return (
    <form onSubmit={onSubmit} className={className}>
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      <Message state={state} />
    </form>
  );
}

export { PendingContext };
