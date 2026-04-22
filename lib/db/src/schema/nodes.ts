import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const nodesTable = pgTable("nodes", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  nickname: text("nickname").notNull(),
  wallet: text("wallet").notNull(),
  modelName: text("model_name"),
  internetSpeed: text("internet_speed").notNull(),
  vram: text("vram").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type NodeRow = typeof nodesTable.$inferSelect;
export type InsertNode = typeof nodesTable.$inferInsert;
