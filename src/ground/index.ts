/**
 * Ground Layer - Orchestrates all ground-level visualizations
 * Includes: Traffic particles, CCTV feeds, Seismic activity
 */

export * from "./traffic/index.ts";
export * from "./cctv/index.ts";
export * from "./seismic/index.ts";

// Re-export main components for convenience
export { TrafficParticleSystem } from "./traffic/TrafficParticleSystem.ts";
export { OSMFetcher } from "./traffic/OSMFetcher.ts";
export { RoadNetwork, buildNetwork } from "./traffic/RoadNetwork.ts";

// CCTV exports
export { CCTVManager } from "./cctv/CCTVManager.ts";
export { CCTVPanel } from "./cctv/CCTVPanel.ts";

// Seismic exports
export { EarthquakeLayer } from "./seismic/EarthquakeLayer.ts";
export { USGSFetcher } from "./seismic/USGSFetcher.ts";
export { RingAnimation, getMagnitudeConfig } from "./seismic/RingAnimation.ts";
