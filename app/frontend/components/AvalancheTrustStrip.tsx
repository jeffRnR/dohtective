export default function AvalancheTrustStrip() {
  return (
    <div
      className="flex h-full flex-col justify-between rounded-[var(--radius-lg)] border p-6"
      style={{ borderColor: "var(--line)", background: "var(--avax-violet-dim)" }}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--avax-violet)" }}>
            Trust layer
          </p>
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{ background: "white", color: "var(--avax-violet)" }}
          >
            Designed, not yet live
          </span>
        </div>
        <h3 className="font-display mt-2 text-lg font-bold" style={{ color: "var(--ink)" }}>
          Flags you can't quietly delete
        </h3>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink)" }}>
          Every flag this system raises will be hashed and anchored on Avalanche - so the record
          of when something was caught can't be backdated or erased later, by us or anyone else.
        </p>
      </div>
      <div className="mt-5 flex items-center gap-2 font-mono text-[11px]" style={{ color: "var(--avax-violet)" }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--avax-violet)" }} />
        Avalanche Fuji testnet - anchoring not yet active
      </div>
    </div>
  );
}
