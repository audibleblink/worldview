# WorldView

A browser-based spy satellite simulator — Google Earth meets Palantir, built as a toy using public data and open-source intelligence feeds.

Photorealistic 3D globe. Live satellite tracking. Military and commercial flight data. Street traffic particles. Real CCTV feeds projected onto 3D city geometry. All of it skinned to look like a classified intelligence terminal.

> Inspired by [Bilawal Sidhu's WorldView project](https://www.spatialintelligence.ai/p/i-built-a-spy-satellite-simulator).

---

## Stack

- **Runtime:** Bun
- **Framework:** SolidJS (fine-grained reactivity)
- **3D Renderer:** CesiumJS + Google Photorealistic 3D Tiles
- **Language:** TypeScript
- **Styling:** Vanilla CSS
- **Backend:** Bun.serve with caching and route maps

---

## Setup

### 1. Prerequisites

- [Bun](https://bun.sh) installed (`curl -fsSL https://bun.sh/install | bash`)
- [mise](https://mise.jdx.dev/) (optional, for task running)
- A Google Maps Tile API key (see below)

### 2. Google Maps Tile API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the **Map Tiles API**
4. Go to **Credentials** → **Create API Key**
5. Restrict the key to the Map Tiles API
6. Copy `.env.example` to `.env` and add your key:

```bash
cp .env.example .env
# Edit .env and add your GOOGLE_MAPS_TILE_API_KEY
```

### 3. Install & Run

```bash
bun install

# Start both servers (using mise)
mise run start

# Or start them separately:
mise run server   # Backend API (port 3001)
mise run dev      # Frontend dev server (port 3000)

# Or using bun directly:
bun run server    # Backend API (port 3001)
bun run dev       # Frontend dev server (port 3000)
```

Open `http://localhost:3000` in Chrome or Firefox.

### 4. Build for Production

```bash
bun run build
```

Output goes to `dist/`.

### 5. Other Commands

```bash
bun run typecheck   # Run TypeScript type checking
bun run verify      # Run migration verification tests
```

---

## Navigation

| Input | Action |
|---|---|
| Mouse drag | Orbit / pan the globe |
| Scroll wheel | Zoom in / out |
| City dropdown | Fly to that city's first POI |
| `Q W E R T` | Jump to POIs 1–5 of the current city |
| PREV / NEXT buttons | Cycle POIs within current city |
| City tabs (bottom) | Quick-jump to any of the 8 cities |
| `1 2 3 4 5` | Switch shader modes (Normal, CRT, NVG, FLIR, AH64) |
| `F` | Toggle FPS counter |
| `[` `]` | Toggle left/right panels |
| `:` | Open command bar (vim-style) |
| `Escape` | Close panels, stop follow mode |

### Command Bar

Press `:` to open, then type:

| Command | Action |
|---|---|
| `:goto NYC` | Fly to New York City |
| `:goto 40.7,-74.0` | Fly to coordinates |
| `:follow ISS` | Follow the ISS satellite |
| `:follow UAL123` | Follow a flight by callsign |
| `:home` | Return to default view |
| `:help` | Show available commands |

### Cities & POIs

| City | POIs |
|---|---|
| Austin, TX | Texas State Capitol, Congress Ave Bridge, UT Tower, Sixth Street |
| San Francisco, CA | Golden Gate Bridge, Salesforce Tower, Alcatraz, Bay Bridge |
| New York, NY | Empire State Building, Brooklyn Bridge, Statue of Liberty, One WTC |
| Tokyo, Japan | Tokyo Tower, Shibuya Crossing, Senso-ji, Tokyo Skytree |
| London, UK | Tower Bridge, Big Ben, Buckingham Palace, The Shard |
| Paris, France | Eiffel Tower, Arc de Triomphe, Notre-Dame, Louvre |
| Dubai, UAE | Burj Khalifa, Palm Jumeirah, Dubai Frame, Burj Al Arab |
| Washington, DC | US Capitol, Washington Monument, Pentagon, Lincoln Memorial |

---

## Project Structure

```
src/
├── index.tsx                 # Entry point
├── App.tsx                   # Root component
├── config.ts                 # Shared constants (PROXY_BASE_URL, etc.)
├── cesium/                   # Cesium bindings
│   ├── CesiumProvider.tsx    # Context provider, viewer lifecycle
│   ├── useCesium.ts          # Hook to access viewer
│   ├── createEntity.ts       # Reactive entity binding
│   ├── createBillboardCollection.ts  # For high-count layers
│   ├── createPointCollection.ts      # For traffic particles
│   └── hooks/
│       ├── usePreRender.ts   # preRender subscription
│       ├── useCamera.ts      # Camera state/controls
│       ├── useSelection.ts   # Entity selection
│       └── useFollowMode.ts  # Shared camera-follow utility
├── stores/
│   ├── layers.ts             # Layer visibility
│   ├── selection.ts          # Selected entity
│   ├── camera.ts             # Camera mode, target
│   ├── ui.ts                 # Panel visibility, command mode
│   └── shaders.ts            # Active post-processing effects
├── layers/
│   ├── registry.ts           # Layer registration system
│   ├── LayerRenderer.tsx     # Renders enabled layers
│   ├── satellites/           # Satellite tracking (TLE/SGP4)
│   ├── flights/              # Aircraft tracking (OpenSky)
│   ├── ships/                # Ship tracking (AIS)
│   └── ground/               # Traffic, CCTV, earthquakes
├── ui/
│   ├── Shell.tsx             # Main layout
│   ├── LeftPanel.tsx         # Layer controls, POIs
│   ├── RightPanel.tsx        # Shader controls, readouts
│   ├── BottomBar.tsx         # Mode switcher, city tabs
│   ├── CommandBar.tsx        # Vim-style input
│   └── panels/               # Entity info panels
├── shaders/
│   ├── ShaderSystem.tsx      # Reactive shader management
│   ├── crt.ts, nvg.ts, flir.ts, ah64.ts  # GLSL shaders
│   └── types.ts              # Shader types
└── server/
    ├── index.ts              # Bun.serve entry with route map
    ├── cache.ts              # TTL cache + request coalescing
    ├── middleware.ts         # Error boundary, logging, CORS
    └── routes/               # API route handlers
```

---

## Data Sources

| Feed | Source | Layer |
|---|---|---|
| Photorealistic 3D Tiles | Google Maps Tile API | Globe |
| Satellite orbits | CelesTrak TLE | Satellites |
| Commercial flights | OpenSky Network | Flights |
| Ship tracking | AISStream | Ships |
| Street network | OpenStreetMap Overpass | Traffic |
| CCTV cameras | Austin/Caltrans/NY511 | Ground |
| Seismic activity | USGS Earthquake API | Ground |

---

## Environment Variables

See `.env.example` for all options:

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_MAPS_TILE_API_KEY` | Yes | Google Maps API key for 3D tiles |
| `AISSTREAM_API_KEY` | No | AISStream API key for ship tracking |
| `PROXY_BASE_URL` | No | Backend URL (default: `http://localhost:3001`) |
| `DEV_SERVER_PORT` | No | Frontend port (default: `3000`) |
| `PROXY_SERVER_PORT` | No | Backend port (default: `3001`) |

---

## Reference

- [Bilawal Sidhu — I Built a Spy Satellite Simulator](https://www.spatialintelligence.ai/p/i-built-a-spy-satellite-simulator)
- [YouTube walkthrough — original build](https://www.youtube.com/watch?v=rXvU7bPJ8n4)
- [Google Maps Tile API docs](https://developers.google.com/maps/documentation/tile)
- [SolidJS documentation](https://www.solidjs.com/docs/latest)
- [CesiumJS documentation](https://cesium.com/learn/cesiumjs/ref-doc/)
