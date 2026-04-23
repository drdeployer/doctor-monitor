import { logger } from "./logger";

export interface RewardTx {
  txHash: string;
  amount: number;
  timestamp: string;
}

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const FOR_TOKEN = "0xf6b888f442277f01294f94d555608a2e8bc86430";
const TOKEN_DECIMALS = 18;

// RPC limits eth_getLogs to 100 blocks per request.
const RPC_BLOCK_RANGE = 100;
// On first request for a wallet, backfill this many recent blocks (~25 min on Monad).
const INITIAL_BACKFILL_BLOCKS = 3000;
// Background polling cadence; each poll pulls everything since the last indexed block.
const POLL_INTERVAL_MS = 25_000;
// Max blocks to index per polling cycle (safety guard).
const MAX_BLOCKS_PER_POLL = 4000;

function rpcUrl(): string {
  const key = process.env["BLOCKVISION_API_KEY"] ?? "";
  return `https://monad-testnet.blockvision.org/v1/${key}`;
}

function isValidReward(amount: number): boolean {
  return amount > 1 && amount !== 1000;
}

function paddedAddress(address: string): string {
  return ("0x000000000000000000000000" + address.slice(2)).toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RpcLog {
  transactionHash: string;
  logIndex: string;
  data: string;
  topics: string[];
  blockTimestamp?: string;
}

interface WalletState {
  // key = txHash + ":" + logIndex (unique per Transfer event)
  rewards: Map<string, RewardTx>;
  lastIndexedBlock: number;
  backfillPromise: Promise<void> | null;
  pollTimer: NodeJS.Timeout | null;
}

const wallets = new Map<string, WalletState>();

async function rpcCall<T>(method: string, params: unknown[]): Promise<T | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (res.status === 429) {
      await sleep(300 * Math.pow(2, attempt));
      continue;
    }
    if (!res.ok) {
      logger.warn({ status: res.status, method }, "rpc call failed");
      return null;
    }
    const json = (await res.json()) as {
      result?: T;
      error?: { code: number; message: string };
    };
    if (json.error) {
      const msg = json.error.message?.toLowerCase() ?? "";
      if (msg.includes("rate") || msg.includes("limit")) {
        await sleep(300 * Math.pow(2, attempt));
        continue;
      }
      logger.warn({ error: json.error, method }, "rpc call returned error");
      return null;
    }
    return (json.result ?? null) as T | null;
  }
  return null;
}

async function getCurrentBlock(): Promise<number | null> {
  const result = await rpcCall<string>("eth_blockNumber", []);
  if (!result) return null;
  return parseInt(result, 16);
}

async function fetchTransfersChunk(
  wallet: string,
  fromBlock: number,
  toBlock: number,
): Promise<RpcLog[]> {
  const padded = paddedAddress(wallet);
  const result = await rpcCall<RpcLog[]>("eth_getLogs", [
    {
      address: FOR_TOKEN,
      fromBlock: "0x" + fromBlock.toString(16),
      toBlock: "0x" + toBlock.toString(16),
      topics: [TRANSFER_TOPIC, null, padded],
    },
  ]);
  return result ?? [];
}

function ingestLogs(state: WalletState, logs: RpcLog[]): void {
  for (const log of logs) {
    if (!log.transactionHash || !log.data || log.data === "0x") continue;
    let amount: number;
    try {
      amount = Number(BigInt(log.data)) / Math.pow(10, TOKEN_DECIMALS);
    } catch {
      continue;
    }
    if (!isValidReward(amount)) continue;

    const ts = log.blockTimestamp
      ? parseInt(log.blockTimestamp, 16) * 1000
      : Date.now();
    const key = `${log.transactionHash}:${log.logIndex ?? ""}`;
    state.rewards.set(key, {
      txHash: log.transactionHash,
      amount,
      timestamp: new Date(ts).toISOString(),
    });
  }
}

async function indexRange(
  wallet: string,
  state: WalletState,
  fromBlock: number,
  toBlock: number,
): Promise<void> {
  if (fromBlock > toBlock) return;
  for (let from = fromBlock; from <= toBlock; from += RPC_BLOCK_RANGE) {
    const to = Math.min(from + RPC_BLOCK_RANGE - 1, toBlock);
    const logs = await fetchTransfersChunk(wallet, from, to);
    ingestLogs(state, logs);
    state.lastIndexedBlock = to;
  }
}

async function pollWallet(wallet: string, state: WalletState): Promise<void> {
  try {
    const current = await getCurrentBlock();
    if (current === null) return;
    if (state.lastIndexedBlock === 0) return; // backfill not done yet
    const from = state.lastIndexedBlock + 1;
    if (from > current) return;
    const to = Math.min(current, from + MAX_BLOCKS_PER_POLL - 1);
    await indexRange(wallet, state, from, to);
  } catch (err) {
    logger.warn({ err, wallet }, "wallet poll failed");
  }
}

function ensurePolling(wallet: string, state: WalletState): void {
  if (state.pollTimer) return;
  state.pollTimer = setInterval(() => {
    void pollWallet(wallet, state);
  }, POLL_INTERVAL_MS);
}

async function backfill(wallet: string, state: WalletState): Promise<void> {
  const current = await getCurrentBlock();
  if (current === null) {
    throw new Error("rpc unavailable");
  }
  const from = Math.max(1, current - INITIAL_BACKFILL_BLOCKS);
  await indexRange(wallet, state, from, current);
}

function getOrCreateState(wallet: string): WalletState {
  const key = wallet.toLowerCase();
  let state = wallets.get(key);
  if (!state) {
    state = {
      rewards: new Map(),
      lastIndexedBlock: 0,
      backfillPromise: null,
      pollTimer: null,
    };
    wallets.set(key, state);
  }
  return state;
}

function snapshot(state: WalletState): RewardTx[] {
  return [...state.rewards.values()].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export async function getRewardsForWallet(wallet: string): Promise<RewardTx[]> {
  const state = getOrCreateState(wallet);

  if (state.lastIndexedBlock === 0) {
    if (!state.backfillPromise) {
      state.backfillPromise = backfill(wallet, state)
        .catch((err) => {
          logger.warn({ err, wallet }, "backfill failed");
          // Reset so next request retries.
          state.backfillPromise = null;
        })
        .then(() => {
          state.backfillPromise = null;
          ensurePolling(wallet, state);
        });
    }
    // Wait briefly so a cold-start request returns at least some data.
    await Promise.race([state.backfillPromise, sleep(8000)]);
  } else {
    ensurePolling(wallet, state);
  }

  return snapshot(state);
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
