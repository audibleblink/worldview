/**
 * Particle Styles - Color schemes for traffic visualization
 * Supports heatmap (red→yellow→green) and terminal (phosphor green) modes
 */

declare const Cesium: typeof import("cesium");

export type StyleMode = "heatmap" | "terminal";

/** Road classification with speed multiplier and particle density allocation */
export interface RoadConfig {
  speedMultiplier: number;
  densityPercent: number;
}

/** Road classification mapping */
export const ROAD_CONFIG: Record<string, RoadConfig> = {
  motorway: { speedMultiplier: 1.0, densityPercent: 40 },
  motorway_link: { speedMultiplier: 0.9, densityPercent: 5 },
  primary: { speedMultiplier: 0.8, densityPercent: 25 },
  primary_link: { speedMultiplier: 0.7, densityPercent: 3 },
  secondary: { speedMultiplier: 0.6, densityPercent: 20 },
  secondary_link: { speedMultiplier: 0.5, densityPercent: 2 },
  tertiary: { speedMultiplier: 0.4, densityPercent: 10 },
  tertiary_link: { speedMultiplier: 0.35, densityPercent: 1 },
  residential: { speedMultiplier: 0.2, densityPercent: 5 },
};

/**
 * Get heatmap color based on speed (0-1)
 * Slow (0) = Red, Medium (0.5) = Yellow, Fast (1) = Green
 */
export function getHeatmapColor(speed: number): { red: number; green: number; blue: number; alpha: number } {
  const clamped = Math.max(0, Math.min(1, speed));
  
  // Red to yellow (0-0.5): red stays 1, green increases
  // Yellow to green (0.5-1): red decreases, green stays 1
  let red: number;
  let green: number;
  
  if (clamped <= 0.5) {
    red = 1.0;
    green = clamped * 2; // 0→1 as speed goes 0→0.5
  } else {
    red = 1.0 - (clamped - 0.5) * 2; // 1→0 as speed goes 0.5→1
    green = 1.0;
  }
  
  return { red, green, blue: 0.0, alpha: 0.9 };
}

/**
 * Get terminal phosphor green color with intensity based on speed
 * Classic CRT monitor green with variable brightness
 */
export function getTerminalColor(speed: number): { red: number; green: number; blue: number; alpha: number } {
  const clamped = Math.max(0, Math.min(1, speed));
  
  // Base phosphor green with intensity variation
  // Faster = brighter, more saturated
  const intensity = 0.4 + clamped * 0.6; // 0.4-1.0
  
  return {
    red: 0.1 * intensity,
    green: 1.0 * intensity,
    blue: 0.2 * intensity,
    alpha: 0.85 + clamped * 0.15, // 0.85-1.0
  };
}

/**
 * Get color for a specific road type
 */
export function getRoadColor(highway: string, mode: StyleMode = "heatmap"): { red: number; green: number; blue: number; alpha: number } {
  const config = ROAD_CONFIG[highway] ?? ROAD_CONFIG.residential;
  const speed = config!.speedMultiplier;
  
  return mode === "heatmap" ? getHeatmapColor(speed) : getTerminalColor(speed);
}

/**
 * Convert color object to Cesium.Color
 */
export function toCesiumColor(color: { red: number; green: number; blue: number; alpha: number }): InstanceType<typeof Cesium.Color> {
  return new Cesium.Color(color.red, color.green, color.blue, color.alpha);
}
