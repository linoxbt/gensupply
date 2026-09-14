"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENU_LINKS } from "@/lib/navLinks";
import { Wordmark } from "./Logo";

/**
 * One full-viewport menu at every breakpoint.
 *
 * The panel is portaled to document.body: the header uses backdrop-blur once
 * scrolled, and a backdrop-filter ancestor becomes the containing block for
 * `position: fixed` descendants - an inline panel would be trapped in the
 * header's bar instead of covering the viewport.
 */
export function NavMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const t = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    Object.assign(document.body.style, { position: "fixed", top: `-${y}px`, left: "0", right: "0" });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      Object.assign(document.body.style, { position: "", top: "", left: "", right: "" });
      window.scrollTo(0, y);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-frost-line hover:border-ice"
      >
        <span className="flex w-4 flex-col gap-[4px]" aria-hidden="true">
          <span className="h-[2px] w-full rounded bg-ice" />
          <span className="h-[2px] w-2/3 rounded bg-thermal-cool" />
        </span>
      </button>

      {mounted &&
        createPortal(
          <div
            className={`fixed inset-0 z-50 bg-frost-950/90 backdrop-blur-2xl transition-opacity duration-300 ${
              open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={!open}
          >
            <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-5 sm:px-8">
              <Wordmark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                tabIndex={open ? 0 : -1}
                aria-label="Close menu"
                className="flex size-10 items-center justify-center rounded-full border border-frost-line text-ice hover:border-ice"
              >
                ✕
              </button>
            </div>
            <nav className="flex h-[calc(100%-72px)] flex-col items-center justify-center gap-2 pb-16">
              {MENU_LINKS.map((item, i) => (
                <Link
                  key={item.href}
                  href={item.href}
                  tabIndex={open ? 0 : -1}
                  onClick={() => setOpen(false)}
                  className={`text-4xl font-semibold tracking-tight text-ice transition-colors hover:text-thermal-cool sm:text-6xl ${
                    open ? "animate-fade-rise" : ""
                  } ${pathname === item.href ? "text-thermal-cool" : ""}`}
                  style={open ? { animationDelay: `${(i + 1) * 50}ms`, animationFillMode: "backwards" } : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
