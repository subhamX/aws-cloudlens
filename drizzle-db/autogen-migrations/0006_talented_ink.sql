CREATE TABLE "staging_data" (
	"id" varchar PRIMARY KEY NOT NULL,
	"data" text,
	"created_at" timestamp DEFAULT now()
);
