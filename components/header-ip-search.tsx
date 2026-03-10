"use client";

import { FormEvent, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  IP_SEARCH_EVENT,
  type IpSearchResult,
} from "@/lib/ip-search";
import {
  getIpSearchToastLevel,
  showLeveledToast,
  TOAST_IDS,
} from "@/lib/ui-toast";

export function HeaderIpSearch() {
  const [value, setValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedIp = value.trim();

    setIsLoading(true);
    try {
      const response = await fetch("/api/exposure/search-ip", {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ ip: normalizedIp }),
      });

      const result = (await response.json()) as IpSearchResult;
      const level = getIpSearchToastLevel(result.status);
      if (level) {
        showLeveledToast(level, result.message, TOAST_IDS.ipSearchFeedback);
      }

      window.dispatchEvent(
        new CustomEvent(IP_SEARCH_EVENT, {
          detail: result,
        })
      );
    } catch {
      const fallback: IpSearchResult = {
        status: "error",
        ip: normalizedIp,
        message: "Search failed, please try again.",
        point: null,
      };
      showLeveledToast("error", fallback.message, TOAST_IDS.ipSearchFeedback);
      window.dispatchEvent(
        new CustomEvent(IP_SEARCH_EVENT, {
          detail: fallback,
        })
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="min-w-0 flex-1">
      <label htmlFor="ip-search" className="sr-only">
        Search by IP address
      </label>
      <div className="mx-auto flex h-10 w-full max-w-2xl items-center gap-2 rounded-md border border-border bg-background/95 px-2 shadow-sm">
        <Search className="size-4 text-muted-foreground" />
        <input
          id="ip-search"
          name="ip"
          type="search"
          className="h-full min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
          autoComplete="off"
          value={value}
          onChange={(event) => {
            setValue(event.currentTarget.value);
          }}
        />
        <Button type="submit" size="sm" className="h-8 shrink-0 px-3" disabled={isLoading}>
          {isLoading ? "Searching..." : "Search"}
        </Button>
      </div>
    </form>
  );
}