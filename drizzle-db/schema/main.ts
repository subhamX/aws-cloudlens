import { pgTable, integer, varchar, boolean, timestamp, text, json } from "drizzle-orm/pg-core"
import { ConsolidatedS3ReportSchema } from "../../src/localAgents/s3Types"
import { z } from "zod"
import { ConsolidatedEC2ReportSchema } from "../../src/localAgents/ec2EbsTypes"
import { ConsolidatedCfnReportSchema } from "../../src/localAgents/cfnTypes"

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
  report: json("report").$type<{
    s3?: z.infer<typeof ConsolidatedS3ReportSchema>,
    ec2?: z.infer<typeof ConsolidatedEC2ReportSchema>,
    cfn?: z.infer<typeof ConsolidatedCfnReportSchema>
  }>(),
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
  deliveredAt: timestamp("delivered_at"),
})

export const stagingData = pgTable("staging_data", {
  id: varchar("id").primaryKey(),
  data: text("data"),
  createdAt: timestamp("created_at").defaultNow(),
})


export const contactUs = pgTable('contact_us', {
  id: text('id').primaryKey(),
  email: text("email").notNull(),
  message: text("message").notNull(),

  country: text("country"),
  city: text("city"),
  region: text("region"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});
