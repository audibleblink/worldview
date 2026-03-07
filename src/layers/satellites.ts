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
  const results: { record: SatelliteRecord; cartesian: Cesium.Cartesian3 }[] = [];
  const gmst = satellite.gstime(date);

  for (const record of records) {
    const result = satellite.propagate(record.satrec, date);

    // Skip if no valid position (decayed, not yet launched, or error)
    if (!result.position || typeof result.position === "boolean") continue;

    const geo = satellite.eciToGeodetic(result.position as satellite.EciVec3<number>, gmst);

    // geo.height is in km; Cesium needs meters
    const cartesian = Cesium.Cartesian3.fromRadians(
      geo.longitude,
      geo.latitude,
      geo.height * 1000
    );

    results.push({ record, cartesian });
  }

  return results;
}

/**
 * Creates a 32×32 glow texture canvas data URL.
 * White/color center → transparent edge radial gradient.
 * Runs in browser context only.
 */
export function createGlowTexture(color: string): string {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2;
  const cy = size / 2;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  gradient.addColorStop(0, "white");
  gradient.addColorStop(0.3, color);
  gradient.addColorStop(1, "transparent");

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return canvas.toDataURL();
}

export class SatelliteLayer {
  private viewer: Cesium.Viewer;
  private records: SatelliteRecord[] = [];
  private billboards: Cesium.BillboardCollection | null = null;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private billboardMap: Map<string, Cesium.Billboard> = new Map(); // noradId → billboard
  private onCountUpdate: ((n: number | null) => void) | null = null;

  constructor(viewer: Cesium.Viewer, onCountUpdate?: (n: number | null) => void) {
    this.viewer = viewer;
    this.onCountUpdate = onCountUpdate ?? null;
  }

  async show(records: SatelliteRecord[]): Promise<void> {
    this.records = records;

    // Create BillboardCollection and add to scene
    this.billboards = new Cesium.BillboardCollection({ scene: this.viewer.scene });
    this.viewer.scene.primitives.add(this.billboards);

    // Initial position propagation
    const positions = propagateAll(this.records, new Date());

    // Add one billboard per position
    for (const { record, cartesian } of positions) {
      const img = createGlowTexture(record.color.toCssHexString());
      const billboard = this.billboards.add({
        position: cartesian,
        image: img,
        width: 16,
        height: 16,
        color: record.color,
        id: record.noradId, // for pick resolution
      });
      this.billboardMap.set(record.noradId, billboard);
    }

    // Start update loop (every 5 seconds)
    this.updateInterval = setInterval(() => this.updatePositions(), 5000);

    // Notify count
    this.onCountUpdate?.(this.billboardMap.size);
  }

  hide(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.billboards) {
      this.viewer.scene.primitives.remove(this.billboards);
      this.billboards = null;
    }
    this.billboardMap.clear();
    this.records = [];
    this.onCountUpdate?.(null);
  }

  updatePositions(): void {
    if (!this.billboards) return;
    const positions = propagateAll(this.records, new Date());
    for (const { record, cartesian } of positions) {
      const bb = this.billboardMap.get(record.noradId);
      if (bb) bb.position = cartesian;
    }
    // Update count (only visible ones)
    const visibleCount = [...this.billboardMap.values()].filter((b) => b.show).length;
    this.onCountUpdate?.(visibleCount);
  }

  getBillboardCollection(): Cesium.BillboardCollection | null {
    return this.billboards;
  }

  getRecords(): SatelliteRecord[] {
    return this.records;
  }

  getBillboard(noradId: string): Cesium.Billboard | undefined {
    return this.billboardMap.get(noradId);
  }
}

export function computeOrbitalPath(record: SatelliteRecord): Cesium.Cartesian3[] {
  return [];
}
