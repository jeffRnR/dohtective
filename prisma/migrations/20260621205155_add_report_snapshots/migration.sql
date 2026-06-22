-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "cashBufferDays" INTEGER NOT NULL,
    "cashBufferRiskLevel" TEXT NOT NULL,
    "totalCashInflows" DOUBLE PRECISION NOT NULL,
    "totalCashOutflows" DOUBLE PRECISION NOT NULL,
    "mixedFundsCount" INTEGER NOT NULL,
    "mixedFundsTotal" DOUBLE PRECISION NOT NULL,
    "flagsJson" JSONB NOT NULL,
    "plainLanguageJson" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportSnapshot_businessId_generatedAt_idx" ON "ReportSnapshot"("businessId", "generatedAt");

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
