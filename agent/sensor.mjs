// Simulated reefer container logger.
//
// Stands in for the probe + GPS on a refrigerated container. Each scenario is
// a physically honest story the credibility round should classify correctly:
//
//   nominal  compressor holds setpoint; no claim should ever be filed
//   breach   compressor fails; cargo space warms toward ambient on a thermal
//            time constant, the shape a real failure has -> GENUINE, paid
//   fault    probe glitches: instant jump of tens of degrees, then a frozen
//            flatline -> SENSOR_FAULT
//   tamper   readings are honest, but the uploader pins a doctored copy under
//            a root computed from the honest ones -> TAMPERED on verification
//
// Coordinates are integer 1e-5 degrees; temperatures integer tenths of a degree.

const ROUTES = {
  "rotterdam-lagos": { from: [51.9496, 4.1453], to: [6.4531, 3.3958], origin: "Rotterdam, NL", destination: "Lagos, NG" },
  "santos-antwerp": { from: [-23.9608, -46.3336], to: [51.2637, 4.3997], origin: "Santos, BR", destination: "Antwerp, BE" },
};

export const SCENARIOS = ["nominal", "breach", "fault", "tamper"];

function prng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function routeInfo(name = "rotterdam-lagos") {
  const r = ROUTES[name];
  if (!r) throw new Error(`unknown route ${name}`);
  return r;
}

export function makeSensor({
  scenario = "nominal",
  device,
  route = "rotterdam-lagos",
  seed = 7,
  setpointX10 = 30,
  ambientX10 = 270,
  failAfter = 6,       // readings of normal operation before the incident
  warmPerReading = 0.14, // fraction of the gap to ambient closed each reading
  voyageReadings = 2000,
}) {
  if (!SCENARIOS.includes(scenario)) throw new Error(`unknown scenario ${scenario}`);
  if (!device) throw new Error("device address required");
  const rand = prng(seed);
  const { from, to } = routeInfo(route);
  let i = 0;
  let temp = setpointX10;

  function position(k) {
    const f = Math.min(1, k / voyageReadings) * 0.02; // a sliver of the voyage per demo run
    const lat = from[0] + (to[0] - from[0]) * f;
    const lon = from[1] + (to[1] - from[1]) * f;
    return [Math.round(lat * 1e5 + (rand() - 0.5) * 4), Math.round(lon * 1e5 + (rand() - 0.5) * 4)];
  }

  return {
    scenario,
    read(t) {
      const noise = Math.round((rand() - 0.5) * 4);
      if (scenario === "breach" && i >= failAfter) {
        temp = temp + (ambientX10 - temp) * warmPerReading;
      } else if (scenario === "fault" && i >= failAfter) {
        temp = 850; // probe reports 85.0C out of nowhere, and sticks there
      } else {
        temp = setpointX10;
      }
      const c = scenario === "fault" && i >= failAfter ? 850 : Math.round(temp) + noise;
      const [lat, lon] = position(i);
      i += 1;
      return { t: Math.floor(t), c, lat, lon, d: device.toLowerCase() };
    },
  };
}

// What the uploader actually pins in the tamper scenario: every reading
// nudged 6C hotter - enough to fake a breach of the 8C demo threshold from a
// 3C setpoint - so the pinned bytes no longer match the committed root.
export function doctor(readings) {
  return readings.map((r) => ({ ...r, c: r.c + 60 }));
}

// The agent's local rule: the same longest-run definition the contract uses,
// so the agent files exactly when the contract will find a breach.
export function longestBreach(readings, thresholdX10, maxGapSeconds) {
  let best = { seconds: 0, peak: 0 };
  let start = null;
  let peak = 0;
  let prevT = null;
  for (const r of readings) {
    const gapOk = prevT !== null && r.t - prevT <= maxGapSeconds;
    if (r.c > thresholdX10) {
      if (start === null || !gapOk) { start = r.t; peak = 0; }
      peak = Math.max(peak, r.c - thresholdX10);
      const seconds = r.t - start;
      if (seconds > best.seconds || (seconds === best.seconds && peak > best.peak)) best = { seconds, peak };
    } else {
      start = null;
    }
    prevT = r.t;
  }
  return best;
}
