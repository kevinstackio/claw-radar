import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { Github } from "lucide-react";
import { HeaderIpSearch } from "@/components/header-ip-search";
import { AppToaster } from "@/components/app-toaster";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "ClawRadar",
  description:
    "ClawRadar visualizes publicly exposed OpenClaw instances worldwide, highlighting potential security risks.",
  icons: {
    icon: "/claw-radar-icon.svg",
    shortcut: "/claw-radar-icon.svg",
    apple: "/claw-radar-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="min-h-screen bg-background text-foreground">
        <header
          className="fixed inset-x-0 top-0 z-50 border-b border-black/10 bg-white/30 shadow-[0_6px_24px_rgba(15,23,42,0.10)] dark:border-white/10 dark:bg-black/25"
          style={{
            backdropFilter: "blur(16px) saturate(140%)",
            WebkitBackdropFilter: "blur(16px) saturate(140%)",
          }}
        >
          <div className="flex h-16 w-full items-center gap-3 px-5">
            <Link href="/" className="flex shrink-0 items-center gap-3">
              <Image
                src="/claw-radar-icon.svg"
                alt="ClawRadar logo"
                width={42}
                height={42}
                className="size-10 rounded-full border border-border bg-card"
                priority
              />
              <span className="hidden text-lg font-semibold tracking-tight sm:inline">ClawRadar</span>
            </Link>
            <HeaderIpSearch />
            <a
              href="https://github.com/kevinstackio/claw-radar"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub Profile"
              className="inline-flex size-10 shrink-0 items-center justify-center text-foreground/80 transition-colors hover:text-foreground"
            >
              <Github className="size-6" strokeWidth={2.2} />
            </a>
          </div>
        </header>
        <main className="mt-[calc(4rem+20px)] h-[calc(100dvh-4rem-40px)] w-full px-5 pb-5">
          {children}
        </main>
        <AppToaster />
      </body>
    </html>
  );
}
