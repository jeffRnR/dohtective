-- CreateTable
CREATE TABLE "FlagResponse" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "flagTitle" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlagResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlagResponse_businessId_idx" ON "FlagResponse"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FlagResponse_businessId_flagTitle_key" ON "FlagResponse"("businessId", "flagTitle");

-- AddForeignKey
ALTER TABLE "FlagResponse" ADD CONSTRAINT "FlagResponse_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
