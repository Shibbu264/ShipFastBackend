-- AlterTable
ALTER TABLE "public"."UserDB" ADD COLUMN     "monitoringEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."TableStructure" (
    "id" TEXT NOT NULL,
    "userDbId" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "schemaName" TEXT NOT NULL DEFAULT 'public',
    "columns" JSONB NOT NULL,
    "primaryKeys" JSONB NOT NULL,
    "foreignKeys" JSONB NOT NULL,
    "indexes" JSONB NOT NULL,
    "rowCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableStructure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TableStructure_userDbId_schemaName_tableName_key" ON "public"."TableStructure"("userDbId", "schemaName", "tableName");
