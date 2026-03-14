export type IpSearchStatus = "matched" | "not_found" | "invalid" | "error";

export const IP_SEARCH_FOCUS_EVENT = "exposure:ip-search-focus";

export type IpSearchPoint = {
  ip: string;
  country: string;
  portSummary: string;
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

export function dispatchIpSearchFocus(point: IpSearchPoint) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<IpSearchPoint>(IP_SEARCH_FOCUS_EVENT, {
      detail: point,
    })
  );
}

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
