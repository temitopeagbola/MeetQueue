-- AlterTable
ALTER TABLE "calendar_connections" ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "last_error_at" TIMESTAMPTZ(3);
