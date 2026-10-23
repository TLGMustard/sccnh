CREATE TABLE "volunteer_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"phone_hash" text NOT NULL,
	"management_key" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volunteer_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "volunteers" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "volunteer_sessions" ADD CONSTRAINT "volunteer_sessions_account_id_volunteer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."volunteer_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_volunteer_accounts_email" ON "volunteer_accounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_volunteer_sessions_expiry" ON "volunteer_sessions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_account_id_volunteer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."volunteer_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_volunteers_account" ON "volunteers" USING btree ("account_id");