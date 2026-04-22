import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNodes,
  useGetNetworkSummary,
  useDeleteNode,
  getListNodesQueryKey,
  getGetNetworkSummaryQueryKey,
  type NodeWithStats,
} from "@workspace/api-client-react";
import { NodeCard } from "@/components/node-card";
import { NodeDetailModal } from "@/components/node-detail-modal";
import { AdminLoginModal } from "@/components/admin-login-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN_KEY = "node-monitor:admin-token";

function AnimatedLines({ nodes }: { nodes: any[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [lines, setLines] = useState<{ id: string; x1: number; y1: number; x2: number; y2: number }[]>([]);

  useEffect(() => {
    if (!svgRef.current || nodes.length < 2) return;

    const updateLines = () => {
      const newLines: any[] = [];
      const onlineNodes = nodes.filter(n => n.online);
      
      // Connect random online nodes
      const maxLines = Math.min(onlineNodes.length * 2, 20);
      
      for (let i = 0; i < maxLines; i++) {
        const sourceIndex = Math.floor(Math.random() * onlineNodes.length);
        let targetIndex = Math.floor(Math.random() * onlineNodes.length);
        while (targetIndex === sourceIndex && onlineNodes.length > 1) {
          targetIndex = Math.floor(Math.random() * onlineNodes.length);
        }

        const sourceNode = document.getElementById(`node-${onlineNodes[sourceIndex].id}`);
        const targetNode = document.getElementById(`node-${onlineNodes[targetIndex].id}`);

        if (sourceNode && targetNode) {
          const svgRect = svgRef.current!.getBoundingClientRect();
          const sourceRect = sourceNode.getBoundingClientRect();
          const targetRect = targetNode.getBoundingClientRect();

          newLines.push({
            id: `line-${i}-${onlineNodes[sourceIndex].id}-${onlineNodes[targetIndex].id}`,
            x1: sourceRect.left + sourceRect.width / 2 - svgRect.left,
            y1: sourceRect.top + sourceRect.height / 2 - svgRect.top,
            x2: targetRect.left + targetRect.width / 2 - svgRect.left,
            y2: targetRect.top + targetRect.height / 2 - svgRect.top,
          });
        }
      }
      setLines(newLines);
    };

    updateLines();
    const interval = setInterval(updateLines, 3000);
    window.addEventListener('resize', updateLines);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', updateLines);
    };
  }, [nodes]);

  return (
    <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none z-0">
      {lines.map((line) => (
        <line
          key={line.id}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth="1"
          className="animate-pulse"
        />
      ))}
    </svg>
  );
}

export function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: nodes, isLoading: isLoadingNodes } = useListNodes({ query: { refetchInterval: 15000 } as any });
  const { data: summary, isLoading: isLoadingSummary } = useGetNetworkSummary({ query: { refetchInterval: 15000 } as any });
  const [selectedNode, setSelectedNode] = useState<NodeWithStats | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(ADMIN_TOKEN_KEY)
  );
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const deleteNode = useDeleteNode({
    request: { headers: adminToken ? { "x-admin-token": adminToken } : {} },
  });

  const invalidateNodes = () => {
    queryClient.invalidateQueries({ queryKey: getListNodesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetNetworkSummaryQueryKey() });
  };

  const handleAdminDelete = async (node: NodeWithStats) => {
    if (!adminToken) return;
    if (!confirm(`ADMIN: TERMINATE NODE [${node.nickname}]? THIS ACTION IS IRREVERSIBLE.`)) return;
    try {
      await deleteNode.mutateAsync({ id: node.id });
      invalidateNodes();
      toast({ title: "ADMIN_ACTION", description: `NODE [${node.nickname}] TERMINATED` });
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        window.localStorage.removeItem(ADMIN_TOKEN_KEY);
        setAdminToken(null);
        toast({ title: "ADMIN_ERROR", description: "SESSION EXPIRED — RE-AUTHENTICATE", variant: "destructive" });
      } else {
        toast({ title: "SYSTEM_ERROR", description: "FAILED TO TERMINATE NODE", variant: "destructive" });
      }
    }
  };

  const handleAdminLogout = () => {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminToken(null);
    toast({ title: "ADMIN_LOGOUT", description: "ADMIN SESSION CLOSED" });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 relative">
      <div className="flex justify-end mb-3 relative z-10">
        {adminToken ? (
          <button
            type="button"
            onClick={handleAdminLogout}
            className="text-[10px] font-mono uppercase tracking-widest border border-[#ff3344] text-[#ff3344] hover:bg-[#ff3344] hover:text-black px-3 py-1 transition-colors"
          >
            ADMIN: ACTIVE • LOGOUT
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowAdminLogin(true)}
            className="text-[10px] font-mono uppercase tracking-widest border border-[#444] text-[#888] hover:border-white hover:text-white px-3 py-1 transition-colors"
          >
            ADMIN_LOGIN
          </button>
        )}
      </div>

      {/* Network Summary Strip */}
      <div className="border border-[#333] p-4 mb-8 bg-black/50 backdrop-blur-sm relative z-10 flex flex-wrap gap-8 justify-between items-center">
        {isLoadingSummary ? (
          Array(4).fill(0).map((_, i) => (
            <div key={i} className="flex-1 min-w-[150px]">
              <Skeleton className="h-4 w-20 mb-2 bg-[#222]" />
              <Skeleton className="h-8 w-32 bg-[#222]" />
            </div>
          ))
        ) : summary ? (
          <>
            <div className="flex flex-col">
              <span className="text-[#888] text-xs uppercase tracking-wider mb-1">TOTAL_NODES</span>
              <span className="text-2xl font-bold glow-text">{summary.totalNodes}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[#888] text-xs uppercase tracking-wider mb-1">ONLINE_NODES</span>
              <span className="text-2xl font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                {summary.onlineNodes}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[#888] text-xs uppercase tracking-wider mb-1">DAILY_REWARDS</span>
              <span className="text-2xl font-bold">{summary.totalDailyRewards.toFixed(4)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[#888] text-xs uppercase tracking-wider mb-1">REWARD_TX_COUNT</span>
              <span className="text-2xl font-bold">{summary.totalRewardCountToday}</span>
            </div>
          </>
        ) : null}
      </div>

      <div className="relative">
        {nodes && <AnimatedLines nodes={nodes} />}
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 relative z-10">
          {isLoadingNodes ? (
            Array(8).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full bg-[#111] border border-[#333]" />
            ))
          ) : nodes && nodes.length > 0 ? (
            nodes.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                onSelect={setSelectedNode}
                isAdmin={!!adminToken}
                onAdminDelete={handleAdminDelete}
              />
            ))
          ) : (
            <div className="col-span-full border border-[#333] p-12 text-center text-[#888]">
              NO ACTIVE NODES DETECTED ON THE NETWORK.
            </div>
          )}
        </div>
      </div>

      {selectedNode && (
        <NodeDetailModal
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}

      {showAdminLogin && (
        <AdminLoginModal
          onClose={() => setShowAdminLogin(false)}
          onSuccess={(token) => {
            window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
            setAdminToken(token);
            setShowAdminLogin(false);
            toast({ title: "ADMIN_AUTH", description: "ADMIN SESSION ESTABLISHED" });
          }}
        />
      )}
    </div>
  );
}
