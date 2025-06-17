import { pgTable, integer, varchar, boolean, timestamp, text } from "drizzle-orm/pg-core"

export const telegramUsers = pgTable("telegram_users", {
  telegramId: varchar("telegram_id", { length: 20 }).primaryKey(),
  step: varchar({ length: 32 }),
  method: varchar({ length: 16 }),
  aws_account_id: varchar({ length: 16 }),
  aws_access_key_id: varchar({ length: 32 }),
  aws_secret_access_key: varchar({ length: 64 }),
  onboarded: boolean().default(false)
})


export const awsReports = pgTable("aws_reports", {
  id: varchar("id").primaryKey(),
  telegramUserId: varchar({ length: 20 }).references(() => telegramUsers.telegramId),
  report: text("report"),
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
})

export const stagingData = pgTable("staging_data", {
  id: varchar("id").primaryKey(),
  data: text("data"),
  createdAt: timestamp("created_at").defaultNow(),
})