import { type ZohoPayload } from "../lib/types";
import { Zap, ChevronDown } from "lucide-react";

export default function AnomalyExplorer({
  anomalies,
}: {
  anomalies: ZohoPayload["report"]["anomaly_transactions"];
}) {
  return (
    <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-6 backdrop-blur-sm">
      <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <Zap className="w-5 h-5 text-amber-400" />
        Anomaly Explorer
      </h2>
      <p className="text-gray-900/60 text-sm mt-1">Click to review transaction details and reasons for flagging</p>

      {anomalies.length === 0 ? (
        <div className="mt-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4">
          <p className="text-emerald-700 text-sm">✓ No anomalies detected in this period.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {anomalies.slice(0, 5).map((anomaly) => (
            <details key={anomaly.transaction_id} className="group">
              <summary className="cursor-pointer flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition">
                <ChevronDown className="w-4 h-4 text-gray-900/60 group-open:rotate-180 transition" />
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 text-sm">{anomaly.anomaly_type}</p>
                  <p className="text-gray-900/60 text-xs">
                    KES {anomaly.amount.toLocaleString()} • {anomaly.date}
                  </p>
                </div>
              </summary>
              <div className="mt-2 ml-8 space-y-2 text-sm text-gray-900/80 border-l border-white/10 pl-4">
                <p className="font-semibold text-gray-900">Transaction ID: {anomaly.transaction_id}</p>
                <p className="text-amber-300">{anomaly.reason}</p>
                <div className="grid grid-cols-2 gap-2 text-xs mt-3">
                  <div>
                    <span className="text-gray-900/60">Branch:</span>
                    <p className="text-gray-900">{anomaly.branch}</p>
                  </div>
                  <div>
                    <span className="text-gray-900/60">Date:</span>
                    <p className="text-gray-900">{anomaly.date}</p>
                  </div>
                  <div>
                    <span className="text-gray-900/60">Description:</span>
                    <p className="text-gray-900">{anomaly.description}</p>
                  </div>
                  <div>
                    <span className="text-gray-900/60">Contact:</span>
                    <p className="text-gray-900">{anomaly.contact_name}</p>
                  </div>
                  <div>
                    <span className="text-gray-900/60">Category:</span>
                    <p className="text-gray-900">{anomaly.category_name}</p>
                  </div>
                  <div>
                    <span className="text-gray-900/60">Method:</span>
                    <p className="text-gray-900">{anomaly.payment_method}</p>
                  </div>
                </div>
                <div className="mt-2 p-2 bg-white/5 rounded border border-white/10">
                  <p className="text-xs text-gray-900/60">Status: {anomaly.is_reconciled ? "✓ Reconciled" : "⚠ Unreconciled"}</p>
                </div>
              </div>
            </details>
          ))}

          {anomalies.length > 5 && (
            <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center text-xs text-gray-900/60">
              Showing 5 of {anomalies.length} anomalies
            </div>
          )}
        </div>
      )}
    </div>
  );
}
