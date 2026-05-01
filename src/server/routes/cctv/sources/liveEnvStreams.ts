/**
 * Live Environment Streams — willytop8/Live-Environment-Streams GeoJSON.
 * 5k+ global outdoor cams; we keep only direct HLS (`url_type === "hls"`)
 * and skip families already covered by dedicated adapters.
 */

import { CachedCameraSource, type CCTVCamera } from "../types.ts";

interface Feature {
  geometry: { coordinates: [number, number] };
  properties: {
    name: string;
    display_name?: string;
    url: string;
    country_code?: string;
    environment?: string;
    source_family: string;
    url_type: string;
    scene_type?: string;
  };
}

const GEOJSON_URL =
  "https://raw.githubusercontent.com/willytop8/Live-Environment-Streams/main/streams.geojson";

// Allowlist of source families validated as reachable via plain fetch.
// Excluded: mdsha/nysdot/caltrans/ladot (covered by dedicated adapters);
// skylinewebcams/autobahn_nrw/earthcam/ktict/vegvesen/taiwan_freeway/paspro/
// panama_canal (auth-gated or require browser-only origin/referer).
const ALLOWED_FAMILIES = new Set([
  "vdot", "vdotcameras", "deldot", "opencctv", "iticfoundation", "brownrice",
]);

export class LiveEnvStreamsSource extends CachedCameraSource {
  readonly name = "livestreams";
  protected cacheTtl = 24 * 60 * 60 * 1000; // 24h — catalog rarely changes

  async fetchFromUpstream(): Promise<CCTVCamera[]> {
    const response = await fetch(GEOJSON_URL);
    if (!response.ok) throw new Error(`LiveEnvStreams error: ${response.status}`);
    const data: { features: Feature[] } = await response.json();

    return data.features
      .filter(
        (f) =>
          f.properties.url_type === "hls" &&
          ALLOWED_FAMILIES.has(f.properties.source_family) &&
          /^https?:\/\//.test(f.properties.url),
      )
      .map((f, i) => {
        const [lon, lat] = f.geometry.coordinates;
        const slug = f.properties.source_family;
        return {
          id: `livestreams-${slug}-${i}`,
          name: f.properties.display_name || f.properties.name,
          latitude: lat,
          longitude: lon,
          source: "livestreams" as const,
          status: "live" as const,
          media: [{ type: "hls" as const, url: f.properties.url }],
          roadway: f.properties.scene_type,
        };
      });
  }
}
