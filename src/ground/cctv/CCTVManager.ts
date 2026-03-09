/**
 * CCTVManager - Manages camera data, billboard projections, and viewport filtering
 */

declare const Cesium: typeof import("cesium");

import type { Camera, BBox, CCTVBillboard, CCTVManagerConfig } from "./types.ts";
import { DEFAULT_CCTV_CONFIG } from "./types.ts";
import { logError, logInfo, logWarn } from "../../errors.ts";
import Hls from "hls.js";

const PROXY_BASE = "http://localhost:3001";

/** Create center-stage overlay HTML */
function createCenterStageHTML(cameraName: string, hasVideo: boolean): string {
  return `
    <div class="cctv-center-stage-container">
      <div class="cctv-center-stage-header">
        <span class="cctv-center-stage-title">${cameraName}</span>
        <div class="cctv-center-stage-controls">
          <button class="cctv-center-stage-btn" id="cctv-refresh-btn">REFRESH</button>
          <button class="cctv-center-stage-btn" id="cctv-unproject-btn">UNPROJECT</button>
          <button class="cctv-center-stage-btn cctv-close-btn" id="cctv-close-btn">CLOSE</button>
        </div>
      </div>
      <div class="cctv-center-stage-feed">
        <canvas id="cctv-center-stage-canvas" width="640" height="480"${hasVideo ? ' style="display:none"' : ''}></canvas>
        ${hasVideo ? '<video id="cctv-center-stage-video" width="640" height="480" autoplay muted playsinline style="background:#000;display:block"></video>' : ''}
      </div>
    </div>
  `;
}

/** Texture pool entry */
interface TexturePoolEntry {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  inUse: boolean;
  lastUsed: number;
}

/** Retry configuration */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

// Camera marker prefix to distinguish from projected billboards
const CAMERA_MARKER_PREFIX = "cctv-marker:";

export class CCTVManager {
  private viewer: InstanceType<typeof Cesium.Viewer> | null = null;
  private config: CCTVManagerConfig;
  private cameras: Camera[] = [];
  private activeBillboards: Map<string, CCTVBillboard> = new Map();
  private onBillboardChange: (() => void) | null = null;
  
  // Texture pool for reusing canvas/texture objects
  private texturePool: TexturePoolEntry[] = [];
  private maxPoolSize = 8;  // Max pooled textures
  
  // Retry state for failed streams
  private retryState: Map<string, { retries: number; nextRetryTime: number }> = new Map();
  
  // Stream failure tracking
  private failedStreams: Set<string> = new Set();
  
  // Center-stage mode
  private centerStageCameraId: string | null = null;
  private centerStageOverlay: HTMLElement | null = null;
  private centerStageHls: Hls | null = null;
  private onCenterStageChange: ((cameraId: string | null) => void) | null = null;
  private centerStageRAFId: number | null = null;
  
  // Camera markers on map
  private cameraMarkers: InstanceType<typeof Cesium.BillboardCollection> | null = null;
  private cameraMarkerTexture: string | null = null;
  private markerMap: Map<string, InstanceType<typeof Cesium.Billboard>> = new Map();
  private markersVisible = false;

  constructor(config: Partial<CCTVManagerConfig> = {}) {
    this.config = { ...DEFAULT_CCTV_CONFIG, ...config };
  }
  
  /** Get a canvas from the texture pool or create a new one */
  private acquireTexture(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
    // First, try to find an available pooled texture
    for (const entry of this.texturePool) {
      if (!entry.inUse) {
        entry.inUse = true;
        entry.lastUsed = Date.now();
        return { canvas: entry.canvas, ctx: entry.ctx };
      }
    }
    
    // Create new texture if pool not full
    if (this.texturePool.length < this.maxPoolSize) {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        logError("CCTV", "Failed to create canvas context for pool");
        return null;
      }
      
      const entry: TexturePoolEntry = {
        canvas,
        ctx,
        inUse: true,
        lastUsed: Date.now(),
      };
      
      this.texturePool.push(entry);
      return { canvas, ctx };
    }
    
