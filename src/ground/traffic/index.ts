/**
 * Traffic Particle System - Ground Layer
 * Exports all traffic-related components
 */

export { OSMFetcher, type BoundingBox, type RawOSMWay, type OSMFetcherError } from "./OSMFetcher.ts";
export { RoadNetwork, buildNetwork, type RoadSegment } from "./RoadNetwork.ts";
export { TrafficParticleSystem, type ParticleState } from "./TrafficParticleSystem.ts";
export { getHeatmapColor, getTerminalColor, getRoadColor, type StyleMode } from "./particleStyles.ts";
