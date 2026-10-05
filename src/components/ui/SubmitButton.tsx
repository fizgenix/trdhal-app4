"use client";

import { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, Spinner } from "@/components/ui/Button";

/**
 * Submit button for forms that call a Server Action directly (no
 * useActionState). Reads the parent form's pending state, so it disables
 * itself and shows a spinner + pendingText the moment it's clicked —
 * stopping repeat clicks while the save is in flight.
 */
export function SubmitButton({
  pendingText = "Saving… please wait",
  children,
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}

/** Same idea for small unstyled icon buttons (e.g. the × on a chip). */
export function SubmitIconButton({
  children,
  className = "",
  ...props
}: ComponentProps<"button"> & { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={`disabled:cursor-wait ${className}`}
      {...props}
    >
      {pending ? <Spinner className="h-3 w-3" /> : children}
    </button>
  );
}
