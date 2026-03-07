export type CountryExposure = {
  name: string;
  value: number;
};

export type ExposurePoint = {
  name: string;
  ip: string;
  country: string;
  portSummary: string;
  count: number;
  value: [number, number, number];
};

export type ExposureSnapshot = {
  generatedAt: string | null;
  sourceFile: string | null;
  totalRecords: number;
  publicRecords: number;
  plottedPoints: number;
  countries: CountryExposure[];
  points: ExposurePoint[];
  note: string | null;
};
