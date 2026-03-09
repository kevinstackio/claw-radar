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

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const COPYRIGHT_START_YEAR = 2026;

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
  const currentYear = new Date().getFullYear();
  const copyrightYearLabel =
    currentYear > COPYRIGHT_START_YEAR
      ? `${COPYRIGHT_START_YEAR}-${currentYear}`
      : `${COPYRIGHT_START_YEAR}`;

  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="flex h-dvh flex-col overflow-hidden bg-[#f2f4f7] text-foreground pb-2 dark:bg-[#0f1115]">
        <header
          className="shrink-0 bg-white/30 shadow-[0_6px_24px_rgba(15,23,42,0.10)] dark:bg-black/25"
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

        <main className="min-h-0 flex-1 w-full overflow-hidden bg-[#f2f4f7] px-5 pt-5 dark:bg-[#0f1115]">{children}</main>

        <footer className="shrink-0 bg-gradient-to-t from-[#e8edf3] to-[#eef2f7] dark:from-[#11141b] dark:to-[#151a22]">
          <div className="flex h-10 items-center justify-center px-5 text-sm font-medium text-muted-foreground">
            <span>{`Copyright © ${copyrightYearLabel} Kevin Lin`}</span>
            <span className="mx-1.5">·</span>
            <a
              href="https://kevinstack.dev"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              kevinstack.dev
            </a>
          </div>
        </footer>

        <AppToaster />
      </body>
    </html>
  );
}
