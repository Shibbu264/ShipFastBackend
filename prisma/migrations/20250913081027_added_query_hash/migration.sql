/*
  Warnings:

  - A unique constraint covering the columns `[queryHash]` on the table `QueryLog` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `queryHash` to the `QueryLog` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."QueryLog_query_key";

-- AlterTable
ALTER TABLE "public"."QueryLog" ADD COLUMN     "alertsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "queryHash" TEXT NOT NULL,
ALTER COLUMN "calls" SET DEFAULT 0,
ALTER COLUMN "totalTimeMs" SET DEFAULT 0,
ALTER COLUMN "meanTimeMs" SET DEFAULT 0,
ALTER COLUMN "rowsReturned" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "email" TEXT NOT NULL DEFAULT 'geektechnologies133@gmail.com';

-- CreateIndex
CREATE UNIQUE INDEX "QueryLog_queryHash_key" ON "public"."QueryLog"("queryHash");
