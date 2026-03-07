import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/claw-radar-icon.svg"
                alt="ClawRadar logo"
                width={36}
                height={36}
                className="size-9 rounded-full border border-border bg-card"
                priority
              />
              <span className="text-lg font-semibold tracking-tight">ClawRadar</span>
            </Link>
            <Button asChild variant="ghost" size="icon" className="rounded-full">
              <a
                href="https://github.com/kevinstackio/claw-radar"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub Profile"
              >
                <Github data-icon="inline-start" />
              </a>
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
