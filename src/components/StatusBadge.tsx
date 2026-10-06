import type { OrderStatus } from "@/types/database";

/**
 * Order statuses plus "partially_approved" — not stored, shown for a
 * 'pending_approval' line that has had some of its quantity approved
 * (0014_partial_approvals.sql). Use lineDisplayStatus() to pick it.
 */
export type DisplayStatus = OrderStatus | "partially_approved";

export function lineDisplayStatus(status: OrderStatus, approvedQuantity: number): DisplayStatus {
  return status === "pending_approval" && approvedQuantity > 0 ? "partially_approved" : status;
}

const STATUS_STYLES: Record<DisplayStatus, string> = {
  placed: "bg-[rgba(234,179,8,.15)] text-[#92670a] border border-[rgba(234,179,8,.5)]",
  pending_approval:
    "bg-[rgba(249,115,22,.15)] text-[#9a3412] border border-[rgba(249,115,22,.5)]",
  partially_approved:
    "bg-[rgba(59,130,246,.12)] text-[#1e40af] border border-[rgba(59,130,246,.45)]",
  completed: "bg-[rgba(34,197,94,.15)] text-[#166534] border border-[rgba(34,197,94,.5)]",
  cancelled: "bg-[#d3cbb9] text-[#4b5563] border border-[#c4bba8]",
};

const STATUS_LABELS: Record<DisplayStatus, string> = {
  placed: "Placed",
  pending_approval: "Pending Approval",
  partially_approved: "Partly Approved",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
