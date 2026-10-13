"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { deleteUser } from "./actions";

/** Delete with a confirmation dialog — nothing happens until "Yes, delete". */
export function DeleteUserButton({ userId, fullName }: { userId: string; fullName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-full border border-red-200 px-3.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
      >
        Delete user
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-brand-border bg-white p-0 shadow-xl backdrop:bg-black/40"
      >
        <form action={deleteUser} className="flex flex-col gap-4 p-6">
          <input type="hidden" name="user_id" value={userId} />
          <h2 className="text-lg font-extrabold text-brand-navy">Delete {fullName}?</h2>
          <p className="text-sm text-[#4b5563]">
            They&apos;ll be signed out and won&apos;t be able to sign in again. If they have
            orders, receipts, approvals or releases, their name stays on those records.
            This can&apos;t be undone.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              autoFocus
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <SubmitButton variant="danger" pendingText="Deleting…">
              Yes, delete
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
