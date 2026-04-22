import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  useGetNodeTransactions,
  type NodeWithStats,
} from "@workspace/api-client-react";

interface Props {
  node: NodeWithStats;
  onClose: () => void;
}

function utcDateString(offsetDays = 0): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - offsetDays);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayUtcString(): string {
  return utcDateString(0);
}

export function NodeDetailModal({ node, onClose }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(todayUtcString());
  const { data: transactions, isLoading } = useGetNodeTransactions(node.id, {
    query: { refetchInterval: 15000 } as any,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    const [yStr, mStr, dStr] = selectedDate.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    if (!y || !m || !d) return [];
    const start = Date.UTC(y, m - 1, d);
    const end = start + 24 * 60 * 60 * 1000;
    return transactions.filter((tx) => {
      const t = new Date(tx.timestamp).getTime();
      return t >= start && t < end;
    });
  }, [transactions, selectedDate]);

  const dailyReward = filtered.reduce((sum, tx) => sum + tx.amount, 0);
  const roundCount = filtered.length;
  const maskedWallet = `${node.wallet.slice(0, 6)}...${node.wallet.slice(-4)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-black border-l border-[#333] flex flex-col font-mono text-white relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white to-transparent opacity-50" />

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[#222]">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <div
                className={`w-2 h-2 rounded-full ${
                  node.online ? "bg-white animate-pulse" : "bg-[#333]"
                }`}
              />
              <h2 className="text-lg font-bold uppercase tracking-widest">
                {node.nickname}
              </h2>
            </div>
            <span className="text-xs text-[#666]">{maskedWallet}</span>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-[#888] hover:text-white border border-[#333] hover:border-white px-2 py-1 uppercase tracking-wider"
            aria-label="Close"
          >
            [X] CLOSE
          </button>
        </div>

        {/* Stats + Date */}
        <div className="px-6 py-4 border-b border-[#222] flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] text-[#666] uppercase tracking-wider">
                DAILY_REWARD
              </span>
              <span className="text-2xl font-bold text-[#00ff88]">
                {dailyReward.toFixed(4)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-[#666] uppercase tracking-wider">
                AMOUNT_OF_ROUNDS
              </span>
              <span className="text-2xl font-bold">{roundCount}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] text-[#666] uppercase tracking-wider">
              SELECT_DATE (UTC)
            </label>
            <input
              type="date"
              value={selectedDate}
              max={todayUtcString()}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-black border border-[#444] rounded-none px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-white [color-scheme:dark]"
            />
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "TODAY", offset: 0 },
                { label: "DAY BEFORE", offset: 1 },
                { label: "TWO DAYS BEFORE", offset: 2 },
              ].map((preset) => {
                const value = utcDateString(preset.offset);
                const active = selectedDate === value;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setSelectedDate(value)}
                    className={`text-[10px] font-mono uppercase tracking-wider border px-2 py-2 transition-colors ${
                      active
                        ? "bg-white text-black border-white"
                        : "bg-black text-[#888] border-[#444] hover:border-white hover:text-white"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Round list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <h3 className="text-xs text-[#888] uppercase tracking-widest mb-3">
            ROUNDS // {selectedDate}
          </h3>

          {isLoading ? (
            <div className="text-xs text-[#666]">FETCHING TX DATA...</div>
          ) : filtered.length === 0 ? (
            <div className="text-xs text-[#666] border border-[#222] p-4 text-center uppercase tracking-wider">
              NO ROUNDS FOR THIS DATE
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {filtered.map((tx) => (
                <li key={tx.txHash}>
                  <a
                    href={`https://testnet.monadexplorer.com/tx/${tx.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 px-3 py-2 border border-[#1a1a1a] hover:border-[#00ff88] transition-colors text-[#00ff88]"
                  >
                    <span className="text-sm font-bold tracking-wider">
                      {tx.amount.toFixed(3)}
                    </span>
                    <span className="text-[10px] text-[#00ff88]/70 uppercase tracking-wider">
                      FOR {format(new Date(tx.timestamp), "HH:mm:ss")}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-6 py-3 border-t border-[#222] text-[10px] text-[#555] uppercase tracking-widest text-center">
          DATA STREAM // MONAD EXPLORER
        </div>
      </div>
    </div>
  );
}
