import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveSelectedSiteId } from "@/lib/selected-site";
import { indiaDay, loadInventory } from "@/lib/inventory";

const isDay = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** One CSV cell — quoted, with quotes doubled, so commas/newlines in notes are safe. */
function cell(v: string | number | null | undefined) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

const row = (cells: (string | number | null | undefined)[]) => cells.map(cell).join(",");

/**
 * Stock Inventory as a CSV that opens straight in Excel — the same site,
 * search and date range as the page (it links here with its own query
 * string). Two sections: the stock summary, then the full ledger.
 */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const url = request.nextUrl;
  const supabase = await createClient();

  if (user.sites.length === 0) {
    return new Response("You're not assigned to a site.", { status: 403 });
  }

  // Only ever one of the user's own sites — RLS enforces the same.
  const siteId = await resolveSelectedSiteId(user.sites, url.searchParams.get("site") ?? undefined);
  const siteName = user.sites.find((s) => s.id === siteId)?.name ?? "Site";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q") ?? "";

  const { lines } = await loadInventory(supabase, siteId, {
    q,
    from: isDay(from) ? from : undefined,
    to: isDay(to) ? to : undefined,
    showOutOfStock: url.searchParams.get("zero") === "1",
  });

  const period =
    isDay(from) || isDay(to) ? `${isDay(from) ? from : "start"} to ${isDay(to) ? to : "today"}` : "All time";

  const out: string[] = [
    row(["Stock Inventory", siteName]),
    row(["Period", period]),
    ...(q ? [row(["Search", q])] : []),
    row(["Exported", indiaDay(new Date().toISOString())]),
    "",
    row(["STOCK SUMMARY"]),
    row(["Item", "Unit", "Opening balance", "Approved in", "Released", "In stock now"]),
    ...lines.map((l) =>
      row([l.itemName, l.unit, l.openingBalance, l.approvedIn, l.released, l.inStock]),
    ),
    "",
    row(["LEDGER"]),
    row([
      "Date",
      "Item",
      "Unit",
      "Type",
      "Quantity",
      "Balance",
      "PO number",
      "Vendor",
      "Invoices",
      "Building",
      "Flags",
      "Notes / remarks",
      "By",
    ]),
    ...lines.flatMap((l) =>
      l.movements.map((m) =>
        row([
          indiaDay(m.date),
          l.itemName,
          l.unit,
          m.type === "in" ? "IN (approved)" : "OUT (released)",
          m.quantity,
          m.balance,
          m.poNumber,
          m.vendor,
          m.invoices?.join(", "),
          m.building,
          [
            m.overBy !== undefined ? `Over-received +${m.overBy}` : "",
            m.shortBy !== undefined ? `Short-closed -${m.shortBy}` : "",
          ]
            .filter(Boolean)
            .join("; "),
          m.type === "in" ? m.remarks : m.notes,
          m.by,
        ]),
      ),
    ),
  ];

  const safeSite = siteName.replace(/[^\w-]+/g, "-");
  const filename = `stock-inventory-${safeSite}-${indiaDay(new Date().toISOString())}.csv`;

  // Leading BOM so Excel reads it as UTF-8 (₹, names in Hindi, etc.).
  return new Response(`﻿${out.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
