"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SubmitButton, SubmitIconButton } from "@/components/ui/SubmitButton";
import { CreateUserForm } from "./CreateUserForm";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { assignUserToSite, deleteUser, removeUserSiteAssignment } from "./actions";

export type UserRow = {
  id: string;
  fullName: string;
  email: string | null;
  isAdmin: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  assignments: { id: string; siteName: string; roleLabel: string }[];
};

type Panel =
  | { kind: "create" }
  | { kind: "assign" | "reset" | "delete"; userId: string };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/** A site · role chip; with `removable` its × removes that access. */
function AccessChip({
  assignment,
  removable = true,
}: {
  assignment: UserRow["assignments"][number];
  removable?: boolean;
}) {
  return (
    <form
      action={removeUserSiteAssignment}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#ecd9a0] bg-[#fbf3dc] px-2.5 py-0.5 text-[11px] font-bold text-[#7a5608]"
    >
      <input type="hidden" name="assignment_id" value={assignment.id} />
      <span>
        {assignment.siteName} · {assignment.roleLabel}
      </span>
      {removable && (
        <SubmitIconButton
          className="text-[#7a5608]/60 hover:text-red-600"
          aria-label={`Remove ${assignment.siteName} · ${assignment.roleLabel}`}
        >
          ×
        </SubmitIconButton>
      )}
    </form>
  );
}

