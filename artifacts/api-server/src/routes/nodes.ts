import { Router, type IRouter } from "express";
import { db, nodesTable, type NodeRow } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateNodeBody,
  UpdateNodeBody,
  UpdateNodeParams,
  DeleteNodeParams,
  GetSessionNodesParams,
  GetNodeTransactionsParams,
} from "@workspace/api-zod";
import {
  getRewardsForWallet,
  summarizeRewards,
} from "../lib/blockvision";

const router: IRouter = Router();

async function withStats(node: NodeRow) {
  const rewards = await getRewardsForWallet(node.wallet);
  const stats = summarizeRewards(rewards);
  return {
    id: node.id,
    sessionId: node.sessionId,
    nickname: node.nickname,
    wallet: node.wallet,
    modelName: node.modelName,
    internetSpeed: node.internetSpeed,
    vram: node.vram,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
    ...stats,
  };
}

router.get("/nodes", async (_req, res) => {
  const rows = await db.select().from(nodesTable);
  const enriched = await Promise.all(rows.map(withStats));
  res.json(enriched);
});

router.post("/nodes", async (req, res) => {
  const parsed = CreateNodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const body = parsed.data;
  if (!/^0x[0-9a-fA-F]{40}$/.test(body.wallet)) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }
  const [created] = await db
    .insert(nodesTable)
    .values({
      sessionId: body.sessionId,
      nickname: body.nickname,
      wallet: body.wallet,
      modelName: body.modelName,
      internetSpeed: body.internetSpeed,
      vram: body.vram,
    })
    .returning();
  if (!created) {
    res.status(500).json({ error: "Failed to create node" });
    return;
  }
  res.json({
    ...created,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  });
});

router.patch("/nodes/:id", async (req, res) => {
  const params = UpdateNodeParams.safeParse(req.params);
  const body = UpdateNodeBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (body.data.wallet && !/^0x[0-9a-fA-F]{40}$/.test(body.data.wallet)) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }
  const [updated] = await db
    .update(nodesTable)
    .set(body.data)
    .where(eq(nodesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  res.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

router.delete("/nodes/:id", async (req, res) => {
  const params = DeleteNodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(nodesTable).where(eq(nodesTable.id, params.data.id));
  res.json({ success: true });
});

router.get("/nodes/session/:sessionId", async (req, res) => {
  const params = GetSessionNodesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid sessionId" });
    return;
  }
  const rows = await db
    .select()
    .from(nodesTable)
    .where(eq(nodesTable.sessionId, params.data.sessionId));
  const enriched = await Promise.all(rows.map(withStats));
  res.json(enriched);
});

router.get("/nodes/:id/transactions", async (req, res) => {
  const params = GetNodeTransactionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [node] = await db
    .select()
    .from(nodesTable)
    .where(eq(nodesTable.id, params.data.id));
  if (!node) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  const rewards = await getRewardsForWallet(node.wallet);
  res.json(rewards.slice(0, 25));
});

router.get("/network/summary", async (_req, res) => {
  const rows = await db.select().from(nodesTable);
  const enriched = await Promise.all(rows.map(withStats));
  const onlineNodes = enriched.filter((n) => n.online).length;
  const totalDailyRewards = enriched.reduce(
    (sum, n) => sum + n.dailyAccumulated,
    0,
  );
  const totalRewardCountToday = enriched.reduce(
    (sum, n) => sum + n.rewardCountToday,
    0,
  );
  res.json({
    totalNodes: enriched.length,
    onlineNodes,
    totalDailyRewards,
    totalRewardCountToday,
  });
});

export default router;
