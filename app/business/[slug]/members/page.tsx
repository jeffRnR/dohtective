// app/business/[slug]/members/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Loader from "../../../frontend/components/Loader";

type Member = {
  id: string;
  role: string;
  user: { id: string; name: string | null; email: string | null; image: string | null };
};
type PendingInvite = { id: string; email: string; role: string };

export default function MembersPage() {
  const params = useParams();
  const slug = String(params.slug);

  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("accountant");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addNote, setAddNote] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/businesses/${slug}/members`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load members.");
      setMembers(data.members ?? []);
      setPendingInvites(data.pendingInvites ?? []);
      setMyRole(data.myRole ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    setAddNote(null);
    try {
      const res = await fetch(`/api/businesses/${slug}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add this person.");

      if (data.status === "invited") {
        setAddNote(
          `${email} doesn't have an account yet. They'll automatically get access the moment ` +
          `they sign up with this exact email. ${!data.emailSent ? "(No invite email sent yet - that's not built yet, see project notes.)" : ""}`
        );
      } else {
        setAddNote(`${email} now has access as ${role}.`);
      }
      setEmail("");
      load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setAdding(false);
    }
  }

  if (loading) return <Loader fullPage label="Loading members..." />;

  if (error) {
    return (
      <div className="rounded-[var(--radius-lg)] border p-6 text-sm font-medium" style={{ borderColor: "var(--clay)", background: "var(--clay-dim)", color: "var(--clay)" }}>
        {error}
      </div>
    );
  }

  // Mirrors the server's own check in app/api/businesses/[slug]/members/route.ts
  // - only a founder can add members. Using the API's reported myRole
  // directly, not inferring it from the member list (which was a real
  // bug in an earlier version of this file: checking "does ANY member
  // have role founder" instead of "is the CURRENT user a founder").
  const canAdd = myRole === "founder";

  return (
    <div className="space-y-5">
      <div className="rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "white" }}>
        <h2 className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>Who has access</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--sage)" }}>
          Only people listed here can see this business - nobody else, even if signed in.
        </p>

        <div className="mt-4 space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-[var(--radius-md)] border p-3" style={{ borderColor: "var(--line)" }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{m.user.name ?? m.user.email}</p>
                <p className="text-xs" style={{ color: "var(--sage)" }}>{m.user.email}</p>
              </div>
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ background: "var(--bone-dim)", color: "var(--sage)" }}>
                {m.role}
              </span>
            </div>
          ))}
        </div>

        {pendingInvites.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--marigold)" }}>Pending - not signed up yet</p>
            <div className="mt-2 space-y-2">
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-[var(--radius-md)] border border-dashed p-3" style={{ borderColor: "var(--line)" }}>
                  <p className="text-sm" style={{ color: "var(--ink)" }}>{inv.email}</p>
                  <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ background: "var(--marigold-dim)", color: "var(--marigold)" }}>
                    {inv.role} - pending
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {canAdd ? (
        <div className="rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "white" }}>
          <h2 className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>Add someone</h2>
          <p className="mt-1 text-sm leading-6" style={{ color: "var(--sage)" }}>
            Add your accountant or anyone else who should see this business. If they don't have an
            account yet, they'll get access automatically the moment they sign up with this email -
            no invite email is sent yet, this just reserves their access.
          </p>

          <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              placeholder="their@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
              style={{ borderColor: "var(--line)", color: "var(--ink)", background: "white" }}
            >
              <option value="accountant">Accountant</option>
              <option value="founder">Founder</option>
              <option value="reviewer">Reviewer</option>
            </select>
            <button
              type="submit"
              disabled={adding}
              className="font-display rounded-[var(--radius-md)] px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-white transition disabled:cursor-not-allowed"
              style={{ background: adding ? "var(--sage)" : "var(--savanna)" }}
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </form>

          {addError ? <p className="mt-3 text-sm font-medium" style={{ color: "var(--clay)" }}>{addError}</p> : null}
          {addNote ? <p className="mt-3 text-sm leading-5" style={{ color: "var(--savanna)" }}>{addNote}</p> : null}
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border p-5" style={{ borderColor: "var(--line)", background: "var(--bone-dim)" }}>
          <p className="text-sm" style={{ color: "var(--sage)" }}>
            Only a founder can add new members to this business.
          </p>
        </div>
      )}
    </div>
  );
}
