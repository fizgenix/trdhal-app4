"use client";

import { useActionState, useState } from "react";
import { resetUserPassword, type UserFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: UserFormState = { error: null, success: null };

/** The "Reset password" side panel's form; calls onSuccess once it's set. */
export function ResetPasswordForm({
  userId,
  fullName,
  onSuccess,
}: {
  userId: string;
  fullName: string;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(resetUserPassword, initialState);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) onSuccess();
  }

  return (
    <form action={formAction} autoComplete="off" className="flex flex-1 flex-col">
      <input type="hidden" name="user_id" value={userId} />
      <div className="flex flex-col gap-4 p-5">
        <p className="rounded-lg bg-[#fbf3dc] px-3 py-2 text-xs text-[#7a5608]">
          Only do this after confirming it&apos;s really {fullName} asking. They&apos;ll be
          signed out everywhere and must choose their own password at next sign-in.
        </p>
        <Field
          label="New temporary password"
          name="password"
          id={`reset-${userId}`}
          type="text"
          autoComplete="new-password"
          spellCheck={false}
          placeholder="At least 8 characters"
          minLength={8}
          required
        />
        {state.error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {state.error}
          </p>
        )}
      </div>

      <div className="mt-auto border-t border-brand-border-soft p-5">
        <Button type="submit" loading={isPending} fullWidth>
          {isPending ? "Resetting…" : "Reset password"}
        </Button>
      </div>
    </form>
  );
}
