-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL DEFAULT 'geektechnologies133@gmail.com',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserDB" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "dbType" TEXT NOT NULL,
    "dbName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDB_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QueryLog" (
    "id" TEXT NOT NULL,
    "userDbId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "queryHash" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "totalTimeMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meanTimeMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rowsReturned" INTEGER NOT NULL DEFAULT 0,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QueryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TableUsage" (
    "id" TEXT NOT NULL,
    "userDbId" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TopSlowQuery" (
    "id" TEXT NOT NULL,
    "userDbId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 1,
    "totalTimeMs" DOUBLE PRECISION NOT NULL,
    "meanTimeMs" DOUBLE PRECISION NOT NULL,
    "rowsReturned" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopSlowQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Top3Suggestions" (
    "id" TEXT NOT NULL,
    "userDbId" TEXT NOT NULL,
    "suggestions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Top3Suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserDB_username_key" ON "public"."UserDB"("username");

-- CreateIndex
CREATE UNIQUE INDEX "QueryLog_queryHash_key" ON "public"."QueryLog"("queryHash");

-- CreateIndex
CREATE UNIQUE INDEX "Top3Suggestions_userDbId_key" ON "public"."Top3Suggestions"("userDbId");
