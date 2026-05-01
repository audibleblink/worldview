/**
 * iPeak 511 Camera Source — generic adapter for the 511 family of state/province
 * traffic portals (PA, LA, WI, GA, MI, Ontario, NY, …) that share the same
 * `/api/v2/get/cameras` endpoint.
 *
 * Each `View` becomes a media entry: `VideoUrl` (when present) is HLS,
 * otherwise `Url` is treated as a refreshing JPEG snapshot.
 */

import { CachedCameraSource, type CCTVCamera, type CameraMedia } from "../types.ts";

interface View {
  Id: number;
  Url: string;
  Status: string;
  Description?: string;
  VideoUrl?: string | null;
}

interface Camera {
  Id: number;
  Source?: string;
  SourceId?: string;
  Roadway?: string;
  Direction?: string;
  Latitude: number;
  Longitude: number;
  Location?: string;
  Views: View[];
}

export interface IPeak511Config {
  /** Source name, e.g. "511pa" — used as id prefix and registry key */
  name: string;
  /** Portal base URL, e.g. "https://511pa.com" */
  baseUrl: string;
  /** Env var holding the developer key. Omit for portals that don't require one. */
  apiKeyEnv?: string;
}

export class IPeak511Source extends CachedCameraSource {
  readonly name: string;
  protected cacheTtl = 5 * 60 * 1000;

  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly requiresKey: boolean;

  constructor(config: IPeak511Config) {
    super();
    this.name = config.name;
    this.endpoint = `${config.baseUrl}/api/v2/get/cameras`;
    this.requiresKey = !!config.apiKeyEnv;
    this.apiKey = config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined;
    if (this.requiresKey && !this.apiKey) {
      console.warn(`[CCTV] ${this.name}: ${config.apiKeyEnv} not set — source disabled`);
    }
  }

  async fetchFromUpstream(): Promise<CCTVCamera[]> {
    if (this.requiresKey && !this.apiKey) return [];

    const url = `${this.endpoint}?format=json${this.apiKey ? `&key=${this.apiKey}` : ""}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${this.name} API error: ${response.status}`);
    const data: Camera[] = await response.json();

    return data
      .filter((c) => c.Latitude !== 0 && c.Longitude !== 0 && c.Views?.length)
      .map((c) => {
        const media: CameraMedia[] = [];
        for (const v of c.Views) {
          if (v.Status !== "Enabled") continue;
          if (v.VideoUrl) media.push({ type: "hls", url: v.VideoUrl });
          else if (v.Url) media.push({ type: "image", url: v.Url });
        }
        return {
          id: `${this.name}-${c.Id}`,
          name: c.Location || `${c.Roadway ?? ""} ${c.SourceId ?? c.Id}`.trim(),
          latitude: c.Latitude,
          longitude: c.Longitude,
          source: this.name,
          status: "live" as const,
          media,
          roadway: c.Roadway,
          direction: c.Direction && c.Direction !== "Unknown" ? c.Direction : undefined,
        };
      })
      .filter((c) => c.media.length > 0);
  }

}

export const IPEAK_511_SOURCES: IPeak511Config[] = [
  { name: "511on", baseUrl: "https://511on.ca" }, // no key required
  { name: "511ny", baseUrl: "https://511ny.org", apiKeyEnv: "FIVE11_NY_KEY" },
  { name: "511pa", baseUrl: "https://511pa.com", apiKeyEnv: "FIVE11_PA_KEY" },
  { name: "511la", baseUrl: "https://511la.org", apiKeyEnv: "FIVE11_LA_KEY" },
  { name: "511wi", baseUrl: "https://511wi.gov", apiKeyEnv: "FIVE11_WI_KEY" },
  { name: "511ga", baseUrl: "https://511ga.org", apiKeyEnv: "FIVE11_GA_KEY" },
  { name: "511mi", baseUrl: "https://mi.gov",    apiKeyEnv: "FIVE11_MI_KEY" },
];
