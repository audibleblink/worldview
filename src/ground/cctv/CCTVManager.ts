/**
 * CCTVManager - Manages camera data, billboard projections, and viewport filtering
 */

declare const Cesium: typeof import("cesium");

import type { Camera, BBox, CCTVBillboard, CCTVManagerConfig } from "./types.ts";
import { DEFAULT_CCTV_CONFIG } from "./types.ts";

const PROXY_BASE = "http://localhost:3001";

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
        console.error("[CCTVManager] Failed to create canvas context for pool");
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
    console.warn("[CCTVManager] Texture pool exhausted, forcing reuse");
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
    
    console.log(`[CCTVManager] Stream failure for ${cameraId}, retry ${state.retries}/${RETRY_CONFIG.maxRetries} in ${delay}ms`);
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
    console.log("[CCTVManager] Initialized");
  }

  /** Set callback for billboard state changes */
  setOnBillboardChange(callback: () => void): void {
    this.onBillboardChange = callback;
  }

  /** Fetch cameras within the given viewport */
  async fetchCamerasInViewport(bbox: BBox): Promise<Camera[]> {
    try {
      const params = new URLSearchParams({
        bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
      });

      const response = await fetch(`${PROXY_BASE}/api/cctv/cameras?${params}`);
      
      if (!response.ok) {
        console.error(`[CCTVManager] Failed to fetch cameras: ${response.status}`);
        return [];
      }

      this.cameras = await response.json();
      return this.cameras;
    } catch (error) {
      console.error("[CCTVManager] Error fetching cameras:", error);
      return [];
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
      console.error("[CCTVManager] Viewer not initialized");
      return false;
    }

    // Check max billboard limit
    if (this.activeBillboards.size >= this.config.maxBillboards) {
      console.warn(`[CCTVManager] Max billboards (${this.config.maxBillboards}) reached`);
      return false;
    }

    // Don't project if already active
    if (this.activeBillboards.has(camera.id)) {
      console.log(`[CCTVManager] Camera ${camera.id} already projected`);
      return false;
    }

    // Acquire texture from pool
    const texture = this.acquireTexture();
    if (!texture) {
      console.error("[CCTVManager] Failed to acquire texture from pool");
      return false;
    }
    
    const { canvas, ctx } = texture;

    // Draw initial placeholder with terminal style
    this.drawPlaceholder(ctx, canvas.width, canvas.height, camera.name);

    // Create Cesium entity with billboard
    const entity = this.viewer.entities.add({
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
    };

    // Start frame updates
    billboard.updateInterval = window.setInterval(() => {
      this.updateBillboardFrame(billboard, camera);
    }, this.config.billboardRefreshMs);

    // Initial frame fetch
    this.updateBillboardFrame(billboard, camera);

    this.activeBillboards.set(camera.id, billboard);
    this.onBillboardChange?.();

    console.log(`[CCTVManager] Projected camera: ${camera.name}`);
    return true;
  }

  /** Remove a billboard projection */
  removeProjection(cameraId: string): void {
    const billboard = this.activeBillboards.get(cameraId);
    if (!billboard) return;

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

    console.log(`[CCTVManager] Removed projection: ${cameraId}`);
  }

  /** Toggle a camera projection */
  async toggleProjection(camera: Camera): Promise<boolean> {
    if (this.isProjected(camera.id)) {
      this.removeProjection(camera.id);
      return false;
    } else {
      return await this.projectCamera(camera);
    }
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
      // Force texture update by re-assigning the canvas
      billboardGraphics.image = new Cesium.ConstantProperty(billboard.canvas);
    }
  }

  /** Draw terminal-style border on canvas */
  private drawBorder(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, width - 2, height - 2);
    
    // Add subtle glow effect
    ctx.strokeStyle = "rgba(0, 255, 136, 0.3)";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, width - 6, height - 6);
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

    console.log("[CCTVManager] Destroyed");
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
