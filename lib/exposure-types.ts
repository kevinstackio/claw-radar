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
  instanceCount: number;
  value: [number, number, number];
};

export type ExposureSnapshot = {
  generatedAt: string | null;
  sourceFile: string | null;
  totalInstances: number;
  countries: CountryExposure[];
  points: ExposurePoint[];
  note: string | null;
};
