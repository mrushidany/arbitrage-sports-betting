-- CreateTable
CREATE TABLE "ScanStat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedFixtures" INTEGER NOT NULL,
    "tradableMarkets" INTEGER NOT NULL,
    "arbCount" INTEGER NOT NULL,
    "tightestImplied" REAL,
    "under101" INTEGER NOT NULL,
    "under102" INTEGER NOT NULL,
    "under103" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "ScanStat_createdAt_idx" ON "ScanStat"("createdAt");
