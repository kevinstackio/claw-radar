"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "claw-radar-theme";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function getCurrentTheme(): Theme {
  if (typeof document === "undefined") {
    return "light";
  }

  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const toggleTheme = () => {
    const currentTheme = getCurrentTheme();
    const nextTheme: Theme = currentTheme === "dark" ? "light" : "dark";

    applyTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          className="size-10 shrink-0"
        >
          <Moon className="size-5 dark:hidden" strokeWidth={2.2} />
          <Sun className="hidden size-5 dark:block" strokeWidth={2.2} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="dark:hidden">Switch to dark mode</span>
        <span className="hidden dark:inline">Switch to light mode</span>
      </TooltipContent>
    </Tooltip>
  );
}
