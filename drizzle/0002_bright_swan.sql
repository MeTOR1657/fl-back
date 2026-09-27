ALTER TABLE "tickets" ADD COLUMN "contact_phone" varchar(40) DEFAULT '' NOT NULL;
ALTER TABLE "tickets" ADD COLUMN "contact_name" varchar(255) DEFAULT '' NOT NULL;
ALTER TABLE "tickets" ADD COLUMN "contact_email" varchar(255) DEFAULT '' NOT NULL;
ALTER TABLE "users" ADD COLUMN "student_id" varchar(100);
ALTER TABLE "users" ADD COLUMN "faculty" varchar(255);
ALTER TABLE "users" ADD COLUMN "major" varchar(255);