/** Confirm-and-delete body of the delete panel; closes it once the delete is done. */
function DeleteUserPanel({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [, action, isPending] = useActionState(async (_prev: null, formData: FormData) => {
    await deleteUser(formData);
    onDone();
    return null;
  }, null);

  return (
    <form action={action} className="flex flex-1 flex-col">
      <input type="hidden" name="user_id" value={userId} />
      <p className="p-5 text-sm text-[#4b5563]">
        They&apos;ll be signed out and won&apos;t be able to sign in again. If they have
        orders, receipts, approvals or releases, their name stays on those records. This
        can&apos;t be undone.
      </p>
      <div className="mt-auto flex gap-3 border-t border-brand-border-soft p-5">
        <Button type="button" variant="secondary" onClick={onDone} autoFocus className="flex-1">
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={isPending} className="flex-1">
          {isPending ? "Deleting…" : "Yes, delete"}
        </Button>
      </div>
    </form>
  );
}

function RowMenu({
  items,
}: {
  items: { label: string; onClick: () => void; danger?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (items.length === 0) return <span className="w-8" />;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Actions"
        className={`flex h-8 w-8 items-center justify-center rounded-lg border text-base leading-none text-brand-navy hover:bg-brand-content ${
          open ? "border-brand-navy bg-brand-content" : "border-brand-border bg-white"
        }`}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1.5 min-w-[170px] overflow-hidden rounded-xl border border-brand-border bg-white py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`block w-full px-4 py-2 text-left text-sm hover:bg-brand-content ${
                item.danger ? "text-red-700" : "text-brand-navy"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const GRID = "md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,2fr)_32px]";

export function UsersTable({
  users,
  sites,
  roles,
  meId,
}: {
  users: UserRow[];
  sites: { id: string; name: string }[];
  roles: { value: string; label: string }[];
  meId: string;
}) {
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const close = useCallback(() => setPanel(null), []);

  const q = query.trim().toLowerCase();
  const visible = q
    ? users.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          (u.email?.toLowerCase().includes(q) ?? false) ||
          u.assignments.some(
            (a) => a.siteName.toLowerCase().includes(q) || a.roleLabel.toLowerCase().includes(q),
          ),
      )
    : users;

  const panelUser = panel && panel.kind !== "create" ? users.find((u) => u.id === panel.userId) : null;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-navy">Users</h1>
          <p className="text-[#6b7280]">Create logins and assign each person to their site(s) and role.</p>
        </div>
        <button
          type="button"
          onClick={() => setPanel({ kind: "create" })}
          className="rounded-full bg-brand-navy px-5 py-2.5 text-sm font-bold text-brand-gold-text shadow-[0_6px_14px_-6px_rgba(15,26,51,0.5)] hover:bg-brand-navy-2"
        >
          + Create login
        </button>
      </div>

      <section className="rounded-2xl border border-brand-border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border-soft p-3">
          <div className="relative w-full sm:max-w-sm">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7b8494]"
            >
              <circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="1.6" />
              <path d="M13.5 13.5 17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email or site…"
              aria-label="Search users by name, email or site"
              className="w-full rounded-[10px] border border-brand-input-border bg-white py-2 pl-9 pr-3.5 text-sm text-brand-navy placeholder:text-gray-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
            />
          </div>
          <p className="text-xs text-[#7b8494]">
            {users.length} user{users.length === 1 ? "" : "s"}
          </p>
        </div>

        <div
          className={`hidden gap-4 border-b border-brand-border-soft bg-brand-cream px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f] md:grid ${GRID}`}
        >
          <div>Name</div>
          <div>Login email</div>
          <div>Sites &amp; roles</div>
          <div />
        </div>

        <div className="divide-y divide-brand-border-soft">
          {visible.map((u) => {
            const isMe = u.id === meId;
            const menu = [
              ...(!u.isAdmin
                ? [{ label: "Assign site", onClick: () => setPanel({ kind: "assign", userId: u.id }) }]
                : []),
              ...(!isMe && u.isActive
                ? [{ label: "Reset password", onClick: () => setPanel({ kind: "reset", userId: u.id }) }]
                : []),
              ...(!isMe
                ? [
                    {
                      label: "Delete user",
                      danger: true,
                      onClick: () => setPanel({ kind: "delete", userId: u.id }),
                    },
                  ]
                : []),
            ];

            return (
              <div
                key={u.id}
                className={`grid grid-cols-[minmax(0,1fr)_32px] items-center gap-x-4 gap-y-2 px-4 py-3 ${GRID} ${
                  u.isActive ? "" : "opacity-60"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-navy text-[11px] font-bold text-brand-gold-light">
                    {initials(u.fullName)}
                  </span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-brand-navy">
                      {u.fullName}
                      {isMe && <span className="font-normal text-[#7b8494]"> (you)</span>}
                    </p>
                    {(u.mustChangePassword || !u.isActive) && (
                      <p className="flex flex-wrap gap-1">
                        {u.mustChangePassword && (
                          <span className="rounded-full bg-[#fbf3dc] px-2 py-0.5 text-[10px] font-bold text-[#7a5608]">
                            On temporary password
                          </span>
                        )}
                        {!u.isActive && (
                          <span className="rounded-full bg-[#d3cbb9] px-2 py-0.5 text-[10px] font-bold text-[#4b5563]">
                            Inactive
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <p className="col-start-1 break-all text-[13px] text-[#4b5563] md:col-start-auto">
                  {u.email}
                </p>

                <div className="col-start-1 flex flex-wrap items-center gap-1.5 md:col-start-auto">
                  {u.isAdmin ? (
                    <span className="rounded-full bg-brand-navy px-2.5 py-0.5 text-[11px] font-bold text-brand-gold-text">
                      Admin — all sites
                    </span>
                  ) : (
                    <>
                      {u.assignments.map((a) => (
                        <AccessChip key={a.id} assignment={a} />
                      ))}
                      <button
                        type="button"
                        onClick={() => setPanel({ kind: "assign", userId: u.id })}
                        className="rounded-full border border-dashed border-brand-border px-2.5 py-0.5 text-[11px] font-bold text-brand-navy hover:bg-brand-content"
                      >
                        + Assign
                      </button>
                    </>
                  )}
                </div>

                <div className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto">
                  <RowMenu items={menu} />
                </div>
              </div>
            );
          })}

          {users.length === 0 && (
            <p className="p-8 text-center text-[#7b8494]">No users yet — create the first login.</p>
          )}
          {users.length > 0 && visible.length === 0 && (
            <p className="p-8 text-center text-[#7b8494]">No users match “{query}”.</p>
          )}
        </div>

        <p className="rounded-b-2xl border-t border-brand-border-soft px-4 py-2.5 text-xs text-[#7b8494]">
          {q ? `Showing ${visible.length} of ${users.length} users` : `${users.length} user${users.length === 1 ? "" : "s"}`}
        </p>
      </section>

      {panel?.kind === "create" && (
        <Drawer title="Create a login" subtitle="New user" onClose={close}>
          <CreateUserForm onSuccess={close} />
        </Drawer>
      )}

      {panel?.kind === "assign" && panelUser && (
        <Drawer title="Assign site & role" subtitle={panelUser.fullName} onClose={close}>
          <div className="px-5 pt-5">
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[#6b6553]">
              Current access
            </p>
            <div className="flex flex-wrap gap-1.5">
              {panelUser.assignments.map((a) => (
                <AccessChip key={a.id} assignment={a} />
              ))}
              {panelUser.assignments.length === 0 && (
                <span className="text-xs text-[#7b8494]">No sites assigned yet.</span>
              )}
            </div>
          </div>
          <form action={assignUserToSite} className="flex flex-1 flex-col">
            <input type="hidden" name="user_id" value={panelUser.id} />
            <div className="flex flex-col gap-4 p-5">
              <Select label="Site" name="site_id" required defaultValue="">
                <option value="" disabled>
                  Choose a site
                </option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select label="Role" name="role" required defaultValue="">
                <option value="" disabled>
                  Choose a role
                </option>
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="mt-auto border-t border-brand-border-soft p-5">
              <SubmitButton fullWidth pendingText="Assigning…">
                Assign
              </SubmitButton>
            </div>
          </form>
        </Drawer>
      )}

      {panel?.kind === "reset" && panelUser && (
        <Drawer title="Reset password" subtitle={panelUser.fullName} onClose={close}>
          <ResetPasswordForm userId={panelUser.id} fullName={panelUser.fullName} onSuccess={close} />
        </Drawer>
      )}

      {panel?.kind === "delete" && panelUser && (
        <Drawer title={`Delete ${panelUser.fullName}?`} subtitle={panelUser.email ?? undefined} onClose={close}>
          <DeleteUserPanel userId={panelUser.id} onDone={close} />
        </Drawer>
      )}
    </>
  );
}
