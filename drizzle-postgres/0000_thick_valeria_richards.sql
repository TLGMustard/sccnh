CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tagline" text NOT NULL,
	"overview" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"blurb" text NOT NULL,
	"walking_note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seed_versions" (
	"version" text PRIMARY KEY NOT NULL,
	"applied_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"location_id" text NOT NULL,
	"task_id" text NOT NULL,
	"starts_at" text NOT NULL,
	"ends_at" text NOT NULL,
	"capacity" integer NOT NULL,
	"title" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "signups" (
	"id" text PRIMARY KEY NOT NULL,
	"volunteer_id" text NOT NULL,
	"shift_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"training" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainings" (
	"id" text PRIMARY KEY NOT NULL,
	"volunteer_id" text NOT NULL,
	"type" text NOT NULL,
	"completed_at" text NOT NULL,
	"completed_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volunteers" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"access_code_hash" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_volunteer_id_volunteers_id_fk" FOREIGN KEY ("volunteer_id") REFERENCES "public"."volunteers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_volunteer_id_volunteers_id_fk" FOREIGN KEY ("volunteer_id") REFERENCES "public"."volunteers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_shifts_day_start" ON "shifts" USING btree ("day","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_signups_volunteer_shift" ON "signups" USING btree ("volunteer_id","shift_id");--> statement-breakpoint
CREATE INDEX "idx_signups_shift_status" ON "signups" USING btree ("shift_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_trainings_volunteer_type" ON "trainings" USING btree ("volunteer_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_volunteers_email" ON "volunteers" USING btree ("email");