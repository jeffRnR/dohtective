-- CreateTable
CREATE TABLE "GoogleSheetsConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleSheetsConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleSheetsConnection_userId_key" ON "GoogleSheetsConnection"("userId");

-- AddForeignKey
ALTER TABLE "GoogleSheetsConnection" ADD CONSTRAINT "GoogleSheetsConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
