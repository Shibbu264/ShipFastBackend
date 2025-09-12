/*
  Warnings:

  - A unique constraint covering the columns `[query]` on the table `QueryLog` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."QueryLog_userDbId_query_key";

-- CreateIndex
CREATE UNIQUE INDEX "QueryLog_query_key" ON "public"."QueryLog"("query");
