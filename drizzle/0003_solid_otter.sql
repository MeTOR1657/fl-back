ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "contact_name" varchar(255) DEFAULT '' NOT NULL;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "contact_email" varchar(255) DEFAULT '' NOT NULL;
