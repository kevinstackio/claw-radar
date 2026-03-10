import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { Github } from "lucide-react";
import { HeaderIpSearch } from "@/components/header-ip-search";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppToaster } from "@/components/app-toaster";
import { informationText } from "@/lib/ui-information";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const COPYRIGHT_START_YEAR = 2026;

const THEME_INIT_SCRIPT = `
(function () {
  const storageKey = "claw-radar-theme";
  const storedTheme = window.localStorage.getItem(storageKey);
  const resolvedTheme =
    storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";

  const root = document.documentElement;
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
})();
`;

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
    <html lang="en" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <body className="flex h-dvh flex-col overflow-hidden bg-background pb-2 text-foreground">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />

        <header className="shrink-0 border-b border-border bg-background">
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
              <span className={cn("hidden tracking-tight sm:inline", informationText.l1Value)}>
                ClawRadar
              </span>
            </Link>
            <HeaderIpSearch />
            <div className="flex shrink-0 items-center gap-1">
              <TooltipProvider delayDuration={120}>
                <ThemeToggle />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="ghost" size="icon" className="size-10 shrink-0">
                      <a
                        href="https://github.com/kevinstackio/claw-radar"
                        target="_blank"
                        rel="noreferrer"
                        aria-label="GitHub Profile"
                      >
                        <Github className="size-6" strokeWidth={2.2} />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Open GitHub repository</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </header>

        <main className="min-h-0 w-full flex-1 overflow-hidden bg-background px-5 pt-5">
          {children}
        </main>

        <footer className="shrink-0 bg-background">
          <div className={cn("flex h-10 items-center justify-center px-5", informationText.l4Meta)}>
            <span>{`Copyright (c) ${copyrightYearLabel} Kevin Lin`}</span>
            <span className="mx-1.5">|</span>
            <a
              href="https://kevinstack.dev"
              target="_blank"
              rel="noreferrer"
              className={informationText.metaLink}
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
