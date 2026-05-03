-- Soft-delete column for Article (P2-9 in IssueDoc.md). All list endpoints
-- filter on `deletedAt IS NULL`; the DELETE handler now sets the timestamp
-- instead of removing the row, preserving the ArticleVersion audit trail.
ALTER TABLE "Article" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Article_deletedAt_idx" ON "Article"("deletedAt");
