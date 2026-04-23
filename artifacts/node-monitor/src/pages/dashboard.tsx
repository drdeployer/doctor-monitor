import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetSessionNodes, 
  useCreateNode, 
  useUpdateNode, 
  useDeleteNode,
  useGetNodeTransactions,
  getGetSessionNodesQueryKey,
  getListNodesQueryKey,
  getGetNetworkSummaryQueryKey,
  type NodeWithStats
} from "@workspace/api-client-react";
import { getSessionId } from "@/lib/session";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";

const nodeSchema = z.object({
  nickname: z.string().min(1, "Nickname is required").max(50),
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid 42-character hex wallet address starting with 0x"),
  modelName: z.string().max(100).optional().or(z.literal("")),
  modelNumber: z.string().min(1, "Model name is required").max(200),
  internetSpeed: z.string().min(1, "Internet speed is required"),
  vram: z.string().regex(/^\d+(\.\d+)?$/, "VRAM must be a number"),
  ram: z.string().optional().refine((v) => !v || /^\d+(\.\d+)?$/.test(v), "RAM must be a number"),
  walletHidden: z.boolean().default(false),
});

type NodeFormValues = z.infer<typeof nodeSchema>;

function NodeTransactions({ nodeId }: { nodeId: number }) {
  const { data: transactions, isLoading } = useGetNodeTransactions(nodeId);

  if (isLoading) {
    return <div className="text-xs text-[#666] py-2">FETCHING TX DATA...</div>;
  }

  if (!transactions || transactions.length === 0) {
    return <div className="text-xs text-[#666] py-2">NO RECENT TRANSACTIONS FOUND</div>;
  }

  return (
    <div className="mt-4 border-t border-[#222] pt-4">
      <h4 className="text-xs text-[#888] mb-2 uppercase tracking-widest">Recent Transactions</h4>
      <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-2">
        {transactions.map((tx) => (
          <div key={tx.txHash} className="flex justify-between items-center text-xs border border-[#222] p-2 hover:border-[#444] transition-colors">
            <div className="flex flex-col">
              <span className="text-white">{Math.round(tx.amount).toLocaleString("en-US")} FOR</span>
              <span className="text-[#666]">{format(new Date(tx.timestamp), "yyyy-MM-dd HH:mm:ss")}</span>
            </div>
            <a 
              href={`https://testnet.monadexplorer.com/tx/${tx.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#888] hover:text-white underline decoration-1 underline-offset-2"
            >
              {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-6)}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const sessionId = getSessionId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: nodes, isLoading } = useGetSessionNodes(sessionId, { query: { refetchInterval: 15000 } as any });
  
  const createNode = useCreateNode();
  const updateNode = useUpdateNode();
  const deleteNode = useDeleteNode({
    request: { headers: { "x-session-id": sessionId } },
  });

  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [expandedNodeId, setExpandedNodeId] = useState<number | null>(null);

  const form = useForm<NodeFormValues>({
    resolver: zodResolver(nodeSchema),
    defaultValues: {
      nickname: "",
      wallet: "",
      modelName: "",
      modelNumber: "",
      internetSpeed: "",
      vram: "",
      ram: "",
      walletHidden: false,
    }
  });

  const [speedValue, setSpeedValue] = useState<string>("");
  const [speedUnit, setSpeedUnit] = useState<"Gbps" | "Mbps">("Gbps");

  const parseSpeed = (raw: string): { value: string; unit: "Gbps" | "Mbps" } => {
    const m = raw.match(/^\s*([\d.]+)\s*(Gbps|Mbps)\s*$/i);
    if (m && m[1] && m[2]) {
      return { value: m[1], unit: (m[2].toLowerCase() === "mbps" ? "Mbps" : "Gbps") };
    }
    return { value: raw, unit: "Gbps" };
  };

  const syncSpeed = (value: string, unit: "Gbps" | "Mbps") => {
    form.setValue("internetSpeed", value ? `${value} ${unit}` : "", { shouldValidate: true });
  };

  const onSubmit = async (data: NodeFormValues) => {
    const payload = {
      ...data,
      modelName: data.modelName || null,
      modelNumber: data.modelNumber || null,
      ram: data.ram || null,
      walletHidden: data.walletHidden ?? false,
    };
    try {
      if (editingNodeId) {
        await updateNode.mutateAsync({
          id: editingNodeId,
          data: payload,
        });
        toast({ title: "SYSTEM UPDATE", description: `NODE [${data.nickname}] UPDATED SUCCESSFULLY` });
      } else {
        await createNode.mutateAsync({
          data: { ...payload, sessionId }
        });
        toast({ title: "SYSTEM UPDATE", description: `NODE [${data.nickname}] INITIALIZED SUCCESSFULLY` });
      }
      
      queryClient.invalidateQueries({ queryKey: getGetSessionNodesQueryKey(sessionId) });
      queryClient.invalidateQueries({ queryKey: getListNodesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetNetworkSummaryQueryKey() });
      
      setEditingNodeId(null);
      form.reset({ nickname: "", wallet: "", modelName: "", modelNumber: "", internetSpeed: "", vram: "", ram: "", walletHidden: false });
      setSpeedValue("");
      setSpeedUnit("Gbps");
    } catch (error) {
      toast({ 
        title: "SYSTEM ERROR", 
        description: "FAILED TO PROCESS REQUEST", 
        variant: "destructive" 
      });
    }
  };

  const handleEdit = (node: NodeWithStats) => {
    setEditingNodeId(node.id);
    const parsed = parseSpeed(node.internetSpeed);
    form.reset({
      nickname: node.nickname,
      wallet: node.wallet,
      modelName: node.modelName ?? "",
      modelNumber: node.modelNumber ?? "",
      internetSpeed: node.internetSpeed,
      vram: (node.vram || "").replace(/[^\d.]/g, ""),
      ram: (node.ram ?? "").replace(/[^\d.]/g, ""),
      walletHidden: node.walletHidden,
    });
    setSpeedValue(parsed.value);
    setSpeedUnit(parsed.unit);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: number, nickname: string) => {
    if (confirm(`TERMINATE NODE [${nickname}]? THIS ACTION IS IRREVERSIBLE.`)) {
      try {
        await deleteNode.mutateAsync({ id });
        queryClient.invalidateQueries({ queryKey: getGetSessionNodesQueryKey(sessionId) });
        queryClient.invalidateQueries({ queryKey: getListNodesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetNetworkSummaryQueryKey() });
        
        if (editingNodeId === id) {
          setEditingNodeId(null);
          form.reset();
        }
        
        toast({ title: "SYSTEM UPDATE", description: `NODE [${nickname}] TERMINATED` });
      } catch (error) {
        toast({ title: "SYSTEM ERROR", description: "FAILED TO TERMINATE NODE", variant: "destructive" });
      }
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
      {/* Sidebar Form */}
      <div className="w-full md:w-1/3 flex flex-col gap-6">
        <div className="border border-[#333] bg-black p-6 relative">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white to-transparent opacity-50" />
          <h2 className="text-xl font-bold mb-6 tracking-widest uppercase">
            {editingNodeId ? "CONFIGURE_NODE" : "REGISTER_NODE"}
          </h2>
          
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="nickname" className="text-xs text-[#888]">NICKNAME</Label>
              <Input 
                id="nickname" 
                {...form.register("nickname")} 
                className="bg-black border-[#444] rounded-none focus-visible:ring-0 focus-visible:border-white text-white font-mono"
                placeholder="e.g. ALPHA_PRIME"
              />
              {form.formState.errors.nickname && <span className="text-xs text-red-500">{form.formState.errors.nickname.message}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="wallet" className="text-xs text-[#888]">WALLET_ADDRESS</Label>
              <Input 
                id="wallet" 
                {...form.register("wallet")} 
                className="bg-black border-[#444] rounded-none focus-visible:ring-0 focus-visible:border-white text-white font-mono text-xs"
                placeholder="0x..."
              />
              {form.formState.errors.wallet && <span className="text-xs text-red-500">{form.formState.errors.wallet.message}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="modelName" className="text-xs text-[#888]">HARDWARE <span className="text-[#555]">(OPTIONAL)</span></Label>
              <Input
                id="modelName"
                {...form.register("modelName")}
                className="bg-black border-[#444] rounded-none focus-visible:ring-0 focus-visible:border-white text-white font-mono"
                placeholder="e.g. RTX 4090"
              />
              {form.formState.errors.modelName && <span className="text-xs text-red-500">{form.formState.errors.modelName.message}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="modelNumber" className="text-xs text-[#888]">MODEL_NAME</Label>
              <Input
                id="modelNumber"
                {...form.register("modelNumber")}
                className="bg-black border-[#444] rounded-none focus-visible:ring-0 focus-visible:border-white text-white font-mono"
                placeholder="e.g. Rust Programming / Strand-Rust-Coder-14B-v1 Q4"
              />
              {form.formState.errors.modelNumber && <span className="text-xs text-red-500">{form.formState.errors.modelNumber.message}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="vram" className="text-xs text-[#888]">VRAM_CAPACITY (GB)</Label>
              <div className="flex">
                <Input
                  id="vram"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  {...form.register("vram")}
                  className="bg-black border-[#444] rounded-none focus-visible:ring-0 focus-visible:border-white text-white font-mono flex-1 border-r-0"
                  placeholder="e.g. 24"
                />
                <span className="px-3 flex items-center text-xs font-mono uppercase tracking-wider border border-[#444] bg-[#0a0a0a] text-[#888]">GB</span>
              </div>
              {form.formState.errors.vram && <span className="text-xs text-red-500">{form.formState.errors.vram.message}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ram" className="text-xs text-[#888]">RAM_CAPACITY (GB) <span className="text-[#555]">(OPTIONAL)</span></Label>
              <div className="flex">
                <Input
                  id="ram"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  {...form.register("ram")}
                  className="bg-black border-[#444] rounded-none focus-visible:ring-0 focus-visible:border-white text-white font-mono flex-1 border-r-0"
                  placeholder="e.g. 32"
                />
                <span className="px-3 flex items-center text-xs font-mono uppercase tracking-wider border border-[#444] bg-[#0a0a0a] text-[#888]">GB</span>
              </div>
              {form.formState.errors.ram && <span className="text-xs text-red-500">{form.formState.errors.ram.message}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="internetSpeed" className="text-xs text-[#888]">UPLINK_SPEED</Label>
              <div className="flex">
                <Input
                  id="internetSpeed"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={speedValue}
                  onChange={(e) => {
                    setSpeedValue(e.target.value);
                    syncSpeed(e.target.value, speedUnit);
                  }}
                  className="bg-black border-[#444] rounded-none focus-visible:ring-0 focus-visible:border-white text-white font-mono flex-1 border-r-0"
                  placeholder="e.g. 1"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = speedUnit === "Gbps" ? "Mbps" : "Gbps";
                    setSpeedUnit(next);
                    syncSpeed(speedValue, next);
                  }}
                  className={`px-3 text-xs font-mono uppercase tracking-wider border border-[#444] hover:border-white hover:text-white transition-colors ${
                    speedUnit === "Gbps" ? "bg-white text-black border-white" : "bg-black text-[#888]"
                  }`}
                  aria-label="Toggle Gbps"
                >
                  Gbps
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = speedUnit === "Mbps" ? "Gbps" : "Mbps";
                    setSpeedUnit(next);
                    syncSpeed(speedValue, next);
                  }}
                  className={`px-3 text-xs font-mono uppercase tracking-wider border border-l-0 border-[#444] hover:border-white hover:text-white transition-colors ${
                    speedUnit === "Mbps" ? "bg-white text-black border-white" : "bg-black text-[#888]"
                  }`}
                  aria-label="Toggle Mbps"
                >
                  Mbps
                </button>
              </div>
              {form.formState.errors.internetSpeed && <span className="text-xs text-red-500">{form.formState.errors.internetSpeed.message}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs text-[#888]">WALLET_VISIBILITY</Label>
              <button
                type="button"
                onClick={() => form.setValue("walletHidden", !form.watch("walletHidden"), { shouldDirty: true })}
                className={`px-3 py-2 text-xs font-mono uppercase tracking-widest border transition-colors text-left ${
                  form.watch("walletHidden")
                    ? "bg-black text-[#ff3344] border-[#ff3344]"
                    : "bg-white text-black border-white"
                }`}
                aria-pressed={form.watch("walletHidden")}
              >
                {form.watch("walletHidden")
                  ? "[X] HIDDEN ON LIVE NODES"
                  : "[ ] PUBLIC ON LIVE NODES"}
              </button>
              <span className="text-[10px] text-[#555]">
                When hidden, the wallet is concealed on the public Live Nodes grid.
              </span>
            </div>

            <div className="flex gap-4 mt-4">
              <Button 
                type="submit" 
                disabled={createNode.isPending || updateNode.isPending}
                className="flex-1 bg-white text-black hover:bg-[#ccc] rounded-none font-bold uppercase tracking-wider"
              >
                {createNode.isPending || updateNode.isPending ? "PROCESSING..." : editingNodeId ? "UPDATE_NODE" : "INITIALIZE"}
              </Button>
              {editingNodeId && (
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => {
                    setEditingNodeId(null);
                    form.reset({ nickname: "", wallet: "", modelName: "", modelNumber: "", internetSpeed: "", vram: "", ram: "", walletHidden: false });
                    setSpeedValue("");
                    setSpeedUnit("Gbps");
                  }}
                  className="bg-black text-white border-[#444] hover:bg-[#111] hover:text-white rounded-none uppercase"
                >
                  CANCEL
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Main Content - Node List */}
      <div className="w-full md:w-2/3 flex flex-col gap-6">
        <div className="flex justify-between items-center border-b border-[#333] pb-2 gap-4 flex-wrap">
          <h2 className="text-xl font-bold tracking-widest uppercase">
            OPERATOR_NODES // SESSION: {sessionId.split('-')[0]}
          </h2>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-4">
            {Array(3).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full bg-[#111] border border-[#333] rounded-none" />
            ))}
          </div>
        ) : nodes && nodes.length > 0 ? (
          <div className="flex flex-col gap-4">
            {nodes.map((node) => (
              <div key={node.id} className="border border-[#333] p-5 bg-black hover:border-[#666] transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`status-dot w-2 h-2 rounded-full ${node.online ? 'online' : 'offline'}`} />
                    <h3 className="text-lg font-bold uppercase tracking-wider">{node.nickname}</h3>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleEdit(node)}
                      className="text-xs text-[#888] hover:text-white px-2 py-1 border border-[#333] hover:border-white transition-all uppercase"
                    >
                      EDIT
                    </button>
                    <button 
                      onClick={() => handleDelete(node.id, node.nickname)}
                      className="text-xs text-[#888] hover:text-white px-2 py-1 border border-[#333] hover:border-white transition-all uppercase"
                    >
                      TERM
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="flex flex-col col-span-2">
                    <span className="text-[#666]">WALLET</span>
                    <span className="text-white font-mono break-all">{node.wallet}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[#666]">HARDWARE</span>
                    <span className="text-white">{node.modelName || "—"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[#666]">MODEL</span>
                    <span className="text-white truncate" title={node.modelNumber ?? undefined}>{node.modelNumber || "—"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[#666]">UPLINK</span>
                    <span className="text-white">{node.internetSpeed}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[#666]">VRAM</span>
                    <span className="text-white">{node.vram ? `${String(node.vram).match(/[\d.]+/)?.[0] ?? node.vram} GB` : "—"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[#666]">RAM</span>
                    <span className="text-white">{node.ram ? `${String(node.ram).match(/[\d.]+/)?.[0] ?? node.ram} GB` : "—"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[#666]">DAILY_REWARD</span>
                    <span className="text-white font-bold">{Math.round(node.dailyAccumulated).toLocaleString("en-US")} FOR</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-[#222]">
                  <button 
                    onClick={() => setExpandedNodeId(expandedNodeId === node.id ? null : node.id)}
                    className="text-xs text-[#888] hover:text-white uppercase flex items-center gap-2"
                  >
                    {expandedNodeId === node.id ? "[-] HIDE_TX_LOG" : "[+] VIEW_TX_LOG"}
                  </button>
                  
                  {expandedNodeId === node.id && (
                    <NodeTransactions nodeId={node.id} />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-[#333] p-12 text-center text-[#888] uppercase tracking-widest bg-[#050505]">
            NO_NODES_REGISTERED
            <br />
            <span className="text-xs text-[#555] mt-2 block">USE THE CONSOLE TO INITIALIZE A NEW NODE</span>
          </div>
        )}
      </div>
    </div>
  );
}
