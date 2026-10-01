import type { OrderStatus } from "@/types/database";

const STATUS_STYLES: Record<OrderStatus, string> = {
  placed: "bg-[rgba(234,179,8,.15)] text-[#92670a] border border-[rgba(234,179,8,.5)]",
  pending_approval:
    "bg-[rgba(249,115,22,.15)] text-[#9a3412] border border-[rgba(249,115,22,.5)]",
  completed: "bg-[rgba(34,197,94,.15)] text-[#166534] border border-[rgba(34,197,94,.5)]",
  cancelled: "bg-[#d3cbb9] text-[#4b5563] border border-[#c4bba8]",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  placed: "Placed",
  pending_approval: "Pending Approval",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
