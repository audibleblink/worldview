/**
 * MapViewLayer - Google Maps 2D basemap
 * Provides a standard Google Maps view with roads, labels, towns, etc.
 * Can toggle between this 2D view and the 3D photorealistic tiles
 */

declare const Cesium: typeof import("cesium");

const PROXY_URL = "http://localhost:3001";

export type MapStyle = "roadmap" | "satellite" | "terrain" | "hybrid";

export class MapViewLayer {
  private viewer: InstanceType<typeof Cesium.Viewer> | null = null;
  private imageryLayer: InstanceType<typeof Cesium.ImageryLayer> | null = null;
  private tileset3D: InstanceType<typeof Cesium.Cesium3DTileset> | null = null;
  private isMapMode = false;
  private currentStyle: MapStyle = "roadmap";

  /**
   * Initialize the layer with a Cesium viewer
   */
  initialize(viewer: InstanceType<typeof Cesium.Viewer>): void {
    this.viewer = viewer;
    
    // Find the existing 3D tileset
    const primitives = viewer.scene.primitives;
    for (let i = 0; i < primitives.length; i++) {
      const primitive = primitives.get(i);
      if (primitive instanceof Cesium.Cesium3DTileset) {
        this.tileset3D = primitive;
        break;
      }
    }
    
    console.log("[MapViewLayer] Initialized");
  }

  /**
   * Switch to 2D map view
   */
  show(style: MapStyle = "roadmap"): void {
    if (!this.viewer || this.isMapMode) return;

    this.currentStyle = style;

    // Hide 3D tileset
    if (this.tileset3D) {
      this.tileset3D.show = false;
    }

    // Show the globe (was hidden for 3D tiles)
    this.viewer.scene.globe.show = true;

    // Create Google Maps imagery provider
    // lyrs parameter: m=roadmap, s=satellite, p=terrain, y=hybrid
    const lyrsMap: Record<MapStyle, string> = {
      roadmap: "m",
      satellite: "s", 
      terrain: "p",
      hybrid: "y",
    };

    const provider = new Cesium.UrlTemplateImageryProvider({
      url: `${PROXY_URL}/map-tiles/{z}/{x}/{y}?lyrs=${lyrsMap[style]}`,
      minimumLevel: 0,
      maximumLevel: 20,
      tileWidth: 256,
      tileHeight: 256,
      credit: new Cesium.Credit("Map data \u00a9 Google"),
    });

    // Add as the base imagery layer
    this.imageryLayer = this.viewer.imageryLayers.addImageryProvider(provider);

    this.isMapMode = true;
    console.log(`[MapViewLayer] Switched to 2D ${style} view`);
  }

  /**
   * Switch back to 3D photorealistic view
   */
  hide(): void {
    if (!this.viewer || !this.isMapMode) return;

    // Remove 2D imagery
    if (this.imageryLayer) {
      this.viewer.imageryLayers.remove(this.imageryLayer);
      this.imageryLayer = null;
    }

    // Hide globe again
    this.viewer.scene.globe.show = false;

    // Show 3D tileset
    if (this.tileset3D) {
      this.tileset3D.show = true;
    }

    this.isMapMode = false;
    console.log("[MapViewLayer] Switched to 3D view");
  }

  /**
   * Toggle between 2D and 3D view
   */
  toggle(): boolean {
    if (this.isMapMode) {
      this.hide();
    } else {
      this.show(this.currentStyle);
    }
    return this.isMapMode;
  }

  /**
   * Check if currently in 2D map mode
   */
  isActive(): boolean {
    return this.isMapMode;
  }

  /**
   * Get current map style
   */
  getStyle(): MapStyle {
    return this.currentStyle;
  }

  /**
   * Change map style (only applies if in map mode)
   */
  setStyle(style: MapStyle): void {
    if (!this.isMapMode) {
      this.currentStyle = style;
      return;
    }

    // Remove current layer and add new one with different style
    if (this.imageryLayer && this.viewer) {
      this.viewer.imageryLayers.remove(this.imageryLayer);
      this.imageryLayer = null;
    }

    this.isMapMode = false;
    this.show(style);
  }

  /**
   * Cycle through map styles
   */
  cycleStyle(): MapStyle {
    const styles: MapStyle[] = ["roadmap", "satellite", "terrain", "hybrid"];
    const currentIndex = styles.indexOf(this.currentStyle);
    const nextIndex = (currentIndex + 1) % styles.length;
    const nextStyle = styles[nextIndex];
    this.setStyle(nextStyle);
    return nextStyle;
  }

  /**
   * Destroy the layer
   */
  destroy(): void {
    this.hide();
    this.viewer = null;
    this.tileset3D = null;
  }
}

// Export singleton
export const mapViewLayer = new MapViewLayer();
