import * as satellite from "satellite.js";
import { lookAtTarget, unlockCamera } from "../camera.ts";

// Cesium is loaded as a UMD global via <script src="/cesium/Cesium.js">
declare const Cesium: typeof import("cesium");

export interface SatelliteRecord {
  name: string;
  noradId: string;
  category: "stations" | "military" | "starlink" | "gnss" | "research";
  satrec: satellite.SatRec;
  color: Cesium.Color;
}

const CATEGORY_COLORS: Record<string, Cesium.Color> = {
  stations: Cesium.Color.fromCssColorString("#00cfff"),
  military: Cesium.Color.fromCssColorString("#ff4444"),
  starlink: Cesium.Color.fromCssColorString("#ffffff"),
  gnss: Cesium.Color.fromCssColorString("#ffaa00"),
  research: Cesium.Color.fromCssColorString("#aa44ff"),
};

function parseTLEText(
  text: string,
  category: "stations" | "military" | "starlink" | "gnss" | "research"
): SatelliteRecord[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const records: SatelliteRecord[] = [];

  for (let i = 0; i + 2 < lines.length; i += 3) {
    // Loop guard ensures all three indices are in bounds
    const name = lines[i]!;
    const line1 = lines[i + 1]!;
    const line2 = lines[i + 2]!;

    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) continue;

    const satrec = satellite.twoline2satrec(line1, line2);
    if (satrec.error !== 0) continue;

    // NORAD catalog number: columns 3–7 (0-indexed chars 2–6)
    const noradId = line1.substring(2, 7).trim();
    const color = CATEGORY_COLORS[category]!;

    records.push({ name, noradId, category, satrec, color });
  }

  return records;
}

// Maps UI categories to CelesTrak group names
const CATEGORY_TO_GROUPS: Record<string, string[]> = {
  stations: ["stations"],
  military: ["military"],
  starlink: ["starlink"],
  gnss: ["gnss"],
  research: ["science"],
  // research: ["weather", "science"],
};

