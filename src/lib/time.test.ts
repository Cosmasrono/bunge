// Quick checks: npx tsx src/lib/time.test.ts
import assert from "node:assert/strict";
import { localStringToUtc, nextOccurrence } from "./time";

const tz = "Africa/Nairobi"; // UTC+3, no daylight saving
const iso = (d: Date | null) => d?.toISOString() ?? null;

// Wall time -> UTC
assert.equal(iso(localStringToUtc("2026-11-04T09:00", tz)), "2026-11-04T06:00:00.000Z");
assert.equal(localStringToUtc("2026-02-30T09:00", tz), null, "invalid date rejected");

// One-off
const once = { startLocal: "2026-11-10T09:00", timezone: tz, repeat: "none" as const };
assert.equal(iso(nextOccurrence(once, new Date("2026-11-01T00:00:00Z"))), "2026-11-10T06:00:00.000Z");
assert.equal(nextOccurrence(once, new Date("2026-11-11T00:00:00Z")), null);

// Daily, started long ago
const daily = { startLocal: "2026-01-01T09:00", timezone: tz, repeat: "daily" as const };
assert.equal(iso(nextOccurrence(daily, new Date("2026-11-04T05:00:00Z"))), "2026-11-04T06:00:00.000Z");
assert.equal(iso(nextOccurrence(daily, new Date("2026-11-04T06:00:00Z"))), "2026-11-05T06:00:00.000Z");

// Weekdays: Friday 7 Nov 2026 after 9am -> Monday 9 Nov
const wd = { startLocal: "2026-11-02T09:00", timezone: tz, repeat: "weekdays" as const };
assert.equal(iso(nextOccurrence(wd, new Date("2026-11-06T07:00:00Z"))), "2026-11-09T06:00:00.000Z");
// Start date itself on a Saturday -> first is Monday
const wdSat = { startLocal: "2026-11-07T09:00", timezone: tz, repeat: "weekdays" as const };
assert.equal(iso(nextOccurrence(wdSat, new Date("2026-11-01T00:00:00Z"))), "2026-11-09T06:00:00.000Z");

// Weekly
const weekly = { startLocal: "2026-11-02T14:30", timezone: tz, repeat: "weekly" as const };
assert.equal(iso(nextOccurrence(weekly, new Date("2026-11-03T00:00:00Z"))), "2026-11-09T11:30:00.000Z");

// Monthly on the 31st -> clamps to 30 Nov / 28 Feb
const monthly = { startLocal: "2026-10-31T10:00", timezone: tz, repeat: "monthly" as const };
assert.equal(iso(nextOccurrence(monthly, new Date("2026-11-01T00:00:00Z"))), "2026-11-30T07:00:00.000Z");
assert.equal(iso(nextOccurrence(monthly, new Date("2027-02-01T00:00:00Z"))), "2027-02-28T07:00:00.000Z");

// Daylight-saving zone keeps wall time: 9:00 New York before and after DST ends (1 Nov 2026)
const ny = { startLocal: "2026-10-30T09:00", timezone: "America/New_York", repeat: "daily" as const };
assert.equal(iso(nextOccurrence(ny, new Date("2026-10-31T00:00:00Z"))), "2026-10-31T13:00:00.000Z");
assert.equal(iso(nextOccurrence(ny, new Date("2026-11-02T00:00:00Z"))), "2026-11-02T14:00:00.000Z");

console.log("time.ts: all checks passed");
