# WorldView

A browser-based spy satellite simulator — Google Earth meets Palantir, built as a toy using public data and open-source intelligence feeds.

Photorealistic 3D globe. Live satellite tracking. Military and commercial flight data. Street traffic particles. Real CCTV feeds projected onto 3D city geometry. All of it skinned to look like a classified intelligence terminal.

> Inspired by [Bilawal Sidhu's WorldView project](https://www.spatialintelligence.ai/p/i-built-a-spy-satellite-simulator).

Basically just told Claude to look at `./spec/init.txt` while enabling playright and yt-dlp. The said "make it"


---

## Stack

- **Runtime:** Bun
- **3D Renderer:** CesiumJS + Google Photorealistic 3D Tiles
- **Language:** TypeScript
- **Styling:** Vanilla CSS
- **Proxy:** Bun HTTP server (keeps Google API key server-side)

---

## Setup

### 1. Prerequisites

- [Bun](https://bun.sh) installed (`curl -fsSL https://bun.sh/install | bash`)
- A Google Maps Tile API key (see below)

### 2. Google Maps Tile API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the **Map Tiles API**
4. Go to **Credentials** → **Create API Key**
5. Restrict the key to the Map Tiles API
6. Add to `.env` at the project root:

```
GOOGLE_MAPS_TILE_API_KEY=your_key_here
```

`.env` is already in `.gitignore` — do not commit it.

### 3. Install & Run

```bash
bun install
bun run dev
```

This starts:
- Frontend dev server on `http://localhost:3000`
- Tile proxy server on `http://localhost:3001`

Open `http://localhost:3000` in Chrome or Firefox.

### 4. Build

```bash
bun run build
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
tbd
```

---

## Roadmap

| Milestone | Description | Status |
|---|---|---|
| 1 — Globe Foundation | 3D globe, camera nav, POI fly-to, UI shell | In planning |
| 2 — Shader Pipeline | CRT, NVG, FLIR, cel-shading post-processing | Planned |
| 3 — Satellite Layer | CelesTrak TLE, orbital rendering, click-to-track | Planned |
| 4 — Flight Layer | OpenSky commercial + ADS-B military flights | Planned |
| 5 — Ground Layer | OSM traffic particles, CCTV feed projection | Planned |
| 6 — Timeline Playback | OSINT snapshot recording + replay system | Planned |

---

## Data Sources

| Feed | Source | Used In |
|---|---|---|
| Photorealistic 3D Tiles | Google Maps Tile API | Milestone 1+ |
| Satellite orbits | CelesTrak TLE | Milestone 3 |
| Commercial flights | OpenSky Network | Milestone 4 |
| Military flights | ADS-B Exchange | Milestone 4 |
| Street network | OpenStreetMap Overpass API | Milestone 5 |
| CCTV cameras | Austin public traffic cams | Milestone 5 |
| Seismic activity | USGS Earthquake API | Milestone 5 |

---

## Reference

- [Bilawal Sidhu — I Built a Spy Satellite Simulator](https://www.spatialintelligence.ai/p/i-built-a-spy-satellite-simulator)
- [YouTube walkthrough — original build](https://www.youtube.com/watch?v=rXvU7bPJ8n4)
- [YouTube — Operation Epic Fury reconstruction](https://www.youtube.com/watch?v=0p8o7AeHDzg)
- [Google Maps Tile API docs](https://developers.google.com/maps/documentation/tile)
