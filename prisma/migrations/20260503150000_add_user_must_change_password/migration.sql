-- Forced first-login password change (P2-4 in IssueDoc.md). The seed script
-- now sets this to true on freshly-created users; the /auth/change-password
-- page clears the flag once the user picks their own password.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
