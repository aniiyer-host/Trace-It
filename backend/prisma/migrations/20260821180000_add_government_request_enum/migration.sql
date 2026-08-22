-- CreateEnum
CREATE TYPE "GovernmentRequestStatus" AS ENUM ('OPEN', 'PROCESSING', 'COMPLETED', 'EXPIRED');

-- AlterTable
ALTER TABLE "government_requests"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "GovernmentRequestStatus"
  USING "status"::"GovernmentRequestStatus",
  ALTER COLUMN "status" SET DEFAULT 'OPEN';