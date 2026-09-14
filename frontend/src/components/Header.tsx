"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "./Logo";
import { NavMenu } from "./NavMenu";
import WalletButton from "./WalletButton";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${scrolled ? "bg-frost-950/85 backdrop-blur" : ""}`}>
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="GenSupply home">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-3 sm:gap-5">
          <WalletButton />
          <NavMenu />
        </div>
      </div>
    </header>
  );
}
