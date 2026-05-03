/**
 * WorldView - Compass Widget
 *
 * Small corner compass that rotates with camera heading
 * and squishes vertically with camera pitch (nadir = flat disc).
 */

import { createMemo } from "solid-js";
import { useCamera } from "../cesium/hooks/useCamera";
import { ui } from "../stores/ui";

declare const Cesium: typeof import("cesium");

export function Compass() {
  const { state } = useCamera();

  // heading in degrees (0=north, clockwise)
  const headingDeg = createMemo(() =>
    Cesium.Math.toDegrees(state().heading)
  );

  // pitch: 0 = horizon, -π/2 = straight down (top-down)
  // scaleY: 1.0 when top-down (pitch=-90°), shrinks toward horizon (pitch=0°)
  const scaleY = createMemo(() => {
    const pitchDeg = Cesium.Math.toDegrees(state().pitch); // −90..0
    const clamped = Math.max(-90, Math.min(0, pitchDeg));
    // -90° (top-down) → 1.0, 0° (horizon) → 0.18
    return (Math.abs(clamped) / 90) * 0.82 + 0.18;
  });

  const rightOffset = () => ui.rightPanelOpen ? "calc(var(--panel-width) + 16px)" : "20px";

  return (
    <div class="compass-widget" style={{ right: rightOffset() }}>
      <svg
        viewBox="0 0 64 64"
        width="56"
        height="56"
        style={{ overflow: "visible" }}
      >
        {/* Outer ring */}
        <ellipse
          cx="32"
          cy="32"
          rx="28"
          ry={28 * scaleY()}
          fill="none"
          stroke="var(--color-border-light)"
          stroke-width="1.5"
        />

        {/* Cardinal tick marks — rotate with heading so they stay fixed on globe */}
        {[0, 90, 180, 270].map((deg) => {
          const r = deg - headingDeg();
          const rad = (r * Math.PI) / 180;
          const rx = 28;
          const ry = 28 * scaleY();
          // Point on ellipse
          const x = 32 + rx * Math.sin(rad);
          const y = 32 - ry * Math.cos(rad);
          // Inward direction (toward center)
          const nx = (32 - x) / rx;
          const ny = (32 - y) / ry;
          const len = 5;
          const label = ["N", "E", "S", "W"][deg / 90];
          return (
            <>
              <line
                x1={x}
                y1={y}
                x2={x + nx * len}
                y2={y + ny * len}
                stroke={deg === 0 ? "var(--color-warning)" : "var(--color-text-muted)"}
                stroke-width={deg === 0 ? "2" : "1.2"}
              />
              <text
                x={x - nx * 9}
                y={y - ny * 9 + 3.5}
                text-anchor="middle"
                font-size="7"
                font-family="var(--font-mono)"
                fill={deg === 0 ? "var(--color-warning)" : "var(--color-text-dim)"}
                style={{ "user-select": "none" }}
              >
                {label}
              </text>
            </>
          );
        })}

        {/* Needle — red tip points north (counter-rotates with heading) */}
        <g
          transform={`translate(32,32) rotate(${-headingDeg()}) scale(1,${scaleY()})`}
        >
          {/* North half — red */}
          <polygon points="0,-20 4,2 0,0 -4,2" fill="var(--color-warning)" opacity="0.9" />
          {/* South half — dim */}
          <polygon points="0,20 4,2 0,0 -4,2" fill="var(--color-text-muted)" opacity="0.6" />
        </g>

        {/* Center dot */}
        <circle cx="32" cy="32" r="2.5" fill="var(--color-primary)" />
      </svg>

      {/* Heading readout */}
      <div class="compass-heading">
        {Math.round(((headingDeg() % 360) + 360) % 360).toString().padStart(3, "0")}°
      </div>
    </div>
  );
}

export default Compass;
