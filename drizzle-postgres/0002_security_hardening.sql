CREATE TABLE "admin_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"actor_key" text NOT NULL,
	"outcome" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"email_key" text NOT NULL,
	"code_digest" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_rate_limits" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_email_verifications_key_created" ON "email_verifications" USING btree ("email_key","created_at");--> statement-breakpoint
CREATE INDEX "idx_security_rate_limits_expiry" ON "security_rate_limits" USING btree ("expires_at");
--> statement-breakpoint
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_email_length" CHECK (octet_length("email") <= 254) NOT VALID;
--> statement-breakpoint
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_first_name_length" CHECK (char_length("first_name") BETWEEN 1 AND 80) NOT VALID;
--> statement-breakpoint
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_last_name_length" CHECK (char_length("last_name") BETWEEN 1 AND 80) NOT VALID;
--> statement-breakpoint
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_phone_length" CHECK (char_length("phone") BETWEEN 1 AND 32) NOT VALID;
--> statement-breakpoint
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_access_hash_length" CHECK (char_length("access_code_hash") <= 256) NOT VALID;
