
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.
- Use grepai to semantically search content

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Cesium 3D Globe

This project uses CesiumJS with **Google Photorealistic 3D Tiles** — NOT the default Cesium globe/terrain.

### Critical architecture facts

- `scene.globe.show = false` — the default globe is hidden
- `imageryLayers.removeAll()` — no 2D imagery layers exist
- `terrain: undefined` — no terrain provider is configured
- All visible terrain/imagery comes from a `Cesium3DTileset` loaded from `localhost:3001/v1/3dtiles/root.json` (proxied Google Tiles)
- `HeightReference.CLAMP_TO_GROUND` does **NOT work** (requires globe/terrain provider)

### Positioning objects on the surface

Because there's no terrain provider, you **cannot** use `HeightReference.CLAMP_TO_GROUND` or `HeightReference.RELATIVE_TO_GROUND`. Instead:

```ts
// Use scene.sampleHeight() to query the 3D tile surface height
const carto = Cesium.Cartographic.fromDegrees(lon, lat);
const tileHeight = viewer.scene.sampleHeight(carto);

// sampleHeight returns undefined if tiles aren't loaded at that position
const altitude = (tileHeight ?? fallbackAltitude) + offsetAboveSurface;
const position = Cesium.Cartesian3.fromDegrees(lon, lat, altitude);
```

- `scene.sampleHeight(cartographic)` — synchronous, works with 3D tiles already rendered in view
- `scene.sampleHeightMostDetailed([cartographic])` — async, waits for tiles to load (use for off-screen positions)
- `scene.clampToHeight(cartesian3)` — synchronous, returns clamped Cartesian3
- Always add a small offset (+5m) above the sampled height so objects sit visibly on the surface
- Hardcoding altitude (e.g. `fromDegrees(lon, lat, 10)`) causes parallax errors at oblique camera angles because the object is underground relative to the 3D tile surface

### Camera movement patterns

```ts
// Pan to location, keep current altitude
const currentHeight = viewer.camera.positionCartographic.height;
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(lon, lat, currentHeight),
  duration: 1.5,
});

// Fly to location with specific view angle
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitudeMeters),
  orientation: {
    heading: Cesium.Math.toRadians(0),    // north
    pitch: Cesium.Math.toRadians(-45),     // oblique
    roll: 0,
  },
  duration: 2.0,
});

// Reusable hook: useCamera().flyTo(target, { range, pitch, duration })
// Uses flyToBoundingSphere internally — see src/cesium/hooks/useCamera.ts
```

### Billboards / markers

- Use `createBillboardCollection()` (src/cesium/createBillboardCollection.ts) — NOT the Entity API
- Set `disableDepthTestDistance: Number.POSITIVE_INFINITY` so markers render on top of 3D tiles
- Always sample terrain height for billboard positions (see "Positioning objects" above)

### Debug access

`CesiumProvider.tsx` exposes `window.__viewer` for browser console debugging:
```ts
// In browser console:
const v = window.__viewer;
v.scene.primitives.length;          // count primitives
v.scene.sampleHeight(Cesium.Cartographic.fromDegrees(lon, lat));  // test height
```