    // Pool exhausted - find oldest unused entry and force reuse
    logWarn("CCTV", "Texture pool exhausted, forcing reuse");
    let oldest: TexturePoolEntry | null = null;
    for (const entry of this.texturePool) {
      if (!oldest || entry.lastUsed < oldest.lastUsed) {
        oldest = entry;
      }
    }
    
    if (oldest) {
      oldest.inUse = true;
      oldest.lastUsed = Date.now();
      return { canvas: oldest.canvas, ctx: oldest.ctx };
    }
    
    return null;
  }
  
  /** Release a texture back to the pool */
  private releaseTexture(canvas: HTMLCanvasElement): void {
    for (const entry of this.texturePool) {
      if (entry.canvas === canvas) {
        entry.inUse = false;
        entry.lastUsed = Date.now();
        
        // Clear the canvas
        entry.ctx.fillStyle = "#000000";
        entry.ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        return;
      }
    }
  }
  
  /** Get texture pool statistics */
  getTexturePoolStats(): { total: number; inUse: number; available: number } {
    const inUse = this.texturePool.filter(e => e.inUse).length;
    return {
      total: this.texturePool.length,
      inUse,
      available: this.texturePool.length - inUse,
    };
  }
  
  /** Check if we should retry a failed stream */
  private shouldRetryStream(cameraId: string): boolean {
    const state = this.retryState.get(cameraId);
    if (!state) return true;  // First failure
    
    if (state.retries >= RETRY_CONFIG.maxRetries) {
      return false;  // Max retries exceeded
    }
    
    return Date.now() >= state.nextRetryTime;
  }
  
  /** Record a stream failure for retry logic */
  private recordStreamFailure(cameraId: string): void {
    const state = this.retryState.get(cameraId) || { retries: 0, nextRetryTime: 0 };
    state.retries++;
    
    // Exponential backoff
    const delay = Math.min(
      RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, state.retries - 1),
      RETRY_CONFIG.maxDelayMs
    );
    state.nextRetryTime = Date.now() + delay;
    
    this.retryState.set(cameraId, state);
    this.failedStreams.add(cameraId);
    
    logInfo("CCTV", `Stream failure for ${cameraId}, retry ${state.retries}/${RETRY_CONFIG.maxRetries} in ${delay}ms`);
  }
  
  /** Record a successful stream connection (resets retry state) */
  private recordStreamSuccess(cameraId: string): void {
    this.retryState.delete(cameraId);
    this.failedStreams.delete(cameraId);
  }
  
  /** Check if a stream has failed and exceeded retries */
  isStreamFailed(cameraId: string): boolean {
    const state = this.retryState.get(cameraId);
    return state ? state.retries >= RETRY_CONFIG.maxRetries : false;
  }
  
  /** Get count of failed streams */
  getFailedStreamCount(): number {
    return Array.from(this.retryState.values()).filter(s => s.retries >= RETRY_CONFIG.maxRetries).length;
  }

  /** Initialize with Cesium viewer */
  initialize(viewer: InstanceType<typeof Cesium.Viewer>): void {
    this.viewer = viewer;
    
    // Create billboard collection for camera markers
    this.cameraMarkers = new Cesium.BillboardCollection({ scene: viewer.scene });
    viewer.scene.primitives.add(this.cameraMarkers);
    
    // Create camera icon texture
    this.cameraMarkerTexture = this.createCameraIconTexture();
    
    logInfo("CCTV", "Initialized");
  }
  
  /** Create a camera icon texture for map markers */
  private createCameraIconTexture(): string {
    const size = 40;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    
    const centerX = size / 2;
    const centerY = size / 2;
    
    // Black circle background
    ctx.beginPath();
    ctx.arc(centerX, centerY, 18, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();
    
    // Green border on circle
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Camera body (rounded rectangle)
    ctx.fillStyle = "#00ff88";
    const bodyX = centerX - 10;
    const bodyY = centerY - 6;
    const bodyW = 20;
    const bodyH = 12;
    const radius = 2;
    
    ctx.beginPath();
    ctx.moveTo(bodyX + radius, bodyY);
    ctx.lineTo(bodyX + bodyW - radius, bodyY);
    ctx.quadraticCurveTo(bodyX + bodyW, bodyY, bodyX + bodyW, bodyY + radius);
    ctx.lineTo(bodyX + bodyW, bodyY + bodyH - radius);
    ctx.quadraticCurveTo(bodyX + bodyW, bodyY + bodyH, bodyX + bodyW - radius, bodyY + bodyH);
    ctx.lineTo(bodyX + radius, bodyY + bodyH);
    ctx.quadraticCurveTo(bodyX, bodyY + bodyH, bodyX, bodyY + bodyH - radius);
    ctx.lineTo(bodyX, bodyY + radius);
    ctx.quadraticCurveTo(bodyX, bodyY, bodyX + radius, bodyY);
    ctx.closePath();
    ctx.fill();
    
    // Lens (circle)
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#00ff88";
    ctx.fill();
    
    // Lens highlight
    ctx.beginPath();
    ctx.arc(centerX - 1, centerY - 1, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    
    return canvas.toDataURL();
  }

  /** Set callback for billboard state changes */
  setOnBillboardChange(callback: () => void): void {
    this.onBillboardChange = callback;
  }

  /** Set callback for center-stage mode changes */
  setOnCenterStageChange(callback: (cameraId: string | null) => void): void {
    this.onCenterStageChange = callback;
  }

  /** Check if a camera ID is a CCTV billboard or camera marker */
  isCCTVBillboard(entityId: string): boolean {
    return this.activeBillboards.has(entityId) || entityId.startsWith(CAMERA_MARKER_PREFIX);
  }
  
  /** Check if an entity ID is a camera marker */
  isCameraMarker(entityId: string): boolean {
    return entityId.startsWith(CAMERA_MARKER_PREFIX);
  }
  
  /** Extract camera ID from marker entity ID */
  getCameraIdFromMarker(entityId: string): string | null {
    if (entityId.startsWith(CAMERA_MARKER_PREFIX)) {
      return entityId.slice(CAMERA_MARKER_PREFIX.length);
    }
    return null;
  }

  /** Get the currently center-staged camera ID */
  getCenterStageCameraId(): string | null {
    return this.centerStageCameraId;
  }

  /** Check if a camera is in center-stage mode */
  isCenterStage(cameraId: string): boolean {
    return this.centerStageCameraId === cameraId;
  }

  /** Toggle center-stage mode for a camera */
  toggleCenterStage(cameraId: string): void {
    if (this.centerStageCameraId === cameraId) {
      this.exitCenterStage();
    } else {
      this.enterCenterStage(cameraId);
    }
  }

  /** Enter center-stage mode for a camera */
  enterCenterStage(cameraId: string): void {
    const billboard = this.activeBillboards.get(cameraId);
    if (!billboard) {
      logWarn("CCTV", `Cannot center-stage non-projected camera: ${cameraId}`);
      return;
    }

    // Exit previous center-stage if any
    if (this.centerStageCameraId && this.centerStageCameraId !== cameraId) {
      const prevBillboard = this.activeBillboards.get(this.centerStageCameraId);
      if (prevBillboard) {
        prevBillboard.isCenterStage = false;
      }
    }

    this.centerStageCameraId = cameraId;
    billboard.isCenterStage = true;
    
    // Create center-stage overlay
    this.createCenterStageOverlay(billboard);
    
    this.onCenterStageChange?.(cameraId);
    logInfo("CCTV", `Entered center-stage: ${cameraId}`);
  }

  /** Exit center-stage mode */
  exitCenterStage(): void {
    if (!this.centerStageCameraId) return;

    const billboard = this.activeBillboards.get(this.centerStageCameraId);
    if (billboard) {
      billboard.isCenterStage = false;
    }

    this.removeCenterStageOverlay();
    
    const previousId = this.centerStageCameraId;
    this.centerStageCameraId = null;
    
    this.onCenterStageChange?.(null);
    logInfo("CCTV", `Exited center-stage: ${previousId}`);
  }

  /** Create the center-stage overlay DOM element */
  private createCenterStageOverlay(billboard: CCTVBillboard): void {
    this.removeCenterStageOverlay();

    const camera = this.getCamera(billboard.cameraId);
    const cameraName = camera?.name ?? billboard.cameraId;
    const hasVideo = !!(camera?.videoUrl);

    const overlay = document.createElement("div");
    overlay.id = "cctv-center-stage";
    overlay.className = "cctv-center-stage";
    overlay.innerHTML = createCenterStageHTML(cameraName, hasVideo);

    // Wire up button handlers
    this.wireUpCenterStageButtons(overlay);

    const container = document.getElementById("cesium-container") ?? document.body;
    container.appendChild(overlay);
    this.centerStageOverlay = overlay;

    if (hasVideo && camera?.videoUrl) {
      this.startHLSPlayback(camera.videoUrl, billboard);
    } else {
      this.startCenterStageRendering(billboard);
    }
  }

  /** Wire up center-stage overlay button handlers */
  private wireUpCenterStageButtons(overlay: HTMLElement): void {
    overlay.querySelector("#cctv-close-btn")?.addEventListener("click", () => 
      this.exitCenterStage()
    );

    overlay.querySelector("#cctv-refresh-btn")?.addEventListener("click", () => {
      const cameraId = this.centerStageCameraId;
      if (!cameraId) return;
      const cam = this.getCamera(cameraId);
      const bill = this.activeBillboards.get(cameraId);
      if (cam && bill) this.updateBillboardFrame(bill, cam);
    });

    overlay.querySelector("#cctv-unproject-btn")?.addEventListener("click", () => {
      const cameraId = this.centerStageCameraId;
      this.exitCenterStage();
      if (cameraId) this.removeProjection(cameraId);
    });

    // Click backdrop to close
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.exitCenterStage();
    });
  }

  /** Remove the center-stage overlay */
  private removeCenterStageOverlay(): void {
    // Cancel the animation frame loop
    if (this.centerStageRAFId !== null) {
      cancelAnimationFrame(this.centerStageRAFId);
      this.centerStageRAFId = null;
    }
    
    // Clean up HLS instance
    this.destroyHLS();
    
    if (this.centerStageOverlay) {
      this.centerStageOverlay.remove();
      this.centerStageOverlay = null;
    }
  }

  /** Start rendering frames to the center-stage canvas */
  private startCenterStageRendering(billboard: CCTVBillboard): void {
    const canvas = document.getElementById("cctv-center-stage-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      if (!billboard.isCenterStage || !this.centerStageOverlay) {
        this.centerStageRAFId = null;
        return;
      }

      // Scale and draw the billboard canvas to the larger center-stage canvas
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(billboard.canvas, 0, 0, canvas.width, canvas.height);

      // No border for center-stage (cleaner full-screen look)

      this.centerStageRAFId = requestAnimationFrame(render);
    };

    render();
  }

  /** Start HLS video playback in center-stage mode */
  private startHLSPlayback(videoUrl: string, billboard: CCTVBillboard): void {
    const video = document.getElementById("cctv-center-stage-video") as HTMLVideoElement | null;
    if (!video) {
      // Fallback to canvas rendering
      this.fallbackToCanvas(billboard);
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });

      hls.loadSource(videoUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          logWarn("CCTV", "HLS autoplay blocked, user interaction needed");
        });
      });

      hls.on(Hls.Events.ERROR, (_event: string, data: { fatal: boolean; type: string; details: string }) => {
        if (data.fatal) {
          logError("CCTV", `HLS fatal error: ${data.type} - ${data.details}`);
          this.destroyHLS();
          this.fallbackToCanvas(billboard);
        }
      });

      this.centerStageHls = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS support (Safari)
      video.src = videoUrl;
      video.play().catch(() => {
        logWarn("CCTV", "Native HLS autoplay blocked");
      });
    } else {
      // No HLS support - fallback to canvas
      logWarn("CCTV", "HLS not supported, falling back to static refresh");
      this.fallbackToCanvas(billboard);
    }
  }

  /** Fall back to canvas-based rendering when HLS is unavailable */
  private fallbackToCanvas(billboard: CCTVBillboard): void {
    const canvas = document.getElementById("cctv-center-stage-canvas") as HTMLCanvasElement | null;
    const video = document.getElementById("cctv-center-stage-video") as HTMLVideoElement | null;

    if (canvas) canvas.style.display = "";
    if (video) video.style.display = "none";

    this.startCenterStageRendering(billboard);
  }

  /** Destroy the active HLS instance */
  private destroyHLS(): void {
    if (this.centerStageHls) {
      this.centerStageHls.destroy();
      this.centerStageHls = null;
    }
  }

  /** Fetch cameras within the given viewport */
  async fetchCamerasInViewport(bbox: BBox): Promise<Camera[]> {
    try {
      const params = new URLSearchParams({
        bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
      });

      const response = await fetch(`${PROXY_BASE}/api/cctv/cameras?${params}`);
      
      if (!response.ok) {
        logError("CCTV", `Failed to fetch cameras: ${response.status}`);
        return [];
      }

      this.cameras = await response.json();
      this.updateCameraMarkers();
      return this.cameras;
    } catch (error) {
      logError("CCTV", "Error fetching cameras", error);
      return [];
    }
  }
  
  /** Update camera markers on the map based on fetched cameras */
  private updateCameraMarkers(): void {
    if (!this.cameraMarkers || !this.cameraMarkerTexture) return;
    
    const currentIds = new Set(this.cameras.map(c => c.id));
    
    // Remove markers for cameras no longer in view
    for (const [cameraId, marker] of this.markerMap) {
      if (!currentIds.has(cameraId)) {
        this.cameraMarkers.remove(marker);
        this.markerMap.delete(cameraId);
      }
    }
    
    // Add markers for new cameras (hidden by default, shown only when layer is visible)
    for (const camera of this.cameras) {
      if (!this.markerMap.has(camera.id)) {
        const marker = this.cameraMarkers.add({
          position: Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, 10),
          image: this.cameraMarkerTexture,
          width: 24,
          height: 24,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          id: CAMERA_MARKER_PREFIX + camera.id,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          show: this.markersVisible,
        });
        this.markerMap.set(camera.id, marker);
      }
    }
  }
  
  /** Show camera markers */
  showCameraMarkers(): void {
    this.markersVisible = true;
    if (!this.cameraMarkers) return;
    for (const marker of this.markerMap.values()) {
      marker.show = true;
    }
  }
  
  /** Hide camera markers */
  hideCameraMarkers(): void {
    this.markersVisible = false;
    if (!this.cameraMarkers) return;
    for (const marker of this.markerMap.values()) {
      marker.show = false;
    }
  }

  /** Get all cameras (cached from last fetch) */
  getCameras(): Camera[] {
    return this.cameras;
  }

  /** Get camera by ID */
  getCamera(cameraId: string): Camera | undefined {
    return this.cameras.find((c) => c.id === cameraId);
  }

  /** Get all active billboard projections */
  getActiveBillboards(): CCTVBillboard[] {
    return Array.from(this.activeBillboards.values());
  }

  /** Check if a camera is currently projected */
  isProjected(cameraId: string): boolean {
    return this.activeBillboards.has(cameraId);
  }

  /** Project a camera feed into the 3D scene as a billboard */
  async projectCamera(camera: Camera): Promise<boolean> {
    if (!this.viewer) {
      logError("CCTV", "Viewer not initialized");
      return false;
    }

    // Check max billboard limit
    if (this.activeBillboards.size >= this.config.maxBillboards) {
      logWarn("CCTV", `Max billboards (${this.config.maxBillboards}) reached`);
      return false;
    }

    // Don't project if already active
    if (this.activeBillboards.has(camera.id)) {
      logInfo("CCTV", `Camera ${camera.id} already projected`);
      return false;
    }

    // Acquire texture from pool
    const texture = this.acquireTexture();
    if (!texture) {
      logError("CCTV", "Failed to acquire texture from pool");
      return false;
    }
    
    const { canvas, ctx } = texture;

    // Draw initial placeholder with terminal style
    this.drawPlaceholder(ctx, canvas.width, canvas.height, camera.name);

    // Create Cesium entity with billboard
    // Use camera.id as entity id for click detection
    const entity = this.viewer.entities.add({
      id: camera.id,
      position: Cesium.Cartesian3.fromDegrees(
        camera.longitude,
        camera.latitude,
        this.config.billboardAltitude
      ),
      billboard: {
        image: canvas,
        width: this.config.billboardWidth,
        height: this.config.billboardHeight,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: camera.name,
        font: "12px Courier New",
        fillColor: Cesium.Color.fromCssColorString("#00ff88"),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.TOP,
        pixelOffset: new Cesium.Cartesian2(0, 8),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    // Create billboard state
    const billboard: CCTVBillboard = {
      cameraId: camera.id,
      entity,
      canvas,
      ctx,
      updateInterval: null,
      isActive: true,
      isCenterStage: false,
    };

    // Start frame updates
    billboard.updateInterval = window.setInterval(() => {
      this.updateBillboardFrame(billboard, camera);
    }, this.config.billboardRefreshMs);

    // Initial frame fetch
    this.updateBillboardFrame(billboard, camera);

    this.activeBillboards.set(camera.id, billboard);
    this.onBillboardChange?.();

    logInfo("CCTV", `Projected camera: ${camera.name}`);
    return true;
  }

  /** Remove a billboard projection */
  removeProjection(cameraId: string): void {
    const billboard = this.activeBillboards.get(cameraId);
    if (!billboard) return;

    // Exit center-stage if this billboard is in center-stage
    if (this.centerStageCameraId === cameraId) {
      this.exitCenterStage();
    }

    // Stop frame updates
    if (billboard.updateInterval !== null) {
      clearInterval(billboard.updateInterval);
    }

    // Remove entity from viewer
    if (this.viewer) {
      this.viewer.entities.remove(billboard.entity);
    }

    // Release texture back to pool
    this.releaseTexture(billboard.canvas);

    billboard.isActive = false;
    this.activeBillboards.delete(cameraId);
    this.onBillboardChange?.();

    logInfo("CCTV", `Removed projection: ${cameraId}`);
  }

  /** Toggle a camera projection, optionally flying to the camera */
  async toggleProjection(camera: Camera, flyToOnProject = true): Promise<boolean> {
    if (this.isProjected(camera.id)) {
      this.removeProjection(camera.id);
      return false;
    } else {
      const success = await this.projectCamera(camera);
      if (success && flyToOnProject && this.onFlyToCamera) {
        this.onFlyToCamera(camera.longitude, camera.latitude);
      }
      return success;
    }
  }

  /** Set callback for flying to a camera location */
  private onFlyToCamera: ((longitude: number, latitude: number) => void) | null = null;

  setOnFlyToCamera(callback: (longitude: number, latitude: number) => void): void {
    this.onFlyToCamera = callback;
  }

  /** Update billboard texture with latest frame */
  private async updateBillboardFrame(billboard: CCTVBillboard, camera: Camera): Promise<void> {
    if (!billboard.isActive) return;

    // Check if we should skip due to failed stream with retry backoff
    if (!this.shouldRetryStream(camera.id)) {
      // Don't spam requests for failed streams
      return;
    }

    try {
      const response = await fetch(`${PROXY_BASE}/api/cctv/thumbnail/${camera.id}`);
      
      if (!response.ok) {
        // Camera offline - record failure and show offline state
        this.recordStreamFailure(camera.id);
        this.drawOffline(billboard.ctx, billboard.canvas.width, billboard.canvas.height, camera.name);
        this.updateEntityTexture(billboard);
        return;
      }

      // Success! Reset retry state
      this.recordStreamSuccess(camera.id);

      const blob = await response.blob();
      const img = new Image();
      
      img.onload = () => {
        if (!billboard.isActive) return;
        
        const { ctx, canvas } = billboard;
        
        // Draw video frame
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Add terminal-style border
        this.drawBorder(ctx, canvas.width, canvas.height);
        
        // Update Cesium texture
        this.updateEntityTexture(billboard);
        
        // Clean up object URL
        URL.revokeObjectURL(img.src);
      };

      img.onerror = () => {
        this.recordStreamFailure(camera.id);
        this.drawOffline(billboard.ctx, billboard.canvas.width, billboard.canvas.height, camera.name);
        this.updateEntityTexture(billboard);
      };

      img.src = URL.createObjectURL(blob);
    } catch (error) {
      this.recordStreamFailure(camera.id);
      this.drawOffline(billboard.ctx, billboard.canvas.width, billboard.canvas.height, camera.name);
      this.updateEntityTexture(billboard);
    }
  }

  /** Update the Cesium entity's billboard texture */
  private updateEntityTexture(billboard: CCTVBillboard): void {
    const billboardGraphics = billboard.entity.billboard;
    if (billboardGraphics) {
      // Force texture update by converting canvas to data URL
      // This ensures Cesium treats it as a new texture
      const dataUrl = billboard.canvas.toDataURL('image/png');
      billboardGraphics.image = new Cesium.ConstantProperty(dataUrl);
    }
  }

  /** Draw border on canvas with unproject button */
  private drawBorder(ctx: CanvasRenderingContext2D, width: number, height: number, showUnprojectBtn = true): void {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // Draw unproject button in top-right corner
    if (showUnprojectBtn) {
      const btnWidth = 20;
      const btnHeight = 16;
      const btnX = width - btnWidth - 6;
      const btnY = 6;

      // Button background
      ctx.fillStyle = "rgba(255, 51, 51, 0.8)";
      ctx.fillRect(btnX, btnY, btnWidth, btnHeight);

      // Button border
      ctx.strokeStyle = "#ff3333";
      ctx.lineWidth = 1;
      ctx.strokeRect(btnX, btnY, btnWidth, btnHeight);

      // X icon
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(btnX + 5, btnY + 4);
      ctx.lineTo(btnX + btnWidth - 5, btnY + btnHeight - 4);
      ctx.moveTo(btnX + btnWidth - 5, btnY + 4);
      ctx.lineTo(btnX + 5, btnY + btnHeight - 4);
      ctx.stroke();
    }
  }

  /** Get the unproject button bounds for hit testing */
  getUnprojectButtonBounds(): { x: number; y: number; width: number; height: number } {
    return {
      x: 320 - 20 - 6, // canvas width - btn width - padding
      y: 6,
      width: 20,
      height: 16,
    };
  }

  /** 
   * Handle click on a billboard - check if close button was hit
   * Returns true if close button was clicked and billboard was removed
   */
  handleBillboardClick(
    cameraId: string,
    screenPosition: { x: number; y: number },
    viewer: InstanceType<typeof Cesium.Viewer>
  ): boolean {
    const billboard = this.activeBillboards.get(cameraId);
    if (!billboard) return false;

    // Get billboard screen position and size
    const billboardGraphics = billboard.entity.billboard;
    if (!billboardGraphics) return false;

    const entityPosition = billboard.entity.position?.getValue(Cesium.JulianDate.now());
    if (!entityPosition) return false;

    // Convert entity world position to screen coordinates
    const screenPos = Cesium.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      entityPosition
    );
    if (!screenPos) return false;

    // Get billboard dimensions (accounting for scale)
    const billboardWidth = this.config.billboardWidth;
    const billboardHeight = this.config.billboardHeight;

    // Billboard is anchored at bottom-center, so calculate bounds
    const billboardLeft = screenPos.x - billboardWidth / 2;
    const billboardTop = screenPos.y - billboardHeight;

    // Convert click position to billboard-local coordinates
    const localX = screenPosition.x - billboardLeft;
    const localY = screenPosition.y - billboardTop;

    // Check if click is within billboard bounds
    if (localX < 0 || localX > billboardWidth || localY < 0 || localY > billboardHeight) {
      return false;
    }

    // Scale local coordinates to canvas coordinates (canvas is 320x240)
    const canvasX = (localX / billboardWidth) * 320;
    const canvasY = (localY / billboardHeight) * 240;

    // Check if click hit the close button
    const btnBounds = this.getUnprojectButtonBounds();
    if (
      canvasX >= btnBounds.x &&
      canvasX <= btnBounds.x + btnBounds.width &&
      canvasY >= btnBounds.y &&
      canvasY <= btnBounds.y + btnBounds.height
    ) {
      // Close button clicked - remove the billboard
      this.removeProjection(cameraId);
      logInfo("CCTV", `Close button clicked, removed billboard: ${cameraId}`);
      return true;
    }

    return false;
  }

  /** Draw placeholder frame */
  private drawPlaceholder(ctx: CanvasRenderingContext2D, width: number, height: number, name: string): void {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    
    ctx.fillStyle = "#00ff88";
    ctx.font = "bold 14px Courier New";
    ctx.textAlign = "center";
    ctx.fillText("CONNECTING...", width / 2, height / 2 - 10);
    
    ctx.font = "10px Courier New";
    ctx.fillText(name, width / 2, height / 2 + 10);
    
    this.drawBorder(ctx, width, height);
  }

  /** Draw offline frame */
  private drawOffline(ctx: CanvasRenderingContext2D, width: number, height: number, name: string): void {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    
    ctx.fillStyle = "#ff3333";
    ctx.font = "bold 14px Courier New";
    ctx.textAlign = "center";
    ctx.fillText("OFFLINE", width / 2, height / 2 - 10);
    
    ctx.fillStyle = "#4a9e8a";
    ctx.font = "10px Courier New";
    ctx.fillText(name, width / 2, height / 2 + 10);
    
    // Red border for offline
    ctx.strokeStyle = "#ff3333";
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, width - 2, height - 2);
  }

  /** Get count of active billboards */
  getActiveBillboardCount(): number {
    return this.activeBillboards.size;
  }

  /** Clean up all resources */
  destroy(): void {
    // Clean up HLS first
    this.destroyHLS();
    
    // Exit center-stage
    this.exitCenterStage();
    
    // Remove all active billboards
    for (const cameraId of this.activeBillboards.keys()) {
      this.removeProjection(cameraId);
    }

    // Clear texture pool
    this.texturePool = [];
    this.retryState.clear();
    this.failedStreams.clear();
    this.cameras = [];
    this.viewer = null;

    logInfo("CCTV", "Destroyed");
  }
  
  /** Reset retry state for a specific camera */
  resetRetryState(cameraId: string): void {
    this.retryState.delete(cameraId);
    this.failedStreams.delete(cameraId);
  }
  
  /** Reset all retry states */
  resetAllRetryStates(): void {
    this.retryState.clear();
    this.failedStreams.clear();
  }
}
