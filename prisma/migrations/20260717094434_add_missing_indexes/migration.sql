-- CreateIndex
CREATE INDEX "BusinessInvite_email_idx" ON "BusinessInvite"("email");

-- CreateIndex
CREATE INDEX "BusinessMember_userId_idx" ON "BusinessMember"("userId");

-- CreateIndex
CREATE INDEX "Transaction_businessId_date_idx" ON "Transaction"("businessId", "date");
