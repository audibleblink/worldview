/**
 * AISStream WebSocket Client
 *
 * Maintains a persistent WebSocket connection to AISStream.io and buffers
 * ship positions for the /ships HTTP endpoint.
 *
 * Features:
 * - Heartbeat monitoring: force reconnect if no message in 30s
 * - Parse error counter instead of silent catch
 * - Exponential backoff on reconnection
 */

// ==================== TYPES ====================

export type ShipTypeCategory = "cargo" | "tanker" | "passenger" | "fishing" | "other";

export interface ShipRecord {
  mmsi: string;
  name: string;
  shipType: number;
  shipTypeCategory: ShipTypeCategory;
  latitude: number;
  longitude: number;
  cog: number;
  sog: number;
  trueHeading: number;
  navStatus: number;
  timestamp: number;
}

interface ShipDimension {
  A: number;
  B: number;
  C: number;
  D: number;
}

interface AISStreamMessage {
  MessageType: string;
  MetaData: {
    MMSI: number;
    ShipName: string;
    latitude: number;
    longitude: number;
    time_utc: string;
  };
  Message: {
    PositionReport?: {
      Cog: number;
      Sog: number;
      TrueHeading: number;
      NavigationalStatus: number;
    };
    ShipStaticData?: {
      Type: number;
      Name: string;
      CallSign: string;
      ImoNumber: number;
      Destination: string;
      Dimension: ShipDimension;
      MaximumStaticDraught: number;
    };
    StandardClassBPositionReport?: {
      Cog: number;
      Sog: number;
      TrueHeading: number;
    };
  };
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface ShipsResponse {
  ships: ShipRecord[];
  count: number;
  truncated: boolean;
  totalInBbox: number;
}

// ==================== HELPER FUNCTIONS ====================

export function shipTypeToCategory(type: number): ShipTypeCategory {
  if (type >= 70 && type <= 79) return "cargo";
  if (type >= 80 && type <= 89) return "tanker";
  if (type >= 60 && type <= 69) return "passenger";
  if (type === 30) return "fishing";
  return "other";
}

export function navStatusToString(status: number): string {
  switch (status) {
    case 0: return "Under way using engine";
    case 1: return "At anchor";
    case 2: return "Not under command";
    case 3: return "Restricted maneuverability";
    case 4: return "Constrained by draught";
    case 5: return "Moored";
    case 6: return "Aground";
    case 7: return "Engaged in fishing";
    case 8: return "Under way sailing";
    case 14: return "AIS-SART active";
    default: return "Not defined";
  }
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ==================== AISSTREAM CLIENT ====================

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";
const BUFFER_EVICTION_MS = 5 * 60 * 1000;
const EVICTION_INTERVAL_MS = 60 * 1000;
const MAX_SHIPS_RESPONSE = 100;

/** Heartbeat timeout: force reconnect if no message in 30 seconds */
const HEARTBEAT_TIMEOUT_MS = 30_000;

export class AISStreamClient {
  private ws: WebSocket | null = null;
  private shipBuffer: Map<string, ShipRecord> = new Map();
  private apiKey: string;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private evictionInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private authFailed = false;

  /** Parse error counter instead of silent catch */
  private parseErrorCount = 0;
  private lastMessageTime = 0;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  hasAuthFailed(): boolean {
    return this.authFailed;
  }

  getParseErrorCount(): number {
    return this.parseErrorCount;
  }

  connect(): void {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isConnecting = true;
    console.log("[AISStream] Connecting to WebSocket...");

    try {
      this.ws = new WebSocket(AISSTREAM_URL);

      this.ws.onopen = () => {
        console.log("[AISStream] WebSocket connected");
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.lastMessageTime = Date.now();

        // Send subscription
        const subscription = {
          APIKey: this.apiKey,
          BoundingBoxes: [[[-90, -180], [90, 180]]],
          FilterMessageTypes: ["PositionReport", "ShipStaticData", "StandardClassBPositionReport"],
        };
        this.ws!.send(JSON.stringify(subscription));
        console.log("[AISStream] Subscription sent (global coverage)");

        // Start heartbeat monitoring
        this.resetHeartbeat();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.lastMessageTime = Date.now();
        this.resetHeartbeat();
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error: Event) => {
        console.error("[AISStream] WebSocket error:", error);
        this.isConnecting = false;
      };

      this.ws.onclose = (event: CloseEvent) => {
        console.log(`[AISStream] WebSocket closed (code: ${event.code})`);
        this.isConnecting = false;
        this.ws = null;
        this.clearHeartbeat();

        // Detect authentication failure
        if (event.code === 1008 || (event.code >= 4001 && event.code <= 4099) || event.code === 4401) {
          this.authFailed = true;
          console.error("[AISStream] Authentication failed");
          return;
        }

        console.log(`[AISStream] Continuing to serve ${this.shipBuffer.size} cached ships`);
        this.scheduleReconnect();
      };

      // Start buffer eviction
      if (!this.evictionInterval) {
        this.evictionInterval = setInterval(() => this.evictStaleShips(), EVICTION_INTERVAL_MS);
      }
    } catch (error) {
      console.error("[AISStream] Failed to create WebSocket:", error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Reset heartbeat timer
   * If no message received within timeout, force reconnect
   */
  private resetHeartbeat(): void {
    this.clearHeartbeat();

    this.heartbeatTimeout = setTimeout(() => {
      const silentDuration = Date.now() - this.lastMessageTime;
      console.warn(`[AISStream] No message received in ${silentDuration}ms, forcing reconnect`);

      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      this.scheduleReconnect();
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.authFailed) return;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delays = [1000, 2000, 4000, 8000, 16000, 30000] as const;
    const delayIndex = Math.min(this.reconnectAttempts, delays.length - 1);
    const delay = delays[delayIndex]!;
    this.reconnectAttempts++;

    console.log(`[AISStream] Reconnection attempt ${this.reconnectAttempts} in ${delay / 1000}s`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleMessage(data: string): void {
    try {
      const msg: AISStreamMessage = JSON.parse(data);
      const { MetaData, Message } = msg;

      if (!MetaData) return;

      const mmsi = String(MetaData.MMSI);

      // Handle ShipStaticData
      if (msg.MessageType === "ShipStaticData" && Message.ShipStaticData) {
        const staticData = Message.ShipStaticData;
        const existing = this.shipBuffer.get(mmsi);

        if (existing) {
          existing.shipType = staticData.Type;
          existing.shipTypeCategory = shipTypeToCategory(staticData.Type);
          if (staticData.Name?.trim()) {
            existing.name = staticData.Name.trim();
          }
          existing.timestamp = Date.now();
        } else {
          const record: ShipRecord = {
            mmsi,
            name: staticData.Name?.trim() || MetaData.ShipName?.trim() || mmsi,
            shipType: staticData.Type,
            shipTypeCategory: shipTypeToCategory(staticData.Type),
            latitude: MetaData.latitude || 0,
            longitude: MetaData.longitude || 0,
            cog: 0,
            sog: 0,
            trueHeading: 511,
            navStatus: 15,
            timestamp: Date.now(),
          };
          this.shipBuffer.set(mmsi, record);
        }
        return;
      }

      // Handle PositionReport
      if (msg.MessageType === "PositionReport" && Message.PositionReport) {
        const posReport = Message.PositionReport;
        const existing = this.shipBuffer.get(mmsi);

        if (existing) {
          existing.latitude = MetaData.latitude;
          existing.longitude = MetaData.longitude;
          existing.cog = posReport.Cog ?? existing.cog;
          existing.sog = posReport.Sog ?? existing.sog;
          existing.trueHeading = posReport.TrueHeading ?? existing.trueHeading;
          existing.navStatus = posReport.NavigationalStatus ?? existing.navStatus;
          existing.timestamp = Date.now();
          if (existing.name === mmsi && MetaData.ShipName?.trim()) {
            existing.name = MetaData.ShipName.trim();
          }
        } else {
          const record: ShipRecord = {
            mmsi,
            name: MetaData.ShipName?.trim() || mmsi,
            shipType: 0,
            shipTypeCategory: "other",
            latitude: MetaData.latitude,
            longitude: MetaData.longitude,
            cog: posReport.Cog ?? 0,
            sog: posReport.Sog ?? 0,
            trueHeading: posReport.TrueHeading ?? 511,
            navStatus: posReport.NavigationalStatus ?? 15,
            timestamp: Date.now(),
          };
          this.shipBuffer.set(mmsi, record);
        }
        return;
      }

      // Handle StandardClassBPositionReport
      if (msg.MessageType === "StandardClassBPositionReport" && Message.StandardClassBPositionReport) {
        const posReport = Message.StandardClassBPositionReport;
        const existing = this.shipBuffer.get(mmsi);

        if (existing) {
          existing.latitude = MetaData.latitude;
          existing.longitude = MetaData.longitude;
          existing.cog = posReport.Cog ?? existing.cog;
          existing.sog = posReport.Sog ?? existing.sog;
          existing.trueHeading = posReport.TrueHeading ?? existing.trueHeading;
          existing.timestamp = Date.now();
          if (existing.name === mmsi && MetaData.ShipName?.trim()) {
            existing.name = MetaData.ShipName.trim();
          }
        } else {
          const record: ShipRecord = {
            mmsi,
            name: MetaData.ShipName?.trim() || mmsi,
            shipType: 0,
            shipTypeCategory: "other",
            latitude: MetaData.latitude,
            longitude: MetaData.longitude,
            cog: posReport.Cog ?? 0,
            sog: posReport.Sog ?? 0,
            trueHeading: posReport.TrueHeading ?? 511,
            navStatus: 0,
            timestamp: Date.now(),
          };
          this.shipBuffer.set(mmsi, record);
        }
        return;
      }
    } catch (error) {
      // Count parse errors instead of silent catch
      this.parseErrorCount++;
      if (this.parseErrorCount % 100 === 1) {
        console.warn(`[AISStream] Parse error (total: ${this.parseErrorCount}):`, error);
      }
    }
  }

  private evictStaleShips(): void {
    const cutoff = Date.now() - BUFFER_EVICTION_MS;
    let evicted = 0;

    for (const [mmsi, record] of this.shipBuffer) {
      if (record.timestamp < cutoff) {
        this.shipBuffer.delete(mmsi);
        evicted++;
      }
    }

    if (evicted > 0) {
      console.log(`[AISStream] Evicted ${evicted} stale ships, ${this.shipBuffer.size} remaining`);
    }
  }

  getShips(bbox?: BoundingBox): ShipsResponse {
    const values: ShipRecord[] = [];
    this.shipBuffer.forEach((ship) => values.push(ship));
    let ships = values;

    if (bbox) {
      ships = ships.filter(
        (ship) =>
          ship.latitude >= bbox.minLat &&
          ship.latitude <= bbox.maxLat &&
          ship.longitude >= bbox.minLon &&
          ship.longitude <= bbox.maxLon
      );

      const centerLat = (bbox.minLat + bbox.maxLat) / 2;
      const centerLon = (bbox.minLon + bbox.maxLon) / 2;

      ships.sort((a, b) => {
        const distA = haversineDistance(centerLat, centerLon, a.latitude, a.longitude);
        const distB = haversineDistance(centerLat, centerLon, b.latitude, b.longitude);
        return distA - distB;
      });
    }

    const totalInBbox = ships.length;
    const truncated = ships.length > MAX_SHIPS_RESPONSE;

    if (truncated) {
      ships = ships.slice(0, MAX_SHIPS_RESPONSE);
    }

    return {
      ships,
      count: ships.length,
      truncated,
      totalInBbox,
    };
  }

  getBufferSize(): number {
    return this.shipBuffer.size;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.evictionInterval) {
      clearInterval(this.evictionInterval);
      this.evictionInterval = null;
    }

    this.clearHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.shipBuffer.clear();
    console.log("[AISStream] Disconnected and cleared buffer");
  }
}

// ==================== SINGLETON INSTANCE ====================

let aisStreamClient: AISStreamClient | null = null;

export function initAISStreamClient(): AISStreamClient | null {
  const apiKey = process.env.AISSTREAM_API_KEY;

  if (!apiKey) {
    console.warn("[AISStream] AISSTREAM_API_KEY not set - ship tracking disabled");
    return null;
  }

  if (!aisStreamClient) {
    aisStreamClient = new AISStreamClient(apiKey);
    aisStreamClient.connect();
  }

  return aisStreamClient;
}

export function getAISStreamClient(): AISStreamClient | null {
  return aisStreamClient;
}
