import { format } from "date-fns";
import type { NodeWithStats } from "@workspace/api-client-react";

interface NodeCardProps {
  node: NodeWithStats;
  onSelect?: (node: NodeWithStats) => void;
}

function formatGB(raw: string | null | undefined): string {
  if (!raw) return "—";
  const digits = String(raw).match(/[\d.]+/);
  return digits ? `${digits[0]} GB` : String(raw);
}

export function NodeCard({ node, onSelect }: NodeCardProps) {
  const maskedWallet = `${node.wallet.slice(0, 6)}...${node.wallet.slice(-4)}`;
  const formattedTime = node.lastRewardTimestamp 
    ? format(new Date(node.lastRewardTimestamp), "yyyy-MM-dd HH:mm:ss 'UTC'")
    : "NO REWARDS YET";
    
  const truncatedHash = node.lastRewardTxHash 
    ? `${node.lastRewardTxHash.slice(0, 10)}...${node.lastRewardTxHash.slice(-6)}`
    : null;

  return (
    <div
      id={`node-${node.id}`}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={() => onSelect?.(node)}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(node);
        }
      }}
      className="border border-[#333] bg-black p-5 flex flex-col gap-4 transition-all duration-300 hover:scale-[1.02] hover:border-white hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] relative group glitch-hover cursor-pointer focus:outline-none focus:border-white"
    >
      {/* Corner decorations */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold uppercase tracking-wider mb-1 glow-text">{node.nickname}</h3>
          <div className="text-xs text-[#888] font-mono">{maskedWallet}</div>
        </div>
        <div className={`status-dot w-2 h-2 rounded-full ${node.online ? 'online' : 'offline'}`} title={node.online ? 'Online' : 'Offline'} />
      </div>

      <div className="grid grid-cols-2 gap-y-3 gap-x-4 py-3 border-y border-[#222]">
        <div className="flex flex-col">
          <span className="text-[10px] text-[#666]">HARDWARE</span>
          <span className="text-sm">{node.modelName || "—"}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-[#666]">MODEL</span>
          <span className="text-sm truncate" title={node.modelNumber ?? undefined}>{node.modelNumber || "—"}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-[#666]">VRAM</span>
          <span className="text-sm">{formatGB(node.vram)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-[#666]">RAM</span>
          <span className="text-sm">{formatGB(node.ram)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-[#666]">UPLINK</span>
          <span className="text-sm">{node.internetSpeed}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-[#666]">DAILY REWARD</span>
          <span className="text-sm">{node.dailyAccumulated.toFixed(4)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1 mt-auto">
        <span className="text-[10px] text-[#666]">LAST REWARD</span>
        <div className="flex justify-between items-end">
          <div className="flex flex-col">
            <span className="text-sm font-bold">{node.lastRewardAmount ? node.lastRewardAmount.toFixed(4) : "0.0000"}</span>
            <span className="text-[10px] text-[#888]">{formattedTime}</span>
          </div>
          {truncatedHash && (
            <a 
              href={`https://testnet.monadexplorer.com/tx/${node.lastRewardTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] border border-[#444] px-2 py-1 hover:bg-white hover:text-black transition-colors"
            >
              TX: {truncatedHash}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
