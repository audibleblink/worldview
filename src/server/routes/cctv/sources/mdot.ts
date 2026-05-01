/**
 * MDOT CHART Camera Source — Maryland DOT public traffic cameras.
 * No API key required. HLS URL is constructed from per-camera cctvIp + id.
 */

import { CachedCameraSource, type CCTVCamera } from "../types.ts";

interface MDOTCamera {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lon: number;
  cctvIp: string;
  opStatus: string;
  publicVideoURL?: string;
  routeNumber?: number;
  routePrefix?: string;
  routeSuffix?: string;
}

const ENDPOINT = "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getCameraMapDataJSON.do";

export class MDOTSource extends CachedCameraSource {
  readonly name = "mdot";
  protected cacheTtl = 5 * 60 * 1000;

  async fetchFromUpstream(): Promise<CCTVCamera[]> {
    const response = await fetch(ENDPOINT);
    if (!response.ok) throw new Error(`MDOT API error: ${response.status}`);
    const { data }: { data: MDOTCamera[] } = await response.json();

    return data
      .filter((c) => c.opStatus === "OK" && c.cctvIp && c.lat !== 0 && c.lon !== 0)
      .map((c) => ({
        id: `mdot-${c.id}`,
        name: c.description || c.name,
        latitude: c.lat,
        longitude: c.lon,
        source: "mdot" as const,
        status: "live" as const,
        media: [
          { type: "hls" as const, url: `https://${c.cctvIp}/rtplive/${c.id}/playlist.m3u8` },
        ],
        roadway: c.routeNumber ? `${c.routePrefix ?? ""}${c.routeNumber}${c.routeSuffix ?? ""}`.trim() : undefined,
      }));
  }
}
