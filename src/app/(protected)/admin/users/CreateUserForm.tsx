"use client";

import { useActionState } from "react";
import { createUser, type UserFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { CardHeaderBand } from "@/components/ui/CardHeaderBand";

const initialState: UserFormState = { error: null, success: null };

export function CreateUserForm() {
  const [state, formAction, isPending] = useActionState(createUser, initialState);

  return (
    <form
      action={formAction}
      className="grid gap-4 rounded-2xl border border-brand-border bg-white p-6 shadow-sm sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <CardHeaderBand>Create a login</CardHeaderBand>
      </div>
      <Field label="Full name" name="full_name" placeholder="e.g. Ramesh Kumar" required />
      <Field
        label="Login email"
        name="email"
        type="email"
        placeholder="ho2.sitea@trdhal.app"
        required
      />
      <Field label="Phone (optional)" name="phone" type="tel" placeholder="+91 90000 00000" />
      <Field
        label="Temporary password"
        name="password"
        type="password"
        placeholder="At least 8 characters"
        required
        minLength={8}
      />

      <label className="flex items-center gap-2 text-sm font-medium text-brand-navy sm:col-span-2">
        <input type="checkbox" name="is_admin" className="h-5 w-5 rounded border-gray-300" />
        Give this person Admin access to all sites
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" loading={isPending}>
          {isPending ? "Creating… please wait" : "Create login"}
        </Button>
      </div>
    </form>
  );
}
