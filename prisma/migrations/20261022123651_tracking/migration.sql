-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('IN_PERSON', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('QR', 'ONLINE_JOIN', 'MANUAL');

-- CreateEnum
CREATE TYPE "AtRiskType" AS ENUM ('INACTIVE_DAYS', 'MISSED_DEADLINE', 'SCORE_BELOW');

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "mode" "SessionMode" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "meetingUrl" TEXT,
    "trainerId" TEXT,
    "qrSecret" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "method" "AttendanceMethod" NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtRiskRule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "type" "AtRiskType" NOT NULL,
    "threshold" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtRiskRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtRiskFlag" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedManually" BOOLEAN NOT NULL DEFAULT false,
    "resolvedById" TEXT,
    "note" TEXT,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "AtRiskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveSession_courseId_startsAt_idx" ON "LiveSession"("courseId", "startsAt");

-- CreateIndex
CREATE INDEX "LiveSession_startsAt_idx" ON "LiveSession"("startsAt");

-- CreateIndex
CREATE INDEX "Attendance_userId_idx" ON "Attendance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_sessionId_userId_key" ON "Attendance"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AtRiskRule_courseId_type_key" ON "AtRiskRule"("courseId", "type");

-- CreateIndex
CREATE INDEX "AtRiskFlag_enrolmentId_idx" ON "AtRiskFlag"("enrolmentId");

-- CreateIndex
CREATE INDEX "AtRiskFlag_ruleId_enrolmentId_resolvedAt_idx" ON "AtRiskFlag"("ruleId", "enrolmentId", "resolvedAt");

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtRiskRule" ADD CONSTRAINT "AtRiskRule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtRiskFlag" ADD CONSTRAINT "AtRiskFlag_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AtRiskRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtRiskFlag" ADD CONSTRAINT "AtRiskFlag_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "Enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one open flag per rule and learner.
CREATE UNIQUE INDEX "AtRiskFlag_open_unique" ON "AtRiskFlag" ("ruleId", "enrolmentId") WHERE "resolvedAt" IS NULL;

-- A session ends after it starts.
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_time_order" CHECK ("endsAt" > "startsAt");
