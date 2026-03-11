/**
 * CCTV Source Registry — Entry Point
 * Creates manager singleton, registers sources, re-exports public API.
 */

export type { CameraMediaType, CameraMedia, CCTVCamera, CameraSource } from "./types.ts";
export { CCTVProxyManager } from "./manager.ts";

import { CCTVProxyManager } from "./manager.ts";
import { ArkansasSource } from "./sources/arkansas.ts";
import { AustinSource } from "./sources/austin.ts";
import { CaltransSource } from "./sources/caltrans.ts";
import { NY511Source } from "./sources/ny511.ts";

const manager = new CCTVProxyManager();
manager.register(new ArkansasSource());
manager.register(new AustinSource());
manager.register(new CaltransSource());
manager.register(new NY511Source());

export const cctvProxyManager = manager;
