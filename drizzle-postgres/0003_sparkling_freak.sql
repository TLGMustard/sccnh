ALTER TABLE "signups" ADD COLUMN "management_key" text;--> statement-breakpoint
ALTER TABLE "signups" ADD COLUMN "management_expires_at" bigint;--> statement-breakpoint
CREATE INDEX "idx_signups_management_key" ON "signups" USING btree ("management_key");