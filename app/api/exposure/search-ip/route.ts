import { NextResponse } from "next/server";

import { loadLatestExposureSnapshot } from "@/lib/exposure-snapshot";
import type { IpSearchResult } from "@/lib/ip-search";
import { isValidIpv4 } from "@/lib/ip-search";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  let ip = "";

  try {
    const payload = (await request.json()) as { ip?: unknown };
    if (typeof payload?.ip === "string") {
      ip = payload.ip.trim();
    }
  } catch {
    ip = "";
  }

  if (!isValidIpv4(ip)) {
    return NextResponse.json<IpSearchResult>({
      status: "invalid",
      ip,
      message: `输入的 IP 格式无效：${ip || "(empty)"}`,
      point: null,
    });
  }

  try {
    const snapshot = await loadLatestExposureSnapshot();
    const matchedPoint = snapshot.points.find((point) => point.ip === ip) ?? null;

    if (!matchedPoint) {
      return NextResponse.json<IpSearchResult>({
        status: "not_found",
        ip,
        message: `未匹配到 IP ${ip}，当前数据库快照中没有该记录。`,
        point: null,
      });
    }

    const [longitude, latitude] = matchedPoint.value;

    return NextResponse.json<IpSearchResult>({
      status: "matched",
      ip,
      message: `已匹配到 IP ${ip}，地图已定位并高亮该点位。`,
      point: {
        ip: matchedPoint.ip,
        country: matchedPoint.country,
        portSummary: matchedPoint.portSummary,
        count: matchedPoint.count,
        latitude,
        longitude,
        updatedAt: snapshot.generatedAt,
      },
    });
  } catch {
    return NextResponse.json<IpSearchResult>({
      status: "error",
      ip,
      message: "搜索失败，请稍后重试。",
      point: null,
    });
  }
}
