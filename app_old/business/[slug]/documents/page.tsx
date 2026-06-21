// app/business/[slug]/documents/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import DocumentUploadStep from "../../../frontend/components/DocumentUploadStep";

export default function DocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const slug = String(params.slug);

  return (
    <div className="space-y-5">
      <DocumentUploadStep onSkip={() => router.push(`/business/${slug}`)} />
    </div>
  );
}