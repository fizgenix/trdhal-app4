"use client";

import { useActionState } from "react";
import { Spinner } from "@/components/ui/Button";
import { approveOrder, rejectDirectReceipt, type ApprovalFormState } from "./actions";

const initialState: ApprovalFormState = { error: null, success: null };

/** Close-short and reject need a reason — checked here before any round trip (and again on the server). */
function needsRemarks(formData: FormData, message: string): ApprovalFormState | null {
  return String(formData.get("remarks") ?? "").trim() ? null : { error: message, success: null };
}

async function closeShortAction(prev: ApprovalFormState, formData: FormData) {
  const missing = needsRemarks(formData, "Add a remark explaining why this item is being closed short.");
  if (missing) return missing;
  formData.set("close_short", "true");
  return approveOrder(prev, formData);
}

async function rejectAction(prev: ApprovalFormState, formData: FormData) {
  const missing = needsRemarks(formData, "Add a reason for rejecting this item.");
  if (missing) return missing;
  return rejectDirectReceipt(prev, formData);
}

/**
 * The Remarks and Action cells of one Approvals row, as a single form:
 * Approve covers everything received but not yet approved; "Close short"
 * accepts what's been received as final; Reject turns down a direct
 * receipt. The last two need the remarks filled in as their reason.
 */
export function ApprovalActions({
  orderId,
  canApprove,
  canReject,
  closeShortLabel,
  waitingLabel,
}: {
  orderId: string;
  /** Something received isn't approved yet. */
  canApprove: boolean;
  /** Direct receipts only. */
  canReject: boolean;
  /** Shown when the item can be closed short, e.g. "Close short at 1,000 RMT". */
  closeShortLabel?: string;
  /** Shown instead of Approve when everything received is approved already. */
  waitingLabel?: string;
}) {
  const [approveState, approve, approving] = useActionState(approveOrder, initialState);
  const [shortState, closeShort, closing] = useActionState(closeShortAction, initialState);
  const [rejectState, reject, rejecting] = useActionState(rejectAction, initialState);
  const pending = approving || closing || rejecting;
  const error = [approveState, shortState, rejectState].find((s) => s.error)?.error;

  return (
    <form
      action={approve}
      className="col-span-full grid gap-2 md:col-span-2 md:grid-cols-subgrid md:items-center"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="close_short" value="false" />
      <input
        name="remarks"
        placeholder="Remarks (optional)"
        aria-label="Remarks"
        maxLength={500}
        className="w-full rounded-lg border border-brand-input-border bg-white px-2.5 py-2 text-sm text-brand-navy placeholder:text-gray-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
      />
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        {closeShortLabel && (
          <button
            type="submit"
            formAction={closeShort}
            disabled={pending}
            className="text-xs font-bold text-[#1e40af] underline underline-offset-2 hover:text-brand-navy disabled:opacity-50"
          >
            {closing ? "Closing…" : closeShortLabel}
          </button>
        )}
        {canReject && (
          <button
            type="submit"
            formAction={reject}
            disabled={pending}
            className="text-sm font-bold text-red-700 hover:text-red-800 disabled:opacity-50"
          >
            {rejecting ? "Rejecting…" : "Reject"}
          </button>
        )}
        {canApprove ? (
          <button
            type="submit"
            disabled={pending}
            aria-busy={approving || undefined}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-4 py-2 text-sm font-bold text-brand-gold-text hover:bg-brand-navy-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {approving && <Spinner className="h-3 w-3" />}
            {approving ? "Approving…" : "Approve"}
          </button>
        ) : (
          waitingLabel && (
            <span className="rounded-full border border-orange-300 bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-800">
              {waitingLabel}
            </span>
          )
        )}
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 md:col-span-2">
          {error}
        </p>
      )}
    </form>
  );
}
