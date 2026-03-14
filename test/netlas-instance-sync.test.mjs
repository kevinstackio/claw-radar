import assert from "node:assert/strict";
import test from "node:test";

import { mergeInstanceObservations } from "../lib/server/netlas-instance-sync.mjs";

test("mergeInstanceObservations unions ports, protocols, transports, and Netlas item ids", () => {
  const merged = mergeInstanceObservations(
    {
      ip: "95.111.246.10",
      ports: [3000, 80],
      transports: ["tcp"],
      protocols: ["http"],
      netlasItemIds: ["item-a"],
      country: "DE",
      countryCode: "DE",
      city: "Nuremberg",
      latitude: 49.405,
      longitude: 11.1617,
      isp: "Example ISP",
      asnName: null,
      asnNumber: null,
      organization: null,
    },
    {
      ip: "95.111.246.10",
      ports: [443, 80],
      transports: ["tcp", "udp"],
      protocols: ["https", "http"],
      netlasItemIds: ["item-b", "item-a"],
      country: "DE",
      countryCode: "DE",
      city: "Nuremberg",
      latitude: 49.405,
      longitude: 11.1617,
      isp: null,
      asnName: null,
      asnNumber: null,
      organization: null,
    }
  );

  assert.deepEqual(merged.ports, [80, 443, 3000]);
  assert.deepEqual(merged.transports, ["tcp", "udp"]);
  assert.deepEqual(merged.protocols, ["http", "https"]);
  assert.deepEqual(merged.netlasItemIds, ["item-a", "item-b"]);
});

test("mergeInstanceObservations keeps meaningful geo metadata when incoming value is Unknown or empty", () => {
  const merged = mergeInstanceObservations(
    {
      ip: "203.0.113.10",
      ports: [80],
      transports: ["tcp"],
      protocols: ["http"],
      netlasItemIds: [],
      country: "Germany",
      countryCode: "DE",
      city: "Nuremberg",
      latitude: 49.405,
      longitude: 11.1617,
      isp: null,
      asnName: null,
      asnNumber: null,
      organization: null,
    },
    {
      ip: "203.0.113.10",
      ports: [80],
      transports: ["tcp"],
      protocols: ["http"],
      netlasItemIds: [],
      country: "Unknown",
      countryCode: "",
      city: "  ",
      latitude: null,
      longitude: null,
      isp: null,
      asnName: null,
      asnNumber: null,
      organization: null,
    }
  );

  assert.equal(merged.country, "Germany");
  assert.equal(merged.countryCode, "DE");
  assert.equal(merged.city, "Nuremberg");
  assert.equal(merged.latitude, 49.405);
  assert.equal(merged.longitude, 11.1617);
});

test("mergeInstanceObservations updates coordinates and org fields when incoming record is more complete", () => {
  const merged = mergeInstanceObservations(
    {
      ip: "198.51.100.25",
      ports: [80],
      transports: [],
      protocols: ["http"],
      netlasItemIds: [],
      country: "United States",
      countryCode: "US",
      city: null,
      latitude: 37.7749,
      longitude: -122.4194,
      isp: null,
      asnName: null,
      asnNumber: null,
      organization: null,
    },
    {
      ip: "198.51.100.25",
      ports: [443],
      transports: ["tcp"],
      protocols: ["https"],
      netlasItemIds: ["item-z"],
      country: "United States",
      countryCode: "US",
      city: "San Francisco",
      latitude: 37.775,
      longitude: -122.4195,
      isp: "Cloud Provider",
      asnName: "Example Transit",
      asnNumber: "64500",
      organization: "Example Org",
    }
  );

  assert.equal(merged.city, "San Francisco");
  assert.equal(merged.latitude, 37.775);
  assert.equal(merged.longitude, -122.4195);
  assert.equal(merged.isp, "Cloud Provider");
  assert.equal(merged.asnName, "Example Transit");
  assert.equal(merged.asnNumber, "64500");
  assert.equal(merged.organization, "Example Org");
});
