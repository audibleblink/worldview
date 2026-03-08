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

// Visual constants
const BILLBOARD_SIZE_NORMAL = 16;
const BILLBOARD_SIZE_SELECTED = 28;
const POSITION_UPDATE_INTERVAL_MS = 2500;
const FOLLOW_RANGE_METERS = 2_500_000;

// CelesTrak fetch rate limiting
const CELESTRAK_COOLDOWN_MS = 5000;
const CELESTRAK_FETCH_TIMEOUT_MS = 10000;

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
 * Create a satellite sprite texture.
 * Draws a satellite shape (body with solar panels) in white for color tinting.
 */
export function createSatelliteTexture(): string {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const centerX = size / 2;
  const centerY = size / 2;

  // Draw subtle glow behind
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.4)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.1)");
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;

  // Central body (rectangle)
  const bodyWidth = 6;
  const bodyHeight = 8;
  ctx.fillRect(centerX - bodyWidth / 2, centerY - bodyHeight / 2, bodyWidth, bodyHeight);

  // Left solar panel
  ctx.fillRect(centerX - 14, centerY - 3, 10, 6);
  
  // Right solar panel  
  ctx.fillRect(centerX + 4, centerY - 3, 10, 6);

  // Panel grid lines
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  ctx.lineWidth = 0.5;
  
  // Left panel lines
  ctx.beginPath();
  ctx.moveTo(centerX - 9, centerY - 3);
  ctx.lineTo(centerX - 9, centerY + 3);
  ctx.moveTo(centerX - 14, centerY);
  ctx.lineTo(centerX - 4, centerY);
  ctx.stroke();
  
  // Right panel lines
  ctx.beginPath();
  ctx.moveTo(centerX + 9, centerY - 3);
  ctx.lineTo(centerX + 9, centerY + 3);
  ctx.moveTo(centerX + 4, centerY);
  ctx.lineTo(centerX + 14, centerY);
  ctx.stroke();

  return canvas.toDataURL();
}

export class SatelliteLayer {
  private viewer: Cesium.Viewer;
  private records: SatelliteRecord[] = [];
  private billboards: Cesium.BillboardCollection | null = null;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private billboardMap: Map<string, Cesium.Billboard> = new Map(); // noradId → billboard
  private onCountUpdate: ((n: number | null) => void) | null = null;
  private satelliteTexture: string | null = null;

  private selectedNoradId: string | null = null;
  private orbitalPathEntity: Cesium.Entity | null = null;
  private followEntity: Cesium.Entity | null = null;
  private followPosition: Cesium.ConstantPositionProperty | null = null;
  private followTickRemove: (() => void) | null = null;
  private satellitePositions: Map<string, Cesium.Cartesian3> = new Map();
  private hiddenCategories: Set<string> = new Set();
  private onExternalDeselect: (() => void) | null = null;

  // CelesTrak rate limiting
  private lastCelestrakFetch: number = 0;

  constructor(viewer: Cesium.Viewer, onCountUpdate?: (n: number | null) => void) {
    this.viewer = viewer;
    this.onCountUpdate = onCountUpdate ?? null;
  }

