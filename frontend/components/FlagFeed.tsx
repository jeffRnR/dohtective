import { type FlagItem } from "../lib/types";
import { AlertTriangle, AlertCircle, AlertOctagon } from "lucide-react";

export default function FlagFeed({ flags }: { flags: FlagItem[] }) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "border-red-500/30 bg-red-500/10";
      case "medium":
        return "border-amber-500/30 bg-amber-500/10";
      default:
        return "border-blue-500/30 bg-blue-500/10";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "high":
        return <AlertOctagon className="w-5 h-5 text-red-400" />;
      case "medium":
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      default:
        return <AlertCircle className="w-5 h-5 text-blue-400" />;
    }
  };

  return (
    <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-6 backdrop-blur-sm">
      <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-red-400" />
        Risk Alerts
      </h2>
      <p className="text-gray-900/60 text-sm mt-1">Issues that need your attention</p>

      {flags.length === 0 ? (
        <div className="mt-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4">
          <p className="text-emerald-700 text-sm">✓ No risk flags detected this period.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {flags.map((flag, idx) => (
            <div key={idx} className={`border rounded-lg p-4 ${getSeverityColor(flag.severity)}`}>
              <div className="flex gap-3">
                {getSeverityIcon(flag.severity)}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{flag.title}</h3>
                  <p className="text-gray-900/80 text-sm mt-1">{flag.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
