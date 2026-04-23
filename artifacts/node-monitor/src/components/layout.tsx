import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

export function Layout({ children }: { children: React.ReactNode }) {
  const [time, setTime] = useState("");
  const [location] = useLocation();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const [scanText, setScanText] = useState("SCANNING NETWORK...");
  
  useEffect(() => {
    const texts = [
      "SCANNING NETWORK...",
      "ANALYZING NODES...",
      "VERIFYING PROTOCOLS...",
      "SYNCING DATA..."
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % texts.length;
      setScanText(texts[i]);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden flex flex-col font-mono selection:bg-white selection:text-black">
      <div className="scanline" />
      
      {/* Background Grid */}
      <div className="fixed inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <header className="border-b border-[#333] bg-black z-10 relative">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold tracking-widest glow-text">DR. MONITOR</h1>
            <div className="hidden md:flex text-xs text-[#888] animate-pulse">
              [{scanText}]
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <nav className="flex gap-4">
              <Link href="/" className={`hover:text-white hover:glow-text transition-all ${location === '/' ? 'text-white border-b border-white' : 'text-[#888]'}`}>
                [LIVE_NODES]
              </Link>
              <Link href="/dashboard" className={`hover:text-white hover:glow-text transition-all ${location === '/dashboard' ? 'text-white border-b border-white' : 'text-[#888]'}`}>
                [DASHBOARD]
              </Link>
            </nav>
            <div className="text-[#888] border border-[#333] px-2 py-1 bg-[#111]">
              SYS.TIME: <span className="text-white">{time}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 relative z-10">
        {children}
      </main>
      
      <footer className="border-t border-[#333] py-2 px-4 text-xs text-center text-[#666] bg-black z-10 relative">
        SECURE CONNECTION ESTABLISHED // E2E ENCRYPTED
      </footer>
    </div>
  );
}
