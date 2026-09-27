ALTER TABLE "users" ALTER COLUMN "google_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_method_check" CHECK ("users"."google_id" IS NOT NULL OR "users"."password_hash" IS NOT NULL);