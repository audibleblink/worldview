/**
 * Ground Layer - Orchestrates all ground-level visualizations
 * Includes: Traffic particles, CCTV feeds, Seismic activity
 */

export * from "./traffic/index.ts";

// Re-export main components for convenience
export { TrafficParticleSystem } from "./traffic/TrafficParticleSystem.ts";
export { OSMFetcher } from "./traffic/OSMFetcher.ts";
export { RoadNetwork, buildNetwork } from "./traffic/RoadNetwork.ts";
