export type CountryExposure = {
  name: string;
  value: number;
};

export type ExposurePoint = {
  name: string;
  ip: string;
  country: string;
  portSummary: string;
  isp: string | null;
  asnName: string | null;
  asnNumber: string | null;
  organization: string | null;
  instanceCount: number;
  count: number;
  value: [number, number, number];
};

export type ExposureSnapshot = {
  generatedAt: string | null;
  sourceFile: string | null;
  totalInstances: number;
  totalRecords: number;
  publicRecords: number;
  plottedPoints: number;
  countries: CountryExposure[];
  points: ExposurePoint[];
  note: string | null;
};
