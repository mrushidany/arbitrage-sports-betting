-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "home" TEXT NOT NULL,
    "away" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "kickoff" DATETIME NOT NULL,
    "profitPct" REAL NOT NULL,
    "totalStake" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "winningOutcome" TEXT,
    "realizedPnl" REAL,
    "settledAt" DATETIME,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "BetLeg" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "betId" TEXT NOT NULL,
    "bookmaker" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "odds" REAL NOT NULL,
    "stake" REAL NOT NULL,
    CONSTRAINT "BetLeg_betId_fkey" FOREIGN KEY ("betId") REFERENCES "Bet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BetLeg_betId_idx" ON "BetLeg"("betId");
