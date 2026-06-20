import { type FollowupWorkflowItem } from "../lib/types";
import { CheckSquare, UserCheck, Briefcase } from "lucide-react";

export default function FollowupWorkflow({ items }: { items: FollowupWorkflowItem[] }) {
  const getRoleIcon = (role: string) => {
    switch (role) {
      case "founder":
        return <UserCheck className="w-4 h-4" />;
      case "accountant":
        return <Briefcase className="w-4 h-4" />;
      default:
        return <CheckSquare className="w-4 h-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "founder":
        return "bg-cyan-500/10 border-cyan-500/30 text-cyan-300";
      case "accountant":
        return "bg-purple-500/10 border-purple-500/30 text-purple-300";
      default:
        return "bg-blue-500/10 border-blue-500/30 text-blue-300";
    }
  };

  return (
    <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-6 backdrop-blur-sm">
      <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <CheckSquare className="w-5 h-5 text-cyan-400" />
        Follow-up Workflow
      </h2>
      <p className="text-gray-900/60 text-sm mt-1">Action items for your team this month</p>
      
      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <p className="text-gray-900/60 text-sm">No follow-up items needed.</p>
        ) : (
          items.map((item, idx) => (
            <div key={item.title} className="flex gap-3">
              <div className="flex-shrink-0 flex items-center">
                <div className="w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-semibold text-gray-900">
                  {idx + 1}
                </div>
              </div>
              <div className="flex-1 pt-0.5">
                <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
                <p className="text-gray-900/80 text-sm mt-1">{item.action}</p>
                <div className={`inline-flex items-center gap-1 mt-2 px-2 py-1 rounded text-xs font-medium border ${getRoleColor(item.role)}`}>
                  {getRoleIcon(item.role)}
                  <span className="capitalize">{item.role}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
