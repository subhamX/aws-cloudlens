import { pgTable, text, timestamp, varchar, json } from "drizzle-orm/pg-core";
import { z } from "zod";
import { ConsolidatedS3ReportSchema } from "../../lib/localAgents/s3Types";
import { ConsolidatedEC2ReportSchema } from "../../lib/localAgents/ec2EbsTypes";
import { ConsolidatedCfnReportSchema } from "../../lib/localAgents/cfnTypes";


export const awsReports = pgTable("aws_reports", {
  id: varchar("id").primaryKey(),
  telegramUserId: varchar({ length: 20 }),
  report: json("report").$type<{
    s3?: z.infer<typeof ConsolidatedS3ReportSchema>,
    ec2?: z.infer<typeof ConsolidatedEC2ReportSchema>,
    cfn?: z.infer<typeof ConsolidatedCfnReportSchema>
  }>(),
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
});


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
