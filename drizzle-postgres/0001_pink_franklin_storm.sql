ALTER TABLE "shifts" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "volunteers" ADD COLUMN "wants_site_lead" boolean DEFAULT false NOT NULL;