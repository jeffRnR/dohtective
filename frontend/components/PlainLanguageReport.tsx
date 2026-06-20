import { type ReportData } from "../lib/types";
import { Lightbulb } from "lucide-react";

export default function PlainLanguageReport({ report }: { report: ReportData | null }) {
  return (
    <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-6 backdrop-blur-sm">
      <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-cyan-400" />
        Monthly Summary
      </h2>
      <div className="mt-5 space-y-4 text-sm leading-7 text-gray-900/90">
        {report ? (
          report.plain_language.map((sentence, index) => (
            <p key={index} className="flex gap-3">
              <span className="text-cyan-400/60 mt-0.5">→</span>
              <span>{sentence}</span>
            </p>
          ))
        ) : (
          <p className="text-gray-900/60">Connect to Zoho Books and select your business to see a founder-friendly summary.</p>
        )}
      </div>
    </div>
  );
}
