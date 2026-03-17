/**
 * Arkansas IDrive Camera Source - Token-gated HLS streams
 */

import { CachedCameraSource, type CCTVCamera } from "../types.ts";

interface ArkansasFeature {
  geometry: { coordinates: [number, number] };
  properties: { id: number; name: string; status: string; hls_stream_protected: string };
}

const GEOJSON_URL = "https://layers.idrivearkansas.com/cameras.geojson";
const TOKEN_TTL_MS = 25_000; // Tokens are short-lived

export class ArkansasSource extends CachedCameraSource {
  readonly name = "arkansas";
  protected cacheTtl = 5 * 60 * 1000;
  private tokenCache = new Map<string, { url: string; expiresAt: number }>();

  async fetchFromUpstream(): Promise<CCTVCamera[]> {
    const response = await fetch(GEOJSON_URL);
    if (!response.ok) throw new Error(`Arkansas API error: ${response.status}`);

    const data: { features: ArkansasFeature[] } = await response.json();

    return data.features
      .filter((f) => f.properties.status === "online")
      .map((f) => ({
        id: `arkansas-${f.properties.id}`,
        name: f.properties.name,
        latitude: f.geometry.coordinates[1],
        longitude: f.geometry.coordinates[0],
        source: "arkansas" as const,
        status: "live" as const,
        media: [
          { type: "image" as const, url: `https://layers.idrivearkansas.com/cameras/${f.properties.id}.jpg` },
          { type: "hls" as const, url: f.properties.hls_stream_protected },
        ],
      }));
  }

  async getSignedHlsUrl(cameraId: string): Promise<string> {
    const cached = this.tokenCache.get(cameraId);
    if (cached && Date.now() < cached.expiresAt) return cached.url;

    const match = cameraId.match(/^arkansas-(\d+)$/);
    if (!match) throw new Error(`Invalid Arkansas camera ID: ${cameraId}`);

    const response = await fetch(
      `https://actis.idrivearkansas.com/index.php/api/cameras/feed/${match[1]}.m3u8`,
      {
        headers: { Referer: "https://www.idrivearkansas.com/", Origin: "https://www.idrivearkansas.com" },
        redirect: "manual",
      }
    );

    if (response.status !== 302) throw new Error(`Token gate returned ${response.status}, expected 302`);

    const signedUrl = response.headers.get("Location");
    if (!signedUrl) throw new Error("No Location header in redirect response");

    this.tokenCache.set(cameraId, { url: signedUrl, expiresAt: Date.now() + TOKEN_TTL_MS });
    return signedUrl;
  }
}
