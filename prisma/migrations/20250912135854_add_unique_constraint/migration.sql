/*
  Warnings:

  - A unique constraint covering the columns `[userDbId,query]` on the table `QueryLog` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "QueryLog_userDbId_query_key" ON "public"."QueryLog"("userDbId", "query");
