-- CreateTable
CREATE TABLE "AnalysisSchedule" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunError" TEXT,
    "additionalEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisSchedule_businessId_key" ON "AnalysisSchedule"("businessId");

-- CreateIndex
CREATE INDEX "AnalysisSchedule_status_nextRunAt_idx" ON "AnalysisSchedule"("status", "nextRunAt");

-- AddForeignKey
ALTER TABLE "AnalysisSchedule" ADD CONSTRAINT "AnalysisSchedule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
