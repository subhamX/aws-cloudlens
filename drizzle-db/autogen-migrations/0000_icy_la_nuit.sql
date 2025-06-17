CREATE TABLE "telegram_users" (
	"telegramId" integer PRIMARY KEY NOT NULL,
	"step" varchar(32),
	"method" varchar(16),
	"aws_account_id" varchar(16),
	"aws_access_key_id" varchar(32),
	"aws_secret_access_key" varchar(64),
	"onboarded" boolean DEFAULT false
);
