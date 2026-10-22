-- CreateEnum
CREATE TYPE "AnnouncementScope" AS ENUM ('PLATFORM', 'COURSE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ANNOUNCEMENT', 'DISCUSSION_REPLY', 'DISCUSSION_THREAD', 'MARK_RELEASED', 'BADGE');

-- CreateTable
CREATE TABLE "TrainerRating" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "raterId" TEXT,
    "courseId" TEXT NOT NULL,
    "sessionId" TEXT,
    "knowledge" INTEGER NOT NULL,
    "clarity" INTEGER NOT NULL,
    "relevance" INTEGER NOT NULL,
    "engagement" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "scope" "AnnouncementScope" NOT NULL,
    "courseId" TEXT,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "emailed" BOOLEAN NOT NULL DEFAULT false,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionThread" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lastPostAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionPost" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badge" TEXT NOT NULL,
    "courseId" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainerRating_trainerId_createdAt_idx" ON "TrainerRating"("trainerId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainerRating_raterId_idx" ON "TrainerRating"("raterId");

-- CreateIndex
CREATE INDEX "Announcement_scope_createdAt_idx" ON "Announcement"("scope", "createdAt");

-- CreateIndex
CREATE INDEX "Announcement_courseId_createdAt_idx" ON "Announcement"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscussionThread_courseId_pinned_lastPostAt_idx" ON "DiscussionThread"("courseId", "pinned", "lastPostAt");

-- CreateIndex
CREATE INDEX "DiscussionPost_threadId_createdAt_idx" ON "DiscussionPost"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "UserBadge_userId_idx" ON "UserBadge"("userId");

-- AddForeignKey
ALTER TABLE "TrainerRating" ADD CONSTRAINT "TrainerRating_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerRating" ADD CONSTRAINT "TrainerRating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerRating" ADD CONSTRAINT "TrainerRating_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerRating" ADD CONSTRAINT "TrainerRating_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionThread" ADD CONSTRAINT "DiscussionThread_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionThread" ADD CONSTRAINT "DiscussionThread_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DiscussionThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One rating per learner, trainer and course (course-level) or session (session-level).
CREATE UNIQUE INDEX "TrainerRating_course_once" ON "TrainerRating" ("raterId", "trainerId", "courseId") WHERE "sessionId" IS NULL;
CREATE UNIQUE INDEX "TrainerRating_session_once" ON "TrainerRating" ("raterId", "trainerId", "sessionId") WHERE "sessionId" IS NOT NULL;
ALTER TABLE "TrainerRating" ADD CONSTRAINT "TrainerRating_scores" CHECK (
  "knowledge" BETWEEN 1 AND 5 AND "clarity" BETWEEN 1 AND 5 AND "relevance" BETWEEN 1 AND 5 AND "engagement" BETWEEN 1 AND 5
);

-- Each badge once per person (per course for course badges).
CREATE UNIQUE INDEX "UserBadge_once" ON "UserBadge" ("userId", "badge", COALESCE("courseId", ''));

-- Course announcements need a course; platform ones must not have one.
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_scope" CHECK (("scope" = 'COURSE') = ("courseId" IS NOT NULL));
