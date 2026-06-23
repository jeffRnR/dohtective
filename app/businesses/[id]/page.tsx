"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

// The 5 expected documents your system handles
type DocumentKind = "mpesa" | "kra_pin" | "bank" | "etims" | "incorporation";

interface UploadedDoc {
  id: string;
  kind: DocumentKind;
  name: string;
}

export default function BusinessDashboardPage() {
  // Pulls the dynamic [id] straight from the URL path (/businesses/123 -> id = "123")
  const params = useParams();
  const businessId = params.id as string;

  const [zohoConnected, setZohoConnected] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [reviewData, setReviewData] = useState<any>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Trigger data synchronization when the page mounts or the business changes
  useEffect(() => {
    if (!businessId) return;
    
    async function fetchInitialState() {
      try {
        // Fetch current onboarding states (Is Zoho linked? What PDFs are already in storage?)
        const res = await fetch(`http://localhost:8000/businesses/${businessId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        
        setZohoConnected(data.zohoConnected);
        setUploadedDocs(data.uploadedDocs || []);
        if (data.latestReport) {
          setReviewData(data.latestReport);
        }
      } catch (err) {
        console.error("Failed to load business profile state:", err);
      }
    }

    fetchInitialState();
  }, [businessId]);

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>, kind: DocumentKind) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("document_kind", kind);
    formData.append("business_id", businessId);

    try {
      // Step 1: Fire off file payload to file system / S3 bucket
      const uploadRes = await fetch("http://localhost:8000/documents/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const uploadData = await uploadRes.json();

      setUploadedDocs((prev) => [...prev, { id: uploadData.id, kind, name: file.name }]);

      // Step 2: IMMEDIATE TRIGGER — Force python processing script to run with current files
      setIsEvaluating(true);
      const evaluationRes = await fetch(`http://localhost:8000/analyze/evaluate-business/${businessId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggered_by_doc: kind })
      });

      if (!evaluationRes.ok) throw new Error("Re-evaluation engine failed");
      const latestReview = await evaluationRes.json();

      // Step 3: Populate review card with fresh calculations
      setReviewData(latestReview.report);

    } catch (err) {
      console.error("Pipeline breakdown:", err);
      alert("Something broke along the document parsing pipeline.");
    } finally {
      setIsUploading(false);
      setIsEvaluating(false);
    }
  };

  const hasActiveReview = zohoConnected || reviewData !== null;

  return (
    <div className="space-y-8 p-6 max-w-5xl mx-auto min-h-screen" style={{ background: "var(--bone)" }}>
      {/* Top Controller Bar */}
      <div className="border-b pb-4 flex justify-between items-center" style={{ borderColor: "var(--line)" }}>
        <div>
          <h1 className="text-2xl font-bold font-display" style={{ color: "var(--ink)" }}>Financial Controller Terminal</h1>
          <p className="text-sm mt-1" style={{ color: "var(--sage)" }}>
            Current Focus ID: <span className="font-mono bg-white px-1.5 py-0.5 border rounded text-xs text-gray-700">{businessId}</span>
          </p>
        </div>
        {isEvaluating && (
          <span className="animate-pulse bg-amber-100 text-amber-800 text-xs px-3 py-1 rounded-full font-semibold">
            AI Engine running re-evaluation...
          </span>
        )}
      </div>

      <div className="grid gap-8 md:grid-cols-[1fr_350px]">
        {/* INSIGHTS DISPLAY PANEL */}
        <div className="space-y-6">
          {hasActiveReview ? (
            <div className="rounded-[var(--radius-lg)] border p-6 bg-white shadow-sm" style={{ borderColor: "var(--line)" }}>
              <h2 className="font-display text-xl font-bold mb-4" style={{ color: "var(--ink)" }}>Latest Engine Insights</h2>
              
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--sage)" }}>Calculated Cash Buffer</p>
                <p className="font-display text-4xl font-bold mt-1" style={{ color: "var(--savanna)" }}>
                  {reviewData?.cash_buffer?.buffer_days ?? "Calculating..."} <span className="text-2xl font-normal">days</span>
                </p>
              </div>

              <div className="space-y-3">
                {reviewData?.flags?.map((flag: any, index: number) => (
                  <div key={index} className="flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3" style={{ background: "var(--marigold-dim)" }}>
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--marigold)" }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{flag.title}</p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--sage)" }}>{flag.detail}</p>
                    </div>
                  </div>
                )) ?? (
                  <p className="text-sm italic" style={{ color: "var(--sage)" }}>Processing document vectors... updating live views.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-[var(--radius-lg)] border border-dashed p-12 text-center bg-white" style={{ borderColor: "var(--line)" }}>
              <p className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>No Active Evaluation Active</p>
              <p className="text-sm mt-2 max-w-sm mx-auto" style={{ color: "var(--sage)" }}>
                Connect your backend stream to Zoho Books or upload an M-Pesa statement in the management block to run your first automated risk assessment.
              </p>
            </div>
          )}
        </div>

        {/* SIDE MANAGEMENT BLOCK */}
        <div className="space-y-6">
          <div className="rounded-[var(--radius-lg)] border p-5 bg-white shadow-sm" style={{ borderColor: "var(--line)" }}>
            <h3 className="font-display text-sm font-bold uppercase tracking-wider mb-3" style={{ color: "var(--ink)" }}>Primary Connection</h3>
            {zohoConnected ? (
              <div className="text-xs bg-emerald-50 text-emerald-800 p-3 rounded font-medium border border-emerald-200">
                ✓ Synced live with Zoho Books
              </div>
            ) : (
              <button 
                onClick={() => setZohoConnected(true)} 
                className="w-full font-display py-2.5 px-4 text-xs font-bold uppercase rounded-[var(--radius-md)] text-white transition text-center block"
                style={{ background: "var(--savanna)" }}
              >
                Connect Zoho Books
              </button>
            )}
          </div>

          <div className="rounded-[var(--radius-lg)] border p-5 bg-white shadow-sm space-y-4" style={{ borderColor: "var(--line)" }}>
            <div>
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-gray-800">Verification Files</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--sage)" }}>Uploading triggers recalculation routines.</p>
            </div>

            <div className="space-y-3 pt-2">
              {(["mpesa", "kra_pin", "bank", "etims", "incorporation"] as DocumentKind[]).map((kind) => {
                const existing = uploadedDocs.find((d) => d.kind === kind);
                
                return (
                  <div key={kind} className="p-3 border rounded-[var(--radius-md)] text-xs bg-slate-50 flex flex-col gap-1">
                    <div className="flex justify-between items-center font-semibold text-gray-700 capitalize">
                      <span>{kind.replace("_", " ")}</span>
                      {existing ? (
                        <span className="text-emerald-600">Loaded ✓</span>
                      ) : (
                        <span className="text-gray-400 font-normal">Empty</span>
                      )}
                    </div>
                    
                    {existing ? (
                      <p className="text-[10px] text-gray-500 truncate mt-0.5">{existing.name}</p>
                    ) : (
                      <input 
                        type="file" 
                        accept=".pdf" 
                        disabled={isUploading || isEvaluating}
                        onChange={(e) => handleDocumentUpload(e, kind)}
                        className="mt-1 block w-full text-[11px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-slate-200 file:text-slate-700 cursor-pointer"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}