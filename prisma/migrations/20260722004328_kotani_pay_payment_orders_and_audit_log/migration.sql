-- AlterTable
ALTER TABLE "User" ADD COLUMN     "kotaniCustomerKey" TEXT;

-- CreateTable
CREATE TABLE "KotaniPaymentOrder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "creditsToGrant" INTEGER NOT NULL,
    "amountKes" INTEGER NOT NULL,
    "kotaniReferenceId" TEXT,
    "customerKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "depositStatus" TEXT,
    "onchainStatus" TEXT,
    "transactionHash" TEXT,
    "cryptoAmountUsdc" DOUBLE PRECISION,
    "rateId" TEXT,
    "rateValue" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "ipAddress" TEXT,

    CONSTRAINT "KotaniPaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KotaniAuditLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KotaniAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KotaniPaymentOrder_kotaniReferenceId_key" ON "KotaniPaymentOrder"("kotaniReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "KotaniPaymentOrder_transactionHash_key" ON "KotaniPaymentOrder"("transactionHash");

-- CreateIndex
CREATE INDEX "KotaniPaymentOrder_businessId_idx" ON "KotaniPaymentOrder"("businessId");

-- CreateIndex
CREATE INDEX "KotaniPaymentOrder_userId_idx" ON "KotaniPaymentOrder"("userId");

-- CreateIndex
CREATE INDEX "KotaniPaymentOrder_status_expiresAt_idx" ON "KotaniPaymentOrder"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "KotaniPaymentOrder_kotaniReferenceId_idx" ON "KotaniPaymentOrder"("kotaniReferenceId");

-- CreateIndex
CREATE INDEX "KotaniAuditLog_orderId_idx" ON "KotaniAuditLog"("orderId");

-- CreateIndex
CREATE INDEX "KotaniAuditLog_createdAt_idx" ON "KotaniAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "KotaniPaymentOrder" ADD CONSTRAINT "KotaniPaymentOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KotaniPaymentOrder" ADD CONSTRAINT "KotaniPaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KotaniAuditLog" ADD CONSTRAINT "KotaniAuditLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "KotaniPaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
