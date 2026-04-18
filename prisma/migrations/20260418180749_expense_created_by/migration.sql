/*
  Warnings:

  - Added the required column `createdById` to the `Expense` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: add column as nullable, backfill from first ExpensePayer, then enforce NOT NULL
ALTER TABLE "Expense" ADD COLUMN     "createdById" TEXT;

UPDATE "Expense" e
SET "createdById" = (
    SELECT p."userId"
    FROM "ExpensePayer" p
    WHERE p."expenseId" = e."id"
    ORDER BY p."id" ASC
    LIMIT 1
)
WHERE "createdById" IS NULL;

ALTER TABLE "Expense" ALTER COLUMN "createdById" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
