export type CountryExposure = {
  name: string;
  value: number;
};

export type ExposurePoint = {
  name: string;
  ip: string;
  country: string;
  city: string | null;
  portSummary: string;
  isp: string | null;
  asnName: string | null;
  asnNumber: string | null;
  organization: string | null;
  ipCount: number;
  value: [number, number, number];
};

export type ExposureSnapshot = {
  generatedAt: string | null;
  sourceFile: string | null;
  totalIps: number;
  countries: CountryExposure[];
  points: ExposurePoint[];
  note: string | null;
};
