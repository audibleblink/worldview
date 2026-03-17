/**
 * Particle Styles - Heatmap and terminal color schemes for traffic
 */

declare const Cesium: typeof import("cesium");

export type StyleMode = "heatmap" | "terminal";

export interface RoadConfig {
  speedMultiplier: number;
  densityPercent: number;
}

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

type RGBA = { red: number; green: number; blue: number; alpha: number };

function getHeatmapColor(speed: number): RGBA {
  const s = Math.max(0, Math.min(1, speed));
  return s <= 0.5
    ? { red: 1.0, green: s * 2, blue: 0, alpha: 0.9 }
    : { red: 1.0 - (s - 0.5) * 2, green: 1.0, blue: 0, alpha: 0.9 };
}

function getTerminalColor(speed: number): RGBA {
  const s = Math.max(0, Math.min(1, speed));
  const intensity = 0.4 + s * 0.6;
  return { red: 0.1 * intensity, green: intensity, blue: 0.2 * intensity, alpha: 0.85 + s * 0.15 };
}

export function getRoadColor(highway: string, mode: StyleMode = "heatmap"): RGBA {
  const speed = (ROAD_CONFIG[highway] ?? ROAD_CONFIG.residential)!.speedMultiplier;
  return mode === "heatmap" ? getHeatmapColor(speed) : getTerminalColor(speed);
}

export function toCesiumColor(color: RGBA): InstanceType<typeof Cesium.Color> {
  return new Cesium.Color(color.red, color.green, color.blue, color.alpha);
}
