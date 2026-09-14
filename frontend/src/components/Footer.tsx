import { CONTRACT_ADDRESS, EXPLORER_URL } from "@/lib/config";
import { Mark } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-frost-line/60 bg-frost-950">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 text-sm text-frost-mute sm:grid-cols-3 sm:px-8">
        <div className="flex items-start gap-3">
          <Mark size={26} />
          <p>Cold-chain cover that settles itself from verified sensor data, under GenLayer consensus.</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-frost-mute/70">Contract · Studio Network</p>
          {CONTRACT_ADDRESS ? (
            <a className="break-all font-mono text-xs text-ice hover:text-thermal-cool" href={`${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
              {CONTRACT_ADDRESS}
            </a>
          ) : (
            <p className="text-thermal-warm">not configured</p>
          )}
        </div>
        <div className="space-y-1 sm:text-right">
          <a className="block text-ice hover:text-thermal-cool" href="https://github.com/linoxbt/gensupply" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
          <p className="text-xs">Testnet software. No real cargo is insured.</p>
        </div>
      </div>
    </footer>
  );
}
