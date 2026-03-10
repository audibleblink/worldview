/**
 * AISStream WebSocket Client
 *
 * Maintains a persistent WebSocket connection to AISStream.io and buffers
 * ship positions for the /ships HTTP endpoint.
 */

// ==================== TYPES ====================

export type ShipTypeCategory = 'cargo' | 'tanker' | 'passenger' | 'fishing' | 'other';

export interface ShipRecord {
  mmsi: string;           // Maritime Mobile Service Identity (unique ID)
  name: string;           // Vessel name from AIS
  shipType: number;       // AIS ship type code (0-99)
  shipTypeCategory: ShipTypeCategory; // Derived category for visualization
  latitude: number;
  longitude: number;
  cog: number;            // Course over ground (degrees)
  sog: number;            // Speed over ground (knots)
  trueHeading: number;    // True heading (degrees), 511 = not available
  navStatus: number;      // Navigation status code (0-15)
  timestamp: number;      // Last update epoch (ms)
}

/** Ship dimension data from AIS */
interface ShipDimension {
  A: number; // Distance from GPS to bow
  B: number; // Distance from GPS to stern
  C: number; // Distance from GPS to port
  D: number; // Distance from GPS to starboard
}

/** AISStream message format (supports multiple message types) */
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

/** Bounding box for filtering ships */
export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** Response from /ships endpoint */
export interface ShipsResponse {
  ships: ShipRecord[];
  count: number;
  truncated: boolean;
  totalInBbox: number;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Maps AIS ship type code (0-99) to visualization category
 */
export function shipTypeToCategory(type: number): ShipTypeCategory {
  if (type >= 70 && type <= 79) return 'cargo';
  if (type >= 80 && type <= 89) return 'tanker';
  if (type >= 60 && type <= 69) return 'passenger';
  if (type === 30) return 'fishing';
  return 'other';
}

/**
 * Maps AIS navigation status code to human-readable string
 */
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

/**
 * Calculate distance between two lat/lon points using Haversine formula
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ==================== AISSTREAM CLIENT ====================

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";
const BUFFER_EVICTION_MS = 5 * 60 * 1000; // 5 minutes
const EVICTION_INTERVAL_MS = 60 * 1000;   // Check every 60 seconds
const MAX_SHIPS_RESPONSE = 100;

export class AISStreamClient {
  private ws: WebSocket | null = null;
  private shipBuffer: Map<string, ShipRecord> = new Map();
  private apiKey: string;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private evictionInterval: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;
  private authFailed = false;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Check if authentication has failed
   */
  hasAuthFailed(): boolean {
    return this.authFailed;
  }

  /**
   * Start the WebSocket connection and buffer eviction
   */
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

