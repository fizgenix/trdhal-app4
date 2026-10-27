import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { matchScore, SHOW_THRESHOLD } from "@/lib/fuzzy";

/**
 * Stock ledger for one site, shared by the Stock Inventory page and its
 * Excel (CSV) download. Stock is approved − released per item + unit
 * (0015_stock_from_approvals.sql): every HO3 approval is an IN movement,
 * every release an OUT movement, with a running balance. An approval that
 * covers several deliveries becomes one IN movement per delivery, each
 * dated by when it was received and showing only its own invoice.
 */

type Rel<T> = T | T[] | null;

function one<T>(rel: Rel<T>): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

type ApprovalRow = {
  id: string;
  order_id: string;
  quantity_approved: number;
  closes_short: boolean;
  remarks: string | null;
  approved_date: string;
  profiles: Rel<{ full_name: string }>;
  orders: Rel<{
    item_id: string;
    unit: string;
    quantity_ordered: number;
    description: string | null;
    items: Rel<{ name: string }>;
    purchase_orders: Rel<{ po_number: string; shopkeepers: Rel<{ name: string }> }>;
  }>;
};

type ReceivingRow = {
  id: string;
  order_id: string;
  quantity_received: number;
  invoice_number: string | null;
  received_date: string;
  created_at: string;
};

type ReleaseRow = {
  id: string;
  item_id: string;
  unit: string;
  quantity_released: number;
  quality_notes: string | null;
  released_date: string;
  items: Rel<{ name: string }>;
  buildings: Rel<{ name: string }>;
  profiles: Rel<{ full_name: string }>;
};

export type Movement = {
  id: string;
  type: "in" | "out";
  /** IN: the date the delivery was received. OUT: the release date. */
  date: string;
  /** Signed: + approved in, − released. 0 for a close-short with nothing new approved. */
  quantity: number;
  /** Stock after this movement. */
  balance: number;
  by: string;
  // IN
  poNumber?: string;
  vendor?: string;
  invoices?: string[];
  /** The PO line ended up with more delivered than ordered. */
  overBy?: number;
  /** This approval closed the PO line short. */
  shortBy?: number;
  remarks?: string | null;
  // OUT
  building?: string;
  notes?: string | null;
};

export type StockLine = {
  key: string;
  itemName: string;
  unit: string;
  /** The description on the latest approved PO line for this item that has one. */
  description: string | null;
  /** Approved in / released within the date range (all time if none). */
  approvedIn: number;
  released: number;
  /** Stock before the range starts. */
  openingBalance: number;
  /** Stock right now, whatever the range. */
  inStock: number;
  lastMovement: Movement | null;
  /** Movements within the range, oldest first. */
  movements: Movement[];
  poNumbers: string[];
};

export type InventoryFilters = {
  q?: string;
  /** YYYY-MM-DD, India time, inclusive. */
  from?: string;
  to?: string;
  showOutOfStock?: boolean;
};

export type InventoryResult = {
  lines: StockLine[];
  summary: { inStock: number; outOfStock: number; releases: number; pos: number };
};

