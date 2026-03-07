# WorldView

A spy satellite simulator and geospatial intelligence visualization tool built with CesiumJS and Google Photorealistic 3D Tiles.

## Features

- Interactive 3D globe with Google Photorealistic 3D Tiles
- Retro CRT-inspired UI aesthetic
- Pre-configured points of interest across 8 major cities
- Keyboard shortcuts for rapid POI navigation
- Live camera telemetry readouts (GSD, NIIRS, altitude)
- Multiple view mode presets (CRT, NVG, FLIR, etc.)

## Setup

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.0+)
- Google Cloud account with Map Tiles API enabled

### Installation

```bash
bun install
```

### API Key Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Map Tiles API** under APIs & Services
4. Create an API key under Credentials
5. Create a `.env` file in the project root:

```env
GOOGLE_MAPS_TILE_API_KEY=your_api_key_here
```

**Note:** The Map Tiles API provides access to Google's Photorealistic 3D Tiles. Standard usage is billed; see [Google's pricing](https://developers.google.com/maps/documentation/tile/usage-and-billing) for details.

## Development

Start both the dev server and tile proxy:

```bash
bun run dev
```

This runs two servers:
- **Dev server** (port 3000): Serves the application with hot reload
- **Tile proxy** (port 3001): Proxies Google 3D Tiles requests with API key injection

### Individual Commands

```bash
# Start only the proxy server
bun run proxy

# Run TypeScript type checking
bun run typecheck

# Build for production
bun run build
```

## Controls

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Q | Jump to POI 1 |
| W | Jump to POI 2 |
| E | Jump to POI 3 |
| R | Jump to POI 4 |
| T | Jump to POI 5 |

### Mouse Controls

- **Left-click + drag**: Rotate the camera
- **Right-click + drag**: Zoom in/out
- **Middle-click + drag**: Pan the camera
- **Scroll wheel**: Zoom in/out

## Architecture

```
src/
├── main.ts          # Application entry point, keyboard handlers
├── globe.ts         # CesiumJS viewer and 3D tiles setup
├── pois.ts          # Points of interest data and navigation
├── server.ts        # Development server (Bun.serve)
├── proxy.ts         # Google 3D Tiles proxy server
└── ui/
    ├── shell.ts     # Main UI container and top bar
    ├── left-panel.ts    # City selector, POI navigation, calibration
    ├── right-panel.ts   # Parameters, live camera readouts
    └── bottom-bar.ts    # Mode switcher, city tabs, location display
```

### Key Modules

- **globe.ts**: Initializes CesiumJS viewer with optimized settings for Google 3D Tiles. Handles error states for missing API keys or network issues.

- **pois.ts**: Contains POI data for 8 cities (Austin, San Francisco, NYC, Tokyo, London, Paris, Dubai, Washington DC) with 4 landmarks each. Manages camera fly-to animations.

- **proxy.ts**: CORS proxy that injects the Google Maps API key into tile requests. Required because the API key cannot be exposed in browser code.

## Cities & Points of Interest

| City | Landmarks |
|------|-----------|
| Austin, TX | Texas State Capitol, Congress Ave Bridge, UT Tower, Sixth Street |
| San Francisco, CA | Golden Gate Bridge, Salesforce Tower, Alcatraz, Bay Bridge |
| New York, NY | Empire State Building, Brooklyn Bridge, Statue of Liberty, One WTC |
| Tokyo, Japan | Tokyo Tower, Shibuya Crossing, Senso-ji Temple, Tokyo Skytree |
| London, UK | Tower Bridge, Big Ben, Buckingham Palace, The Shard |
| Paris, France | Eiffel Tower, Arc de Triomphe, Notre-Dame, Louvre |
| Dubai, UAE | Burj Khalifa, Palm Jumeirah, Dubai Frame, Burj Al Arab |
| Washington, DC | US Capitol, Washington Monument, Pentagon, Lincoln Memorial |

## Troubleshooting

### "Proxy server not running" error

Make sure the proxy server is running:
```bash
bun run proxy
```

### "API Key Error" on screen

1. Verify your `.env` file contains a valid `GOOGLE_MAPS_TILE_API_KEY`
2. Check that the Map Tiles API is enabled in Google Cloud Console
3. Verify API key restrictions allow the Map Tiles API

### Tiles not loading / blank globe

1. Check browser console for network errors
2. Verify the proxy is running on port 3001
3. Test the proxy health: `curl http://localhost:3001/health`

## License

Private project - all rights reserved.
