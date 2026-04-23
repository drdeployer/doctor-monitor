import { logger } from "./logger";

export interface RewardTx {
  txHash: string;
  amount: number;
  timestamp: string;
}

interface CacheEntry {
  fetchedAt: number;
  rewards: RewardTx[];
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

const BLOCKVISION_BASE = "https://api.blockvision.org/v2/monad";

function isValidReward(amount: number): boolean {
  return amount > 1 && amount !== 1000;
}

async function fetchFromBlockVision(wallet: string): Promise<RewardTx[]> {
  const apiKey = process.env["BLOCKVISION_API_KEY"];
  const url = `${BLOCKVISION_BASE}/account/tokens/transfers?address=${wallet}&limit=50`;

  const headers: Record<string, string> = {
    accept: "application/json",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    logger.warn(
      { status: res.status, wallet },
      "blockvision token transfers fetch failed",
    );
    return [];
  }

  const json = (await res.json()) as {
    result?: {
      data?: Array<{
        hash?: string;
        transactionHash?: string;
        value?: string;
        amount?: string;
        decimal?: number;
        decimals?: number;
        timestamp?: number;
        toAddress?: string;
        to?: string;
      }>;
    };
  };

  const data = json?.result?.data ?? [];
  const rewards: RewardTx[] = [];

  for (const tx of data) {
    const txHash = tx.hash ?? tx.transactionHash;
    if (!txHash) continue;

    const toAddr = (tx.toAddress ?? tx.to ?? "").toLowerCase();
    if (toAddr && toAddr !== wallet.toLowerCase()) continue;

    const decimals = tx.decimal ?? tx.decimals ?? 18;
    const raw = tx.value ?? tx.amount;
    if (!raw) continue;

    let amount: number;
    try {
      const big = BigInt(raw);
      amount = Number(big) / Math.pow(10, decimals);
    } catch {
      continue;
    }

    if (!isValidReward(amount)) continue;

    const ts = tx.timestamp;
    if (!ts) continue;
    const iso = new Date(ts * 1000).toISOString();

    rewards.push({ txHash, amount, timestamp: iso });
  }

  rewards.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return rewards;
}

export async function getRewardsForWallet(wallet: string): Promise<RewardTx[]> {
  const key = wallet.toLowerCase();
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rewards;
  }

  try {
    const rewards = await fetchFromBlockVision(wallet);
    cache.set(key, { fetchedAt: now, rewards });
    return rewards;
  } catch (err) {
    logger.warn({ err, wallet }, "failed to fetch rewards");
    if (cached) return cached.rewards;
    cache.set(key, { fetchedAt: now, rewards: [] });
    return [];
  }
}

export function summarizeRewards(
  rewards: RewardTx[],
  dateUtc?: string,
): {
  lastRewardAmount: number | null;
  lastRewardTxHash: string | null;
  lastRewardTimestamp: string | null;
  dailyAccumulated: number;
  rewardCountToday: number;
  online: boolean;
} {
  const now = new Date();

  let dayStart: number;
  let dayEnd: number;
  if (dateUtc && /^\d{4}-\d{2}-\d{2}$/.test(dateUtc)) {
    const [y, m, d] = dateUtc.split("-").map(Number);
    dayStart = Date.UTC(y!, m! - 1, d!);
    dayEnd = dayStart + 24 * 60 * 60 * 1000;
  } else {
    dayStart = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    dayEnd = dayStart + 24 * 60 * 60 * 1000;
  }

  if (rewards.length === 0) {
    return {
      lastRewardAmount: null,
      lastRewardTxHash: null,
      lastRewardTimestamp: null,
      dailyAccumulated: 0,
      rewardCountToday: 0,
      online: false,
    };
  }

  const inDay = rewards.filter((r) => {
    const t = new Date(r.timestamp).getTime();
    return t >= dayStart && t < dayEnd;
  });
  const dailyAccumulated = inDay.reduce((sum, r) => sum + r.amount, 0);

  const last = rewards[0]!;
  const lastTs = new Date(last.timestamp).getTime();
  const online = now.getTime() - lastTs < 90 * 60 * 1000;

  return {
    lastRewardAmount: last.amount,
    lastRewardTxHash: last.txHash,
    lastRewardTimestamp: last.timestamp,
    dailyAccumulated,
    rewardCountToday: inDay.length,
    online,
  };
}
