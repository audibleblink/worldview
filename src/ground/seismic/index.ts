/**
 * Seismic Layer - Earthquake visualization with animated rings
 * Exports: EarthquakeLayer, USGSFetcher, RingAnimation
 */

export { EarthquakeLayer } from "./EarthquakeLayer.ts";
export { USGSFetcher, type EarthquakeFeature, type EarthquakeData } from "./USGSFetcher.ts";
export { RingAnimation, getMagnitudeConfig, type MagnitudeConfig } from "./RingAnimation.ts";
