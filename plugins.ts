/**
 * Bun plugin preload for SolidJS compilation.
 * Loaded via bunfig.toml preload.
 */
import { plugin } from "bun";
import { SolidPlugin } from "bun-plugin-solid";

plugin(SolidPlugin());