        // Send subscription message
        // Subscribe to PositionReport for position/speed/heading,
        // ShipStaticData for ship type/name/destination,
        // and StandardClassBPositionReport for Class B transponders
        const subscription = {
          APIKey: this.apiKey,
          BoundingBoxes: [[[-90, -180], [90, 180]]],
          FilterMessageTypes: ["PositionReport", "ShipStaticData", "StandardClassBPositionReport"],
        };
        this.ws!.send(JSON.stringify(subscription));
        console.log("[AISStream] Subscription sent (global coverage, PositionReport + ShipStaticData + StandardClassBPositionReport)");
      };

      this.ws.onmessage = (event: MessageEvent) => {
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

        // Detect authentication failure (code 1008 = policy violation, 4001-4099 = custom auth errors)
        if (event.code === 1008 || (event.code >= 4001 && event.code <= 4099) || event.code === 4401) {
          this.authFailed = true;
          console.error("[SHIPS] AISStream authentication failed");
          // Don't reconnect on auth failure - it won't help
          return;
        }

        // Continue serving cached data during reconnection
        console.log(`[AISStream] Continuing to serve ${this.shipBuffer.size} cached ships during reconnection`);
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
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    // Don't reconnect if auth failed
    if (this.authFailed) {
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
    const delays = [1000, 2000, 4000, 8000, 16000, 30000] as const;
    const delayIndex = Math.min(this.reconnectAttempts, delays.length - 1);
    const delay = delays[delayIndex]!;
    this.reconnectAttempts++;

    console.log(`[AISStream] Reconnection attempt ${this.reconnectAttempts} in ${delay / 1000}s`);

    this.reconnectTimeout = setTimeout(() => {
      console.log(`[AISStream] Attempting reconnection (attempt ${this.reconnectAttempts})...`);
      this.connect();
    }, delay);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const msg: AISStreamMessage = JSON.parse(data);
      const { MetaData, Message } = msg;

      if (!MetaData) return;

      const mmsi = String(MetaData.MMSI);

      // Handle ShipStaticData - contains ship type, name, destination
      if (msg.MessageType === "ShipStaticData" && Message.ShipStaticData) {
        const staticData = Message.ShipStaticData;
        const existing = this.shipBuffer.get(mmsi);
        
        if (existing) {
          // Update existing record with static data
          existing.shipType = staticData.Type;
          existing.shipTypeCategory = shipTypeToCategory(staticData.Type);
          if (staticData.Name?.trim()) {
            existing.name = staticData.Name.trim();
          }
          existing.timestamp = Date.now();
        } else {
          // Create new record with static data (position will come from PositionReport)
          // Use metadata position as fallback
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

      // Handle PositionReport - contains position, speed, heading
      if (msg.MessageType === "PositionReport" && Message.PositionReport) {
        const posReport = Message.PositionReport;
        const existing = this.shipBuffer.get(mmsi);

        if (existing) {
          // Update existing record with position data
          existing.latitude = MetaData.latitude;
          existing.longitude = MetaData.longitude;
          existing.cog = posReport.Cog ?? existing.cog;
          existing.sog = posReport.Sog ?? existing.sog;
          existing.trueHeading = posReport.TrueHeading ?? existing.trueHeading;
          existing.navStatus = posReport.NavigationalStatus ?? existing.navStatus;
          existing.timestamp = Date.now();
          // Update name from metadata if we don't have a good one
          if (existing.name === mmsi && MetaData.ShipName?.trim()) {
            existing.name = MetaData.ShipName.trim();
          }
        } else {
          // Create new record - ship type will come from ShipStaticData later
          const record: ShipRecord = {
            mmsi,
            name: MetaData.ShipName?.trim() || mmsi,
            shipType: 0, // Will be updated when ShipStaticData arrives
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

      // Handle StandardClassBPositionReport - similar to PositionReport but for Class B transponders
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
            navStatus: 0, // Class B doesn't have nav status
            timestamp: Date.now(),
          };
          this.shipBuffer.set(mmsi, record);
        }
        return;
      }
    } catch (error) {
      // Silently ignore parse errors - AISStream can send malformed messages occasionally
    }
  }

  /**
   * Remove ships not seen in 5 minutes
   */
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

  /**
   * Get ships within bounding box, sorted by distance from center
   */
  getShips(bbox?: BoundingBox): ShipsResponse {
    let ships = Array.from(this.shipBuffer.values());

    // Filter by bounding box if provided
    if (bbox) {
      ships = ships.filter(ship =>
        ship.latitude >= bbox.minLat &&
        ship.latitude <= bbox.maxLat &&
        ship.longitude >= bbox.minLon &&
        ship.longitude <= bbox.maxLon
      );

      // Sort by distance from bbox center
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

  /**
   * Get total buffered ship count
   */
  getBufferSize(): number {
    return this.shipBuffer.size;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.evictionInterval) {
      clearInterval(this.evictionInterval);
      this.evictionInterval = null;
    }

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

/**
 * Initialize the AISStream client singleton
 */
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

/**
 * Get the AISStream client singleton
 */
export function getAISStreamClient(): AISStreamClient | null {
  return aisStreamClient;
}
