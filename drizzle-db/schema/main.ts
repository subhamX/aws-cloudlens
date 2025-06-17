import { pgTable, integer, varchar, boolean } from "drizzle-orm/pg-core"

export const telegramUsers = pgTable("telegram_users", {
  telegramId: varchar("telegram_id", { length: 20 }).primaryKey(),
  step: varchar({ length: 32 }),
  method: varchar({ length: 16 }),
  aws_account_id: varchar({ length: 16 }),
  aws_access_key_id: varchar({ length: 32 }),
  aws_secret_access_key: varchar({ length: 64 }),
  onboarded: boolean().default(false)
})