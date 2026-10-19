DROP INDEX "uq_volunteers_email";--> statement-breakpoint
ALTER TABLE "volunteers" ADD COLUMN "browser_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_volunteers_legacy_email" ON "volunteers" USING btree ("email") WHERE "volunteers"."browser_key" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_volunteers_browser_email" ON "volunteers" USING btree ("email","browser_key");