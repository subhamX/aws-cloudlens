CREATE TABLE "aws_reports" (
	"id" varchar PRIMARY KEY NOT NULL,
	"telegramUserId" varchar(20),
	"report" text,
	"started_at" timestamp DEFAULT now(),
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "aws_reports" ADD CONSTRAINT "aws_reports_telegramUserId_telegram_users_telegram_id_fk" FOREIGN KEY ("telegramUserId") REFERENCES "public"."telegram_users"("telegram_id") ON DELETE no action ON UPDATE no action;