/** A timestamp's calendar day in India time (the business's timezone), as YYYY-MM-DD. */
export function indiaDay(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

const round = (n: number) => Number(n.toFixed(4));

export async function loadInventory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  siteId: string,
  filters: InventoryFilters,
): Promise<InventoryResult> {
  const [{ data: approvalsData }, { data: receivingData }, { data: releasesData }] =
    await Promise.all([
      supabase
        .from("approvals")
        .select(
          "id, order_id, quantity_approved, closes_short, remarks, approved_date, profiles ( full_name ), orders!inner ( site_id, item_id, unit, quantity_ordered, description, items ( name ), purchase_orders ( po_number, shopkeepers ( name ) ) )",
        )
        .eq("orders.site_id", siteId),
      supabase
        .from("receiving_logs")
        .select("id, order_id, quantity_received, invoice_number, received_date, created_at, orders!inner ( site_id )")
        .eq("orders.site_id", siteId),
      supabase
        .from("inventory_releases")
        .select(
          "id, item_id, unit, quantity_released, quality_notes, released_date, items ( name ), buildings ( name ), profiles ( full_name )",
        )
        .eq("site_id", siteId),
    ]);

  // Per PO line: total received, and its deliveries in the order logged.
  type Receipt = {
    id: string;
    quantity: number;
    invoice: string | null;
    receivedDate: string;
    loggedAt: number;
  };
  const receivedByLine = new Map<string, number>();
  const receiptsByLine = new Map<string, Receipt[]>();
  for (const r of (receivingData ?? []) as unknown as ReceivingRow[]) {
    receivedByLine.set(r.order_id, (receivedByLine.get(r.order_id) ?? 0) + Number(r.quantity_received));
    const list = receiptsByLine.get(r.order_id) ?? [];
    list.push({
      id: r.id,
      quantity: Number(r.quantity_received),
      invoice: r.invoice_number,
      receivedDate: r.received_date,
      loggedAt: new Date(r.created_at).getTime(),
    });
    receiptsByLine.set(r.order_id, list);
  }
  for (const list of receiptsByLine.values()) list.sort((a, b) => a.loggedAt - b.loggedAt);

  type Draft = {
    key: string;
    itemName: string;
    unit: string;
    description: { text: string; at: string } | null;
    events: Omit<Movement, "balance">[];
  };
  const byKey = new Map<string, Draft>();
  const draft = (itemId: string, itemName: string, unit: string) => {
    const key = `${itemId}|${unit}`;
    let d = byKey.get(key);
    if (!d) {
      d = { key, itemName, unit, description: null, events: [] };
      byKey.set(key, d);
    }
    return d;
  };

  // Approvals per line, oldest first: each one covers the deliveries
  // logged before it that no earlier approval covered (approve_order
  // approves everything received but not yet approved).
  const approvalsByLine = new Map<string, ApprovalRow[]>();
  for (const a of (approvalsData ?? []) as unknown as ApprovalRow[]) {
    const list = approvalsByLine.get(a.order_id) ?? [];
    list.push(a);
    approvalsByLine.set(a.order_id, list);
  }

  for (const [orderId, lineApprovals] of approvalsByLine) {
    lineApprovals.sort((x, y) => x.approved_date.localeCompare(y.approved_date));
    const receipts = receiptsByLine.get(orderId) ?? [];
    const received = receivedByLine.get(orderId) ?? 0;
    let next = 0; // first receipt not yet covered by an approval

    for (const a of lineApprovals) {
      const line = one(a.orders);
      if (!line) continue;
      const po = one(line.purchase_orders);
      const ordered = Number(line.quantity_ordered);
      const approvedAt = new Date(a.approved_date).getTime();

      const covered: Receipt[] = [];
      while (next < receipts.length && receipts[next].loggedAt <= approvedAt) {
        covered.push(receipts[next]);
        next++;
      }

      const base = {
        type: "in" as const,
        by: one(a.profiles)?.full_name ?? "Unknown",
        poNumber: po?.po_number,
        vendor: one(po?.shopkeepers ?? null)?.name,
      };
      // Line-level flags and the approval's remarks go on its last row only.
      const closing = {
        overBy: received > ordered ? round(received - ordered) : undefined,
        shortBy: a.closes_short ? round(ordered - received) : undefined,
        remarks: a.remarks,
      };
      const target = draft(line.item_id, one(line.items)?.name ?? "Unknown item", line.unit);
      const description = line.description?.trim();
      if (description && (!target.description || a.approved_date > target.description.at)) {
        target.description = { text: description, at: a.approved_date };
      }

      const coveredTotal = round(covered.reduce((n, r) => n + r.quantity, 0));
      if (covered.length > 0 && coveredTotal === round(Number(a.quantity_approved))) {
        covered.forEach((r, i) =>
          target.events.push({
            ...base,
            id: `${a.id}-${r.id}`,
            date: r.receivedDate,
            quantity: r.quantity,
            invoices: r.invoice ? [r.invoice] : [],
            ...(i === covered.length - 1 ? closing : {}),
          }),
        );
      } else {
        // Nothing new approved (a close-short of what was already approved),
        // or the deliveries don't add up to the approval (older data): one
        // row for the whole approval, dated by its latest delivery.
        const latest = (covered.length > 0 ? covered : receipts.slice(0, next)).at(-1);
        target.events.push({
          ...base,
          id: a.id,
          date: latest?.receivedDate ?? a.approved_date,
          quantity: Number(a.quantity_approved),
          invoices: Array.from(
            new Set(covered.map((r) => r.invoice).filter((v): v is string => !!v)),
          ),
          ...closing,
        });
      }
    }
  }

  for (const r of (releasesData ?? []) as unknown as ReleaseRow[]) {
    draft(r.item_id, one(r.items)?.name ?? "Unknown item", r.unit).events.push({
      id: r.id,
      type: "out",
      date: r.released_date,
      quantity: -Number(r.quantity_released),
      by: one(r.profiles)?.full_name ?? "Unknown",
      building: one(r.buildings)?.name,
      notes: r.quality_notes,
    });
  }

  const inRange = (iso: string) => {
    const day = indiaDay(iso);
    return (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
  };
  const beforeRange = (iso: string) => !!filters.from && indiaDay(iso) < filters.from;

  const allLines: StockLine[] = [];
  for (const d of byKey.values()) {
    // Oldest first; on the same instant, stock comes in before it goes out.
    d.events.sort(
      (x, y) => x.date.localeCompare(y.date) || (x.type === y.type ? 0 : x.type === "in" ? -1 : 1),
    );
    let balance = 0;
    let openingBalance = 0;
    const movements: Movement[] = [];
    let approvedIn = 0;
    let released = 0;
    for (const e of d.events) {
      balance = round(balance + e.quantity);
      if (beforeRange(e.date)) openingBalance = balance;
      if (!inRange(e.date)) continue;
      movements.push({ ...e, balance });
      if (e.type === "in") approvedIn += e.quantity;
      else released -= e.quantity;
    }
    const all = d.events;
    const last = all[all.length - 1];
    allLines.push({
      key: d.key,
      itemName: d.itemName,
      unit: d.unit,
      description: d.description?.text ?? null,
      approvedIn: round(approvedIn),
      released: round(released),
      openingBalance,
      inStock: balance,
      lastMovement: last ? { ...last, balance } : null,
      movements,
      poNumbers: Array.from(
        new Set(all.map((e) => e.poNumber).filter((p): p is string => !!p)),
      ),
    });
  }

  allLines.sort((a, b) => a.itemName.localeCompare(b.itemName) || a.unit.localeCompare(b.unit));

  // Fuzzy search on the item name or any PO number that brought it in —
  // the same typo-tolerant matching as the order form's pickers.
  const q = filters.q?.trim() ?? "";
  const searched = q
    ? allLines
        .map((line) => ({
          line,
          score: Math.max(
            matchScore(q, line.itemName),
            ...line.poNumbers.map((p) => matchScore(q, p)),
          ),
        }))
        .filter((r) => r.score >= SHOW_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.line)
    : allLines;

  // With a date range, only lines that moved in it (or still hold stock).
  const hasRange = !!(filters.from || filters.to);
  const lines = searched.filter(
    (l) =>
      (filters.showOutOfStock || l.inStock !== 0) && (!hasRange || l.movements.length > 0 || l.inStock !== 0),
  );

  const summary = {
    inStock: searched.filter((l) => l.inStock > 0).length,
    outOfStock: searched.filter((l) => l.inStock <= 0).length,
    releases: lines.reduce((n, l) => n + l.movements.filter((m) => m.type === "out").length, 0),
    pos: new Set(
      lines.flatMap((l) => l.movements.map((m) => m.poNumber).filter((p): p is string => !!p)),
    ).size,
  };

  return { lines, summary };
}

/** Does a movement's PO number match the search? Used to highlight IN rows. */
export function poMatches(q: string | undefined, poNumber: string | undefined) {
  return !!q?.trim() && !!poNumber && matchScore(q, poNumber) >= SHOW_THRESHOLD;
}
