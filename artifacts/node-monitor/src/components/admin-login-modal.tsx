import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AdminLoginModalProps {
  onClose: () => void;
  onSuccess: (token: string) => void;
}

export function AdminLoginModal({ onClose, onSuccess }: AdminLoginModalProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "INVALID_PASSWORD" : "AUTH_ERROR");
        return;
      }
      const data = (await res.json()) as { token: string };
      onSuccess(data.token);
    } catch {
      setError("NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="border border-[#444] bg-black w-full max-w-sm p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white to-transparent opacity-50" />
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold uppercase tracking-widest glow-text">ADMIN_AUTH</h2>
          <button
            onClick={onClose}
            className="text-[#888] hover:text-white text-xs uppercase"
            aria-label="Close"
          >
            [X]
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-pw" className="text-xs text-[#888]">PASSWORD</Label>
            <Input
              id="admin-pw"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-black border-[#444] rounded-none focus-visible:ring-0 focus-visible:border-white text-white font-mono"
              placeholder="••••••••"
            />
          </div>
          {error && <span className="text-xs text-[#ff3344] uppercase tracking-widest">{error}</span>}
          <Button
            type="submit"
            disabled={loading || !password}
            className="bg-white text-black hover:bg-[#ccc] rounded-none font-bold uppercase tracking-wider"
          >
            {loading ? "AUTHENTICATING..." : "AUTHENTICATE"}
          </Button>
        </form>
      </div>
    </div>
  );
}
