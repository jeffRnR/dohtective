"use client";

import { useParams, useRouter } from "next/navigation";
import DocumentUploadStep from "../../../frontend/components/DocumentUploadStep";

export default function DocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const slug = String(params.slug);

  return (
    <div className="space-y-5">
      <div className="flex justify-start pt-2">
        <button
          onClick={() => router.push(`/business/${slug}`)}
          className="group flex items-center gap-2 text-xs font-bold uppercase tracking-[0.06em] opacity-60 hover:opacity-100 transition"
          style={{ color: "var(--ink)" }}
        >
          <span className="transform transition-transform group-hover:-translate-x-1">←</span>
          Back to Dashboard
        </button>
      </div>
      <DocumentUploadStep
        slug={slug}
        onSkip={() => router.push(`/business/${slug}`)}
      />
    </div>
  );
}