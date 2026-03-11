import { NextResponse } from "next/server";

import { runNetlasValidation } from "@/scripts/validate-netlas-neon.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

function asInt(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveRequestedMaxKeys(url: URL): number | undefined {
  const queryValue = url.searchParams.get("max_keys");
  const envValue = process.env.NETLAS_VALIDATION_MAX_KEYS;
  const resolved = asInt(queryValue ?? envValue, Number.NaN);
  return Number.isFinite(resolved) ? resolved : undefined;
}

function isAuthorized(request: Request): boolean {
  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
  if (!cronSecret) return true;

  const expected = `Bearer ${cronSecret}`;
  const authorization = String(request.headers.get("authorization") ?? "").trim();
  return authorization === expected;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "unauthorized",
      },
      { status: 401 }
    );
  }

  try {
    const maxKeys = resolveRequestedMaxKeys(new URL(request.url));
    const result = await runNetlasValidation({
      maxKeys,
      runType: "scheduled",
    });

    return NextResponse.json({
      ok: true,
      trigger: "vercel-cron",
      maxKeysRequested: maxKeys ?? null,
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
