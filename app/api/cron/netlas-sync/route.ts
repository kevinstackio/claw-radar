import { NextResponse } from "next/server";

import { runNetlasValidation } from "@/scripts/validate-netlas-neon.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function asInt(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveRequestedMaxKeys(url: URL): number | undefined {
  const queryValue = url.searchParams.get("max_keys");
  const envValue = process.env.NETLAS_CRON_MAX_KEYS ?? process.env.NETLAS_VALIDATION_MAX_KEYS ?? "2";
  const resolved = asInt(queryValue ?? envValue, Number.NaN);
  return Number.isFinite(resolved) ? clamp(resolved, 1, 50) : undefined;
}

function resolveCronMaxPages(url: URL): number {
  const queryValue = url.searchParams.get("max_pages");
  const envValue = process.env.NETLAS_CRON_MAX_PAGES ?? process.env.NETLAS_VALIDATION_MAX_PAGES ?? "3";
  return clamp(asInt(queryValue ?? envValue, 3), 1, 500);
}

function resolveCronTimeoutMs(url: URL): number {
  const queryValue = url.searchParams.get("timeout_ms");
  const envValue = process.env.NETLAS_CRON_TIMEOUT_MS ?? process.env.NETLAS_TIMEOUT_MS ?? "12000";
  return clamp(asInt(queryValue ?? envValue, 12000), 1000, 60000);
}

function resolveAuthorization(request: Request): { ok: boolean; status: number; error: string | null } {
  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
  if (!cronSecret) {
    return {
      ok: false,
      status: 500,
      error: "cron_secret_required",
    };
  }

  const expected = `Bearer ${cronSecret}`;
  const authorization = String(request.headers.get("authorization") ?? "").trim();
  if (authorization !== expected) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
    };
  }
  return { ok: true, status: 200, error: null };
}

export async function GET(request: Request) {
  const auth = resolveAuthorization(request);
  if (!auth.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: auth.error,
      },
      { status: auth.status }
    );
  }

  try {
    const url = new URL(request.url);
    const maxKeys = resolveRequestedMaxKeys(url);
    const maxPages = resolveCronMaxPages(url);
    const timeoutMs = resolveCronTimeoutMs(url);
    const result = await runNetlasValidation({
      maxKeys,
      maxPages,
      timeoutMs,
      runType: "scheduled",
    });

    return NextResponse.json({
      ok: true,
      trigger: "external-cron",
      maxKeysRequested: maxKeys ?? null,
      maxPages,
      timeoutMs,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
