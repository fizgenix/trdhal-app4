"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword, type PasswordFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: PasswordFormState = { error: null, success: null };

/** `firstLogin` relabels the current-password box as the Admin's temporary one. */
export function ChangePasswordForm({ firstLogin = false }: { firstLogin?: boolean }) {
  const [state, formAction, isPending] = useActionState(changePassword, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5">
      <Field
        label={firstLogin ? "Temporary password (from your Admin)" : "Current password"}
        name="current_password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        label="New password"
        name="new_password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        minLength={8}
        required
      />
      <Field
        label="Confirm new password"
        name="confirm_password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}

      <Button type="submit" fullWidth={firstLogin} loading={isPending}>
        {isPending ? "Saving…" : firstLogin ? "Set my password" : "Change password"}
      </Button>
    </form>
  );
}
