# TR Dhal Site Ops

Construction order & inventory management for TR Dhal Group of Companies.

This covers the full v1 build spec: authentication + multi-site user
assignment, and the complete Order → Receive → Approve → Release workflow.

What's here:

- Email + password login (Supabase Auth), navy + gold theme
- Admin screens to create logins, add sites, and assign users to a site
  with a role (Ordering / Receiving / Accounts)
- A dashboard showing each user their assigned site(s), linking into
  Orders for that site
- **Orders**: HO1 (or Admin) places a purchase order — PO number, vendor,
  and one or more item lines, each with its own quantity and unit (e.g.
  pipe in Rmtr and bends in Dozen on the same PO). Item, Unit and Vendor
  are type-to-search fields with an inline "+ Add new…" option, so a
  first-time material or supplier doesn't need a separate trip to a
  master-data screen. Each line is received and approved on its own; the
  PO's status badge is derived from its lines. Anyone assigned to the site
  (any role) can see the PO list; the PO's own creator (or Admin) can edit
  a line's quantity or remove a line while that line is still `Placed`,
  add a forgotten item while the PO is open, or cancel the whole PO while
  nothing on it has been received — every change is logged and shown
  under a "History" disclosure on the PO. A search box filters the list by
  PO number, item or vendor name.
- **Receiving**: HO2 (or Admin) sees a site's open orders (`Placed` or
  `Pending Approval`) and logs a delivery against one — quantity, date,
  **invoice number** (required — the vendor's own invoice reference),
  optional condition/quality notes. Multiple entries per order are fine
  (partial deliveries), and a delivery may exceed what was ordered — it's
  allowed but flagged "Over-received" in red on the Orders (with its own
  tab), Receiving and Approvals pages; the first entry on an order automatically moves it
  from `Placed` to `Pending Approval`. Receiving entries are append-only —
  there's no edit/undo in v1, matching the same choice already made for
  Inventory Releases. Both the Orders and Receiving pages now show
  "ordered vs. received so far" for each order, and every invoice number
  logged against it.
- **Approvals**: HO3 (or Admin) sees a site's `Pending Approval` items,
  grouped by PO, with the full receiving log and earlier approvals laid
  out against the ordered quantity. HO3 can approve whatever's been
  received so far without waiting for the rest — the item stays open
  (shown as `Partly Approved`) and completes once it's fully received and
  approved. If the rest isn't coming, HO3 can **close it short**: accept
  what was received as final, with a required remark; it's then flagged
  "Short-closed" on the Orders page. Every approval (quantity, who, when,
  remarks) is shown on the Orders page.
- **Stock Inventory** (the **Stock** tab): everyone at a site can see its
  stock per item + unit — approved in, released, and in stock now — and
  expand any item for a dated ledger with a running balance: every HO3
  approval coming in (PO number, vendor, invoices, over-received /
  short-closed flags) and every release going out (building, notes, who).
  Fuzzy search by item or PO number, a date range (with opening balance),
  an out-of-stock toggle, and a **Download Excel** button that exports
  exactly what's on screen. Stock counts only *approved* quantity, so the
  Release tab can only release what HO3 has approved.
- **Inventory Release**: HO2 (or Admin) sees current stock at their site
  (received minus already released, per item) and releases some of it to
  a building — quantity, destination (dropdown with inline "+ Add a new
  building…", same pattern as items/vendors), optional quality notes.
  The item dropdown only offers items actually in stock, and a release is
  hard-stopped at whatever's currently available — you can't release more
  than the site has, per your answer on that. A running "Recent releases"
  log sits below for the site.
- The full confirmed database schema + Row Level Security, in
  `supabase/migrations/`

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account if
   you don't have one, then click **New project**.
2. Pick an organization, name it (e.g. `tr-dhal-site-ops`), set a database
   password (save it somewhere safe), and choose a region close to Agra
   (e.g. Mumbai/`ap-south-1`).
3. Wait for the project to finish provisioning (a couple of minutes).

## 2. Run the database migrations

1. In the Supabase dashboard, open **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/migrations/0001_init.sql` and
   click **Run**. You should see "Success. No rows returned." This creates
   every table from the confirmed schema, the `site_inventory` view, and
   the auth/site-assignment RLS policies.
3. New query again, paste `supabase/migrations/0002_orders_rls.sql`, and
   run it too — this adds the RLS policies for the Orders feature (who can
   place/see/edit an order).
4. New query again, paste `supabase/migrations/0003_receiving.sql`, and
   run it — this adds the `log_receiving` database function that Receiving
   uses to log a delivery and (on the first delivery) flip the order to
   `Pending Approval` in one atomic step, plus the read policy for
   receiving history.
5. New query again, paste `supabase/migrations/0004_approvals.sql`, and
   run it — this adds the `approve_order` database function (checks the
   received total against the ordered quantity and flips the order to
   `Completed`), plus the read policy for approval history.
6. New query again, paste `supabase/migrations/0005_release.sql`, and run
   it — this adds the `release_inventory` database function (hard-stops at
   currently available stock), the read policy for the release log, and a
   small fix to the `site_inventory` view (`security_invoker = on`) so it
   correctly enforces Row Level Security when the app queries it directly.
7. New query again, paste `supabase/migrations/0006_receiving_quantity_cap.sql`,
   and run it — a bug fix so `log_receiving` caps a delivery at whatever's
   still outstanding on the order, instead of allowing the cumulative
   received total to exceed what was ordered.
8. New query again, paste `supabase/migrations/0007_po_invoice_numbers.sql`,
   and run it — adds the auto-assigned `po_number` on orders (plus the
   `peek_next_po_number()` function the "Place a new order" form previews
   it with) and the required `invoice_number` on `receiving_logs`,
   updating `log_receiving` to capture it.

If you already ran some of these in an earlier review, you only need to
run whichever migration(s) you haven't yet — they're numbered so you
always run them in order, and each one only adds what's new.

(If you'd rather use the CLI: `npx supabase login`, `npx supabase link
--project-ref <your-project-ref>`, then `npx supabase db push` from this
folder.)

## 3. Get your API keys

In the Supabase dashboard: **Project Settings → API**.

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** key (click "Reveal") → `SUPABASE_SERVICE_ROLE_KEY`

Copy `.env.local.example` to `.env.local` and fill these in:

```bash
cp .env.local.example .env.local
```

The service role key bypasses all security rules — it's only ever used
server-side (for Admin to create logins) and must never be committed or
exposed to the browser. `.env.local` is already git-ignored.

## 4. Create your first Admin login

Since only an Admin can create other users, and there's no self-signup by
design, the very first account has to be created directly in Supabase:

1. Dashboard → **Authentication → Users → Add user → Create new user**.
2. Enter your email and a password, and check **Auto Confirm User**.
3. Back in **SQL Editor**, run (replace the email):

   ```sql
   update profiles set is_admin = true where email = 'you@trdhal.app';
   ```

That account can now sign in to the app and use the Users screen to create
everyone else — no more manual SQL needed after this.

## 5. Run it locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the
Admin login from step 4.

## 6. Deploy to Vercel

1. Push this project to a GitHub repo.
2. On [vercel.com](https://vercel.com), **Add New Project** → import the
   repo.
3. In the project's **Environment Variables** settings, add the same three
   variables from your `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
4. Deploy. Vercel will give you a `*.vercel.app` URL — share that with your
   team once you're happy with the review.

## Project structure

```
src/
  app/
    login/                    Login page + sign-in server action
    (protected)/layout.tsx    Auth gate + header/nav shown on every page after login
    (protected)/dashboard/    Site selector, links into Orders per site
    (protected)/orders/       HO1: place/edit/cancel orders; everyone: view + history
    (protected)/receiving/    HO2: log deliveries (partial allowed) against open orders
    (protected)/approvals/    HO3: review receiving log vs. ordered qty, approve to close
    (protected)/release/      HO2: release stock to a building, hard-stopped at available
    (protected)/admin/sites/  Admin: create sites
    (protected)/admin/users/  Admin: create logins, assign to sites/roles
  components/
    ui/                       Button, Field, Select — large-touch-target primitives
    StatusBadge.tsx           Placed/Pending/Completed/Cancelled badge colors
    SiteSwitcher.tsx          Shared per-site dropdown (Orders, Receiving, and later screens)
  lib/
    supabase/                 Browser, server, admin (service-role), and proxy clients
    auth.ts                   getCurrentUser / requireUser / requireAdmin helpers
  types/database.ts           Row types matching the SQL schema
  proxy.ts                    Refreshes the Supabase session on every request
supabase/migrations/
  0001_init.sql                Full schema + auth/site-assignment RLS
  0002_orders_rls.sql          RLS for orders + order_edit_log
  0003_receiving.sql           log_receiving() function + receiving_logs RLS
  0004_approvals.sql           approve_order() function + approvals RLS
  0005_release.sql             release_inventory() function + inventory_releases RLS
  0006_receiving_quantity_cap.sql  Bug fix: caps a delivery at what's still outstanding
  0007_po_invoice_numbers.sql  orders.po_number (auto) + receiving_logs.invoice_number
  0008_manual_po_number.sql    PO number entered by HO1 instead of auto-assigned
  0009_received_date_not_future.sql  Received date can't be in the future
  0010_standard_units.sql      Normalises saved item units
  0011_unit_per_order.sql      Unit lives on each order; stock tracked per item + unit
  0012_purchase_orders.sql     Multi-item POs: purchase_orders header, orders become PO lines
  0013_allow_over_receiving.sql  Deliveries may exceed the ordered qty (flagged in the app)
  0014_partial_approvals.sql   Approve in batches as deliveries arrive, or close a line short
  0015_stock_from_approvals.sql  Stock = approved − released; Release limited to approved stock
```

Three of the original five migrations (`log_receiving`, `approve_order`,
`release_inventory`) are Postgres functions rather than plain table
policies — each one does a check-then-write that has to be atomic (can't
partially apply) and, for Receiving and Release, has to be safe if two
people submit against the same order/stock at the same instant. Doing
that from the app as two separate Supabase calls would leave a window for
both a partial-failure and a race condition; a single database function
with a row or advisory lock closes both.

## What's intentionally not built (v2, per your answers)

- Reject-and-send-back-to-HO2 workflow — `order_status` already has room
  for a `rejected` value, so adding this later is additive, not a
  redesign. Right now the only way out of Pending Approval is a full
  delivery + HO3 approval.
- Editing or reversing a logged inventory release or receiving entry —
  both are append-only in v1; a correction would need a new offsetting
  entry, which you said to leave for v2.
- Photo attachments on receiving/release notes.

## One open question worth a decision

Receiving doesn't cap you from logging more than was ordered — unlike
Inventory Release, which hard-stops at available stock (your answer was
specific to Release; there was no equivalent rule requested for
Receiving), so a slight over-delivery just logs as-is right now. Say the
word if you'd rather Receiving warn or hard-stop on over-delivery too.
