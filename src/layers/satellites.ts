import * as satellite from "satellite.js";
import * as Cesium from "cesium";

export interface SatelliteRecord {
  name: string;
  noradId: string;
  category: "active" | "stations" | "military";
  satrec: satellite.SatRec;
  color: Cesium.Color;
}

const CATEGORY_COLORS: Record<string, Cesium.Color> = {
  active: Cesium.Color.fromCssColorString("#00ff41"),
  stations: Cesium.Color.fromCssColorString("#00cfff"),
  military: Cesium.Color.fromCssColorString("#ff4444"),
};

function parseTLEText(
  text: string,
  category: "active" | "stations" | "military"
): SatelliteRecord[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const records: SatelliteRecord[] = [];

  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    // Validate TLE line identifiers
    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) continue;

    const satrec = satellite.twoline2satrec(line1, line2);
    if (satrec.error !== 0) continue;

    // NORAD catalog number is at columns 3–7 (0-indexed: chars 2–6)
    const noradId = line1.substring(2, 7).trim();

    records.push({
      name,
      noradId,
      category,
      satrec,
      color: CATEGORY_COLORS[category],
    });
  }

  return records;
}

export async function fetchTLEs(
  category: "active" | "stations" | "military"
): Promise<SatelliteRecord[]> {
  const directUrl = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${category}&FORMAT=tle`;
  const proxyUrl = `http://localhost:3001/tle?group=${category}`;

  let text: string | null = null;

  // Try direct fetch first
  try {
    const res = await fetch(directUrl);
    if (res.ok) {
      text = await res.text();
    }
  } catch {
    // Fall through to proxy
  }

  // CORS fallback via local proxy
  if (!text) {
    const res = await fetch(proxyUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch TLEs for category "${category}" via proxy: ${res.status}`);
    }
    text = await res.text();
  }

  return parseTLEText(text, category);
}

export async function loadAllTLEs(): Promise<SatelliteRecord[]> {
  const [active, stations, military] = await Promise.all([
    fetchTLEs("active"),
    fetchTLEs("stations"),
    fetchTLEs("military"),
  ]);

  return [...active, ...stations, ...military];
}

export function propagateAll(
  records: SatelliteRecord[],
  date: Date
): { record: SatelliteRecord; cartesian: Cesium.Cartesian3 }[] {
  return [];
}

export function computeOrbitalPath(record: SatelliteRecord): Cesium.Cartesian3[] {
  return [];
}
