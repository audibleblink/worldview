/**
 * RingAnimation - Magnitude-based config for earthquake visualization
 */

export interface MagnitudeConfig {
  maxRadius: number;
  color: string;
  ringCount: number;
  animationDuration: number;
}

const MAGNITUDE_CONFIG: { threshold: number; config: MagnitudeConfig }[] = [
  { threshold: 3.0, config: { maxRadius: 10, color: "#ffff00", ringCount: 2, animationDuration: 4 } },
  { threshold: 4.5, config: { maxRadius: 25, color: "#ff8800", ringCount: 3, animationDuration: 5 } },
  { threshold: 6.0, config: { maxRadius: 50, color: "#ff3333", ringCount: 4, animationDuration: 6 } },
  { threshold: Infinity, config: { maxRadius: 100, color: "#990000", ringCount: 5, animationDuration: 8 } },
];

export function getMagnitudeConfig(magnitude: number): MagnitudeConfig {
  return MAGNITUDE_CONFIG.find(({ threshold }) => magnitude < threshold)?.config ?? MAGNITUDE_CONFIG[MAGNITUDE_CONFIG.length - 1]!.config;
}
