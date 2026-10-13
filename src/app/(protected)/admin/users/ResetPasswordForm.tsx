"use client";

import { useActionState, useEffect, useRef } from "react";
import { resetUserPassword, type UserFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: UserFormState = { error: null, success: null };

export function ResetPasswordForm({ userId, fullName }: { userId: string; fullName: string }) {
  const [state, formAction, isPending] = useActionState(resetUserPassword, initialState);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      if (detailsRef.current) detailsRef.current.open = false;
    }
  }, [state]);

  return (
    <details ref={detailsRef} className="mt-3 text-sm">
      <summary className="cursor-pointer font-semibold text-[#7a5608] hover:underline">
        Reset password
      </summary>
      <form
        ref={formRef}
        action={formAction}
        autoComplete="off"
        className="mt-3 flex flex-col gap-3 rounded-xl border border-brand-border-soft bg-[#fbf8f1] p-4"
      >
        <p className="text-xs text-[#6b7280]">
          Only do this after confirming it&apos;s really {fullName} asking. They&apos;ll be
          signed out everywhere and must choose their own password at next sign-in.
        </p>
        <input type="hidden" name="user_id" value={userId} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
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
          </div>
          <Button type="submit" variant="secondary" loading={isPending}>
            {isPending ? "Resetting…" : "Set temporary password"}
          </Button>
        </div>
        {state.error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {state.error}
          </p>
        )}
      </form>
    </details>
  );
}
