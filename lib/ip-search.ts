export const IP_SEARCH_EVENT = "clawradar:ip-search";

export type IpSearchStatus = "matched" | "not_found" | "invalid" | "error";

export type IpSearchPoint = {
  ip: string;
  country: string;
  portSummary: string;
  count: number;
  latitude: number;
  longitude: number;
  updatedAt: string | null;
};

export type IpSearchResult = {
  status: IpSearchStatus;
  ip: string;
  message: string;
  point: IpSearchPoint | null;
};

export function isValidIpv4(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^\d+$/.test(part)) {
      return false;
    }
    if (part.length > 1 && part.startsWith("0")) {
      return false;
    }
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}