export async function fetchTLEs(
  category: "stations" | "military" | "starlink" | "gnss" | "research"
): Promise<SatelliteRecord[]> {
  const groups = CATEGORY_TO_GROUPS[category] || [category];
  const allRecords: SatelliteRecord[] = [];

  for (const group of groups) {
    const directUrl = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
    const proxyUrl = `http://localhost:3001/tle?group=${group}`;

    // Try direct fetch first, fall back to local CORS proxy
    let text: string | null = null;
    try {
      const res = await fetch(directUrl);
      if (res.ok) text = await res.text();
    } catch {
      // fall through to proxy
    }

    if (!text) {
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch TLEs for "${group}" via proxy: ${res.status}`);
      }
      text = await res.text();
    }

    allRecords.push(...parseTLEText(text, category));
  }

  return allRecords;
}

export async function loadAllTLEs(): Promise<SatelliteRecord[]> {
  const [stations, military, starlink, gnss, research] = await Promise.all([
    fetchTLEs("stations"),
    fetchTLEs("military"),
    fetchTLEs("starlink"),
    fetchTLEs("gnss"),
    fetchTLEs("research"),
  ]);
  return [...stations, ...military, ...starlink, ...gnss, ...research];
}

export function propagateAll(
  records: SatelliteRecord[],
  date: Date
): { record: SatelliteRecord; cartesian: Cesium.Cartesian3 }[] {
  const gmst = satellite.gstime(date);
  const results: { record: SatelliteRecord; cartesian: Cesium.Cartesian3 }[] = [];

  for (const record of records) {
    const result = satellite.propagate(record.satrec, date);
    if (!result?.position || typeof result.position === "boolean") continue;

    const geo = satellite.eciToGeodetic(result.position as satellite.EciVec3<number>, gmst);
    results.push({
      record,
      cartesian: Cesium.Cartesian3.fromRadians(geo.longitude, geo.latitude, geo.height * 1000),
    });
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

  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, "white");
  gradient.addColorStop(0.3, color);
  gradient.addColorStop(1, "transparent");

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

  private selectedNoradId: string | null = null;
  private orbitalPathEntity: Cesium.Entity | null = null;
  private followEntity: Cesium.Entity | null = null;
  private followPosition: Cesium.ConstantPositionProperty | null = null;
  private followTickRemove: (() => void) | null = null;
  private satellitePositions: Map<string, Cesium.Cartesian3> = new Map();
  private hiddenCategories: Set<string> = new Set();
  private onExternalDeselect: (() => void) | null = null;

  constructor(viewer: Cesium.Viewer, onCountUpdate?: (n: number | null) => void) {
    this.viewer = viewer;
    this.onCountUpdate = onCountUpdate ?? null;
  }

  async show(records: SatelliteRecord[]): Promise<void> {
    this.records = records;
    this.billboards = new Cesium.BillboardCollection({ scene: this.viewer.scene });
    this.viewer.scene.primitives.add(this.billboards);

    for (const { record, cartesian } of propagateAll(this.records, new Date())) {
      const billboard = this.billboards.add({
        position: cartesian,
        image: createGlowTexture(record.color.toCssHexString()),
        width: 16,
        height: 16,
        color: record.color,
        id: record.noradId,
      });
      this.billboardMap.set(record.noradId, billboard);
      this.satellitePositions.set(record.noradId, cartesian);
    }

    this.updateInterval = setInterval(() => this.updatePositions(), 2500);
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
    for (const { record, cartesian } of propagateAll(this.records, new Date())) {
      const bb = this.billboardMap.get(record.noradId);
      if (bb) bb.position = cartesian;
      this.satellitePositions.set(record.noradId, cartesian);
    }
    this.notifyVisibleCount();
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

  getSelectedNoradId(): string | null {
    return this.selectedNoradId;
  }

  selectSatellite(noradId: string, onSelect: (record: SatelliteRecord, velocityKmS: number) => void): void {
    this.deselectSatellite();

    const record = this.records.find((r) => r.noradId === noradId);
    if (!record) return;

    this.selectedNoradId = noradId;

    const bb = this.billboardMap.get(noradId);
    if (bb) { bb.width = 28; bb.height = 28; }

    // Compute velocity magnitude from SGP4 velocity vector (km/s in ECI frame)
    let velocityKmS = 0;
    const result = satellite.propagate(record.satrec, new Date());
    if (result?.velocity && typeof result.velocity !== "boolean") {
      const { x, y, z } = result.velocity;
      velocityKmS = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
    }

    const path = computeOrbitalPath(record);
    if (path.length > 1) {
      this.orbitalPathEntity = this.viewer.entities.add({
        polyline: {
          positions: path,
          width: 1.5,
          material: new Cesium.ColorMaterialProperty(record.color.withAlpha(0.5)),
          arcType: Cesium.ArcType.NONE,
        },
      });
    }

    onSelect(record, velocityKmS);
  }

  deselectSatellite(onDeselect?: () => void): void {
    if (this.selectedNoradId) {
      const bb = this.billboardMap.get(this.selectedNoradId);
      if (bb) { bb.width = 16; bb.height = 16; }
      this.selectedNoradId = null;
    }

    if (this.orbitalPathEntity) {
      this.viewer.entities.remove(this.orbitalPathEntity);
      this.orbitalPathEntity = null;
    }

    this.stopFollow();
    onDeselect?.();
  }

  startFollow(): void {
    if (!this.selectedNoradId) return;
    this.stopFollow();

    // Drive camera manually every render frame — reliable, no trackedEntity lag.
    const listener = () => {
      if (!this.selectedNoradId) return;
      const pos = this.satellitePositions.get(this.selectedNoradId);
      if (!pos) return;

      lookAtTarget(this.viewer, pos, {
        range: 2_500_000,                        // 2500 km from satellite
        pitch: Cesium.Math.toRadians(-45),       // 45° above horizon
      });
    };

    this.viewer.scene.preRender.addEventListener(listener);
    this.followTickRemove = () => this.viewer.scene.preRender.removeEventListener(listener);
  }

  stopFollow(): void {
    this.followTickRemove?.();
    this.followTickRemove = null;

    // Unlock camera so user can pan/zoom freely
    unlockCamera(this.viewer);

    if (this.followEntity) {
      if (this.viewer.trackedEntity === this.followEntity) {
        this.viewer.trackedEntity = undefined as unknown as Cesium.Entity;
      }
      this.viewer.entities.remove(this.followEntity);
      this.followEntity = null;
    }
    this.followPosition = null;
  }

  setCategory(category: "stations" | "military" | "starlink" | "gnss" | "research", visible: boolean): void {
    if (visible) {
      this.hiddenCategories.delete(category);
    } else {
      this.hiddenCategories.add(category);
    }

    for (const record of this.records) {
      if (record.category === category) {
        const bb = this.billboardMap.get(record.noradId);
        if (bb) bb.show = visible;
      }
    }

    // Deselect if the selected satellite's category is now hidden
    if (!visible && this.selectedNoradId) {
      const selected = this.records.find((r) => r.noradId === this.selectedNoradId);
      if (selected?.category === category) {
        this.deselectSatellite();
        this.onExternalDeselect?.();
      }
    }

    this.notifyVisibleCount();
  }

  setExternalDeselectCallback(cb: () => void): void {
    this.onExternalDeselect = cb;
  }

  private notifyVisibleCount(): void {
    const count = [...this.billboardMap.values()].filter((b) => b.show).length;
    this.onCountUpdate?.(count);
  }
}

export function computeOrbitalPath(record: SatelliteRecord): Cesium.Cartesian3[] {
  // Period in minutes: satrec.no is mean motion in rad/min → T = 2π / no
  const periodMinutes = (2 * Math.PI) / record.satrec.no;
  const stepMinutes = 1;
  const steps = Math.ceil(periodMinutes / stepMinutes);
  const now = new Date();
  const positions: Cesium.Cartesian3[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = new Date(now.getTime() + i * stepMinutes * 60_000);
    const result = satellite.propagate(record.satrec, t);
    if (!result?.position || typeof result.position === "boolean") continue;
    const gmst = satellite.gstime(t);
    const geo = satellite.eciToGeodetic(result.position as satellite.EciVec3<number>, gmst);
    positions.push(Cesium.Cartesian3.fromRadians(geo.longitude, geo.latitude, geo.height * 1000));
  }

  return positions;
}
