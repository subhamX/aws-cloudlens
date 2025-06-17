CREATE TABLE "contact_us" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"message" text NOT NULL,
	"country" text,
	"city" text,
	"region" text,
	"latitude" text,
	"longitude" text,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
