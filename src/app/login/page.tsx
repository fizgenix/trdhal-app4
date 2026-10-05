"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/BrandMark";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-content px-4 py-12">
      <div className="grid w-full max-w-3xl overflow-hidden rounded-2xl border border-brand-border bg-white shadow-xl sm:grid-cols-2">
        <div className="flex flex-col justify-center gap-4 border-b border-brand-gold-border bg-brand-navy px-10 py-14 text-white sm:border-b-0 sm:border-r">
          <BrandMark size={56} />
          <h1 className="text-2xl font-extrabold leading-tight">
            TR Dhal
            <br />
            <span className="text-brand-gold-pale">Site Ops</span>
          </h1>
          <p className="max-w-xs text-sm text-white/65">
            Construction order &amp; inventory management for TR Dhal Group of
            Companies.
          </p>
        </div>

        <div className="flex flex-col justify-center gap-5 px-8 py-12 sm:px-10">
          <h2 className="text-xl font-extrabold text-brand-navy">Sign in</h2>

          <form action={formAction} className="flex flex-col gap-5">
            <Field
              label="Email"
              type="email"
              name="email"
              autoComplete="username"
              placeholder="you@trdhal.app"
              required
            />
            <Field
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />

            {state.error && (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {state.error}
              </p>
            )}

            <Button type="submit" fullWidth loading={isPending}>
              {isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-xs text-[#7b8494]">
            No self-signup — ask your Admin for a login.
          </p>
        </div>
      </div>
    </div>
  );
}
