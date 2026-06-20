import { Org } from "../lib/types";
import { CheckCircle2, TrendingUp, AlertCircle, Zap } from "lucide-react";

interface LandingPageProps {
  orgs: Org[];
  loading: boolean;
  onSelectOrg: (slug: string) => void;
  error: string | null;
  connected: boolean;
  onRefresh: () => void;
}

export default function LandingPage({
  orgs,
  loading,
  onSelectOrg,
  error,
  connected,
  onRefresh,
}: LandingPageProps) {
  return (
    <div className="min-h-screen bg-gary-500">
      {/* Navigation */}
      <nav className="border-b border-white/10 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gray-900/20 backdrop-blur-md flex items-center justify-center">
              <Zap className="w-6 h-6 text-gray-800" />
            </div>
            <span className="text-2xl font-bold text-gray-900">Dohtective</span>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-gray-900/10  text-gray-900 text-sm font-medium hover:bg-gray-900/20 transition disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-2 items-center">
          {/* Left side - Value prop */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Restaurant Finance, Simplified
              </h1>
              <p className="text-xl text-gray-900/80 leading-relaxed">
                Connect your Zoho Books and get instant insights into cash flow, suspicious transactions, and exactly what needs fixing this month.
              </p>
            </div>

            {/* Features */}
            <div className="space-y-4">
              {[
                { icon: TrendingUp, text: "Real-time cash flow analysis" },
                { icon: AlertCircle, text: "Fraud & anomaly detection" },
                { icon: CheckCircle2, text: "Actionable next steps" },
              ].map((feature, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <feature.icon className="w-6 h-6 text-emerald-700" />
                  <span className="text-gray-900 text-lg">{feature.text}</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/20 border border-red-400/50 p-4">
                <p className="text-gray-700 text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Right side - Business selector */}
          <div className="bg-gray-900/10 backdrop-blur-md rounded-2xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {connected ? "Select a Business" : "Available Businesses"}
            </h2>

            {!connected && orgs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-900/60 mb-4">No businesses found. Create your first one to get started.</p>
                <button className="px-6 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-gray-900 font-semibold transition w-full">
                  + Create New Business
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {orgs.map((org) => (
                  <button
                    key={org.slug}
                    onClick={() => onSelectOrg(org.slug)}
                    disabled={loading}
                    className="w-full text-left p-4 rounded-lg bg-gray-900/5 hover:bg-gray-900/10 border border-white/10 hover:border-white/30 transition disabled:opacity-50 group"
                  >
                    <p className="font-semibold text-gray-900 group-hover:text-emerald-700 transition">
                      {org.company_name}
                    </p>
                    <p className="text-sm text-gray-900/60 mt-1">
                      {org.branch_count} branches • {org.slug}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-white/10">
              <p className="text-sm text-gray-900/60 mb-3">Don't see your business?</p>
              <button className="px-6 py-2 rounded-lg bg-gray-900/10 hover:bg-gray-900/20 text-gray-900 font-medium transition text-sm w-full">
                + Add New Business
              </button>
            </div>
          </div>
        </div>

        {/* Stats section */}
        <div className="mt-20 grid md:grid-cols-3 gap-6">
          {[
            { number: "500+", label: "Restaurants Using Dohtective" },
            { number: "$2M+", label: "Fraud Detected Monthly" },
            { number: "95%", label: "Cash Flow Accuracy" },
          ].map((stat, idx) => (
            <div
              key={idx}
              className="bg-gray-900/10 backdrop-blur-md rounded-xl p-6 border border-white/20 text-center"
            >
              <p className="text-4xl font-bold text-emerald-700">{stat.number}</p>
              <p className="text-gray-900/80 mt-2">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-20 text-center text-gray-900/60 text-sm">
          <p>Made for restaurant founders and accountants who care about accuracy.</p>
        </div>
      </main>
    </div>
  );
}
