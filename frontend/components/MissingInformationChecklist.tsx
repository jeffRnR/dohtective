import { type ReportData } from "../lib/types";
import { Clipboard, CheckCircle2 } from "lucide-react";

export default function MissingInformationChecklist({ report }: { report: ReportData | null }) {
  return (
    <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-6 backdrop-blur-sm">
      <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <Clipboard className="w-5 h-5 text-emerald-400" />
        Checklist
      </h2>
      <p className="text-gray-900/60 text-sm mt-1">Items to follow up on</p>

      <div className="mt-5 space-y-3">
        {report ? (
          report.missing_information_checklist.length > 0 ? (
            report.missing_information_checklist.map((item, idx) => (
              <label key={item} className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 cursor-pointer group">
                <input type="checkbox" className="mt-1 w-4 h-4 rounded border-white/30 accent-emerald-400" />
                <span className="text-gray-900/80 text-sm group-hover:text-gray-900">{item}</span>
              </label>
            ))
          ) : (
            <div className="text-center py-4">
              <p className="text-emerald-700 text-sm flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                All set for this period
              </p>
            </div>
          )
        ) : (
          <p className="text-gray-900/60 text-sm">Connect a business to see the checklist.</p>
        )}
      </div>
    </div>
  );
}