  async show(records: SatelliteRecord[]): Promise<void> {
    this.records = records;
    this.billboards = new Cesium.BillboardCollection({ scene: this.viewer.scene });
    this.viewer.scene.primitives.add(this.billboards);

    // Create texture once and reuse - color tinting handles per-satellite colors
    if (!this.satelliteTexture) {
      this.satelliteTexture = createSatelliteTexture();
    }

    for (const { record, cartesian } of propagateAll(this.records, new Date())) {
      const billboard = this.billboards.add({
        position: cartesian,
        image: this.satelliteTexture,
        width: BILLBOARD_SIZE_NORMAL,
        height: BILLBOARD_SIZE_NORMAL,
        color: record.color,
        id: record.noradId,
      });
      this.billboardMap.set(record.noradId, billboard);
      this.satellitePositions.set(record.noradId, cartesian);
    }

    this.updateInterval = setInterval(() => this.updatePositions(), POSITION_UPDATE_INTERVAL_MS);
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

  /** Check if a norad ID exists in the current satellite records */
  hasNoradId(noradId: string): boolean {
    return this.billboardMap.has(noradId);
  }

  getSelectedNoradId(): string | null {
    return this.selectedNoradId;
  }

  /**
   * Find a satellite by its NORAD ID across all loaded categories
   * @param noradId - NORAD catalog number (1-5 digits)
   * @returns The satellite record if found, null otherwise
   */
  findByNoradId(noradId: number): SatelliteRecord | null {
    const noradIdStr = String(noradId);
    for (const record of this.records) {
      if (record.noradId === noradIdStr) {
        return record;
      }
    }
    return null;
  }

  /**
   * Check if a satellite is currently being followed
   */
  isFollowing(noradId: string): boolean {
    return this.selectedNoradId === noradId && this.followTickRemove !== null;
  }

  /**
   * Get the currently followed satellite record (if any)
   */
  getFollowedSatellite(): SatelliteRecord | null {
    if (!this.selectedNoradId || !this.followTickRemove) return null;
    return this.records.find((r) => r.noradId === this.selectedNoradId) ?? null;
  }

  /**
   * Check if CelesTrak fetch is allowed (rate limiting)
   * @returns true if enough time has passed since last fetch
   */
  canFetchFromCelestrak(): boolean {
    const now = Date.now();
    return now - this.lastCelestrakFetch >= CELESTRAK_COOLDOWN_MS;
  }

  /**
   * Get remaining cooldown time in milliseconds
   */
  getCelestrakCooldownRemaining(): number {
    const now = Date.now();
    const elapsed = now - this.lastCelestrakFetch;
    return Math.max(0, CELESTRAK_COOLDOWN_MS - elapsed);
  }

  /**
   * Fetch a satellite from CelesTrak by NORAD ID and add it to the loaded collection
   * @param noradId - NORAD catalog number (1-5 digits)
   * @returns The satellite record if found and added, throws on error
   */
  async fetchAndAddSatellite(noradId: number): Promise<SatelliteRecord> {
    // Check rate limit first
    if (!this.canFetchFromCelestrak()) {
      const remaining = Math.ceil(this.getCelestrakCooldownRemaining() / 1000);
      throw new Error(`RATE_LIMIT:Please wait ${remaining}s before fetching another satellite`);
    }

    // Update timestamp before fetch to prevent concurrent requests
    this.lastCelestrakFetch = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CELESTRAK_FETCH_TIMEOUT_MS);

      const response = await fetch(
        `http://localhost:3001/tle?catnr=${noradId}`,
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (response.status === 404) {
        throw new Error(`NOT_FOUND:Satellite ${noradId} not found`);
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(`FETCH_ERROR:${data.error || "Failed to fetch satellite data"}`);
      }

      const tleText = await response.text();
      const lines = tleText.trim().split("\n").map(l => l.trim()).filter(l => l.length > 0);

      if (lines.length < 3) {
        throw new Error("PARSE_ERROR:Invalid TLE data received");
      }

      // Parse the TLE
      const name = lines[0]!;
      const line1 = lines[1]!;
      const line2 = lines[2]!;

      if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) {
        throw new Error("PARSE_ERROR:Invalid TLE format");
      }

      const satrec = satellite.twoline2satrec(line1, line2);
      if (satrec.error !== 0) {
        throw new Error("PARSE_ERROR:Failed to parse TLE data");
      }

      // NORAD catalog number from TLE
      const parsedNoradId = line1.substring(2, 7).trim();
      
      // Use the research category color for on-demand fetched satellites
      const color = CATEGORY_COLORS["research"]!;

      const record: SatelliteRecord = {
        name,
        noradId: parsedNoradId,
        category: "research", // Default category for on-demand satellites
        satrec,
        color,
      };

      // Add to records
      this.records.push(record);

      // Compute initial position
      const now = new Date();
      const result = satellite.propagate(satrec, now);
      if (!result?.position || typeof result.position === "boolean") {
        throw new Error("PROPAGATE_ERROR:Failed to compute satellite position");
      }

      const gmst = satellite.gstime(now);
      const geo = satellite.eciToGeodetic(result.position as satellite.EciVec3<number>, gmst);
      const cartesian = Cesium.Cartesian3.fromRadians(geo.longitude, geo.latitude, geo.height * 1000);

      // Create billboard if collection exists
      if (this.billboards) {
        if (!this.satelliteTexture) {
          this.satelliteTexture = createSatelliteTexture();
        }

        const billboard = this.billboards.add({
          position: cartesian,
          image: this.satelliteTexture,
          width: BILLBOARD_SIZE_NORMAL,
          height: BILLBOARD_SIZE_NORMAL,
          color: record.color,
          id: record.noradId,
        });
        this.billboardMap.set(record.noradId, billboard);
        this.satellitePositions.set(record.noradId, cartesian);
        this.notifyVisibleCount();
      }

      return record;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error("TIMEOUT:Failed to fetch satellite data");
        }
        // Re-throw our custom errors
        if (error.message.startsWith("RATE_LIMIT:") ||
            error.message.startsWith("NOT_FOUND:") ||
            error.message.startsWith("FETCH_ERROR:") ||
            error.message.startsWith("PARSE_ERROR:") ||
            error.message.startsWith("PROPAGATE_ERROR:") ||
            error.message.startsWith("TIMEOUT:")) {
          throw error;
        }
      }
      throw new Error("FETCH_ERROR:Failed to fetch satellite data");
    }
  }

  selectSatellite(noradId: string, onSelect: (record: SatelliteRecord, velocityKmS: number) => void): void {
    this.deselectSatellite();

    const record = this.records.find((r) => r.noradId === noradId);
    if (!record) return;

    this.selectedNoradId = noradId;

    const bb = this.billboardMap.get(noradId);
    if (bb) { bb.width = BILLBOARD_SIZE_SELECTED; bb.height = BILLBOARD_SIZE_SELECTED; }

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
      if (bb) { bb.width = BILLBOARD_SIZE_NORMAL; bb.height = BILLBOARD_SIZE_NORMAL; }
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

    // Store HPR values - these are what we pass to lookAt
    let heading = 0;
    let pitch = Cesium.Math.toRadians(-45);
    let range = FOLLOW_RANGE_METERS;
    
    // Track where we positioned camera last frame to detect user input
    let lastCamPos: Cesium.Cartesian3 | null = null;

    // Drive camera manually every render frame — reliable, no trackedEntity lag.
    // User can orbit around the satellite (change heading/pitch/range) but cannot pan away.
    const listener = () => {
      if (!this.selectedNoradId) return;
      const target = this.satellitePositions.get(this.selectedNoradId);
      if (!target) return;

      const camera = this.viewer.camera;

      // Check if user moved the camera since last frame
      if (lastCamPos !== null) {
        const actualPos = camera.positionWC;
        const userMoved = !Cesium.Cartesian3.equalsEpsilon(actualPos, lastCamPos, 0, 1.0);
        
        if (userMoved) {
          // User orbited - camera.heading/pitch are now updated by ScreenSpaceCameraController
          // These ARE the correct values relative to the current lookAt reference frame
          heading = camera.heading;
          pitch = camera.pitch;
          range = Cesium.Cartesian3.distance(actualPos, target);
        }
      }

      // Apply lookAt - this creates the reference frame that enables orbit controls
      camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, range));
      
      // Store where camera is now
      lastCamPos = Cesium.Cartesian3.clone(camera.positionWC);
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
