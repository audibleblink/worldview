/**
 * RoadNetwork - Process OSM data into a road network for particle simulation
 * Handles segment creation, intersection detection, and connectivity
 */

import type { RawOSMWay } from "./OSMFetcher.ts";
import { ROAD_CONFIG } from "./particleStyles.ts";

/** A road segment with geometry and metadata */
export interface RoadSegment {
  id: string;
  wayId: number;
  points: [number, number][]; // [lon, lat] pairs
  highway: string;
  oneway: boolean;
  direction: 1 | -1; // 1 = forward along points, -1 = reverse
  name?: string;
  length: number; // in degrees (approximate)
  speedMultiplier: number;
  densityWeight: number;
}

/** Intersection point connecting multiple segments */
export interface Intersection {
  point: [number, number]; // [lon, lat]
  connectedSegments: string[]; // segment IDs
}

/** The complete road network */
export class RoadNetwork {
  segments: RoadSegment[] = [];
  intersections: Map<string, Intersection> = new Map();
  segmentsByHighway: Map<string, RoadSegment[]> = new Map();
  
  /** Total weighted length for density calculations */
  totalWeightedLength = 0;

  constructor(ways: RawOSMWay[]) {
    this.buildFromWays(ways);
  }

  /** Build network from raw OSM ways */
  private buildFromWays(ways: RawOSMWay[]): void {
    const defaultConfig = ROAD_CONFIG.residential;
    
    // Create segments from ways
    for (const way of ways) {
      const highway = way.tags.highway || "residential";
      const config = ROAD_CONFIG[highway] || defaultConfig;
      
      // Parse oneway tag
      const onewayTag = way.tags.oneway?.toLowerCase();
      const isOneway = onewayTag === "yes" || onewayTag === "1" || onewayTag === "true";
      const reverseOneway = onewayTag === "-1" || onewayTag === "reverse";

      // Convert geometry to [lon, lat] pairs
      const points: [number, number][] = way.geometry.map((g) => [g.lon, g.lat]);
      
      if (points.length < 2) continue; // Skip invalid segments
      
      // Calculate segment length (approximate in degrees)
      let length = 0;
      for (let i = 1; i < points.length; i++) {
        const p1 = points[i]!;
        const p0 = points[i - 1]!;
        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        length += Math.sqrt(dx * dx + dy * dy);
      }

      // Create the segment
      const segment: RoadSegment = {
        id: `way-${way.id}`,
        wayId: way.id,
        points,
        highway,
        oneway: isOneway || reverseOneway,
        direction: reverseOneway ? -1 : 1,
        name: way.tags.name,
        length,
        speedMultiplier: config!.speedMultiplier,
        densityWeight: config!.densityPercent / 100,
      };

      this.segments.push(segment);
      this.totalWeightedLength += length * segment.densityWeight;

      // Index by highway type
      if (!this.segmentsByHighway.has(highway)) {
        this.segmentsByHighway.set(highway, []);
      }
      this.segmentsByHighway.get(highway)!.push(segment);
    }

    // Build intersection connectivity
    this.buildIntersections();

    console.log(`[RoadNetwork] Built ${this.segments.length} segments, ${this.intersections.size} intersections`);
  }

  /** Build intersection connectivity graph */
  private buildIntersections(): void {
    // Map from point key to segment IDs that touch that point
    const pointToSegments = new Map<string, Set<string>>();

    const pointKey = (p: [number, number]) => 
      `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

    // Register start and end points of each segment
    for (const segment of this.segments) {
      if (segment.points.length === 0) continue;
      
      const start = segment.points[0]!;
      const end = segment.points[segment.points.length - 1]!;

      for (const point of [start, end]) {
        const key = pointKey(point);
        if (!pointToSegments.has(key)) {
          pointToSegments.set(key, new Set());
        }
        pointToSegments.get(key)!.add(segment.id);
      }
    }

    // Create intersections where multiple segments meet
    for (const [key, segmentIds] of pointToSegments) {
      if (segmentIds.size > 1) {
        const parts = key.split(",");
        const lon = Number(parts[0]);
        const lat = Number(parts[1]);
        this.intersections.set(key, {
          point: [lon, lat],
          connectedSegments: Array.from(segmentIds),
        });
      }
    }
  }

  /** Get segments connected to a given segment at its endpoints */
  getConnectedSegments(segmentId: string): RoadSegment[] {
    const segment = this.segments.find((s) => s.id === segmentId);
    if (!segment || segment.points.length === 0) return [];

    const connected = new Set<string>();
    const pointKey = (p: [number, number]) => 
      `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

    const start = segment.points[0]!;
    const end = segment.points[segment.points.length - 1]!;

    for (const point of [start, end]) {
      const intersection = this.intersections.get(pointKey(point));
      if (intersection) {
        for (const id of intersection.connectedSegments) {
          if (id !== segmentId) {
            connected.add(id);
          }
        }
      }
    }

    return this.segments.filter((s) => connected.has(s.id));
  }

  /** Get a random segment weighted by density and length */
  getRandomSegmentWeighted(): RoadSegment | null {
    if (this.segments.length === 0) return null;

    // Random value in weighted range
    let target = Math.random() * this.totalWeightedLength;

    for (const segment of this.segments) {
      const weight = segment.length * segment.densityWeight;
      target -= weight;
      if (target <= 0) {
        return segment;
      }
    }

    // Fallback to last segment
    return this.segments[this.segments.length - 1] ?? null;
  }

  /** Get segments by highway type */
  getSegmentsByType(highway: string): RoadSegment[] {
    return this.segmentsByHighway.get(highway) || [];
  }

  /** Get position at progress (0-1) along a segment */
  getPositionOnSegment(segment: RoadSegment, progress: number): [number, number] {
    const points = segment.points;
    if (points.length === 0) return [0, 0];
    if (points.length === 1) return points[0]!;

    // Calculate total length and find position
    let totalLength = 0;
    const lengths: number[] = [];
    
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i]!;
      const p0 = points[i - 1]!;
      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      lengths.push(len);
      totalLength += len;
    }

    const targetDist = progress * totalLength;
    let accumulated = 0;

    for (let i = 0; i < lengths.length; i++) {
      const segLen = lengths[i]!;
      if (accumulated + segLen >= targetDist) {
        // Interpolate within this sub-segment
        const t = (targetDist - accumulated) / segLen;
        const p0 = points[i]!;
        const p1 = points[i + 1]!;
        const x = p0[0] + t * (p1[0] - p0[0]);
        const y = p0[1] + t * (p1[1] - p0[1]);
        return [x, y];
      }
      accumulated += segLen;
    }

    // Return end point
    return points[points.length - 1]!;
  }
}

/**
 * Build a road network from raw OSM ways
 * Standalone function for easier testing
 */
export function buildNetwork(ways: RawOSMWay[]): RoadSegment[] {
  const network = new RoadNetwork(ways);
  return network.segments;
}
