/**
 * CCTVPanel - UI panel showing cameras in viewport with thumbnails
 */

import type { Camera, BBox } from "./types.ts";
import type { CCTVManager } from "./CCTVManager.ts";

const PROXY_BASE = "http://localhost:3001";

// Thumbnail refresh configuration
const THUMBNAIL_REFRESH_MS = 30_000;  // Refresh every 30 seconds (service only updates every 30s)
const THUMBNAIL_STAGGER_MS = 500;     // Stagger requests by 500ms to avoid bursts
const MAX_CONCURRENT_REQUESTS = 2;    // Limit concurrent thumbnail requests

/** Panel state and DOM references */
interface PanelState {
  container: HTMLElement | null;
  cameraList: HTMLElement | null;
  manager: CCTVManager | null;
  cameras: Camera[];
  thumbnailIntervals: Map<string, number>;
  refreshInterval: number | null;
  objectUrls: Map<string, string>;  // Track object URLs for cleanup
  pendingRequests: Set<string>;     // Track in-flight requests
  isRefreshing: boolean;
}

const state: PanelState = {
  container: null,
  cameraList: null,
  manager: null,
  cameras: [],
  thumbnailIntervals: new Map(),
  refreshInterval: null,
  objectUrls: new Map(),
  pendingRequests: new Set(),
  isRefreshing: false,
};

/** Initialize the CCTV panel */
export function initCCTVPanel(manager: CCTVManager): HTMLElement {
  state.manager = manager;

  // Create panel container
  const container = document.createElement("div");
  container.className = "cctv-panel";

  container.innerHTML = `
    <div class="cctv-panel-header">
      <span class="cctv-panel-title">CCTV CAMERAS</span>
      <span class="cctv-panel-count" id="cctv-count">0</span>
    </div>
    <div class="cctv-camera-list" id="cctv-camera-list">
      <div class="cctv-loading">SCANNING VIEWPORT...</div>
    </div>
  `;

  state.container = container;
  state.cameraList = container.querySelector("#cctv-camera-list");

  // Listen for billboard changes to update UI
  manager.setOnBillboardChange(() => {
    updateCameraListUI();
  });

  return container;
}

/** Update cameras for the current viewport */
export async function updateCamerasForViewport(bbox: BBox): Promise<void> {
  if (!state.manager || !state.cameraList) return;

  // Clear existing thumbnail intervals
  clearThumbnailIntervals();

  // Show loading state
  state.cameraList.innerHTML = '<div class="cctv-loading">SCANNING VIEWPORT...</div>';

  // Fetch cameras in viewport
  state.cameras = await state.manager.fetchCamerasInViewport(bbox);

  // Update count display
  const countEl = state.container?.querySelector("#cctv-count");
  if (countEl) {
    countEl.textContent = String(state.cameras.length);
  }

  // Render camera list
  updateCameraListUI();
}

/** Render the camera list UI */
function updateCameraListUI(): void {
  if (!state.cameraList || !state.manager) return;

  if (state.cameras.length === 0) {
    state.cameraList.innerHTML = '<div class="cctv-empty">NO CAMERAS IN VIEWPORT</div>';
    return;
  }

  state.cameraList.innerHTML = "";

  for (const camera of state.cameras) {
    const item = createCameraItem(camera);
    state.cameraList.appendChild(item);
  }

  // Start thumbnail refresh for all cameras
  startThumbnailRefresh();
}

/** Create a camera list item element */
function createCameraItem(camera: Camera): HTMLElement {
  const item = document.createElement("div");
  item.className = "cctv-item";
  item.dataset.cameraId = camera.id;

  const isProjected = state.manager?.isProjected(camera.id) ?? false;
  if (isProjected) {
    item.classList.add("projected");
  }

  item.innerHTML = `
    <div class="cctv-thumb-container">
      <img class="cctv-thumb" id="thumb-${camera.id}" src="" alt="${camera.name}">
      <div class="cctv-status ${camera.status}">${camera.status.toUpperCase()}</div>
    </div>
    <div class="cctv-info">
      <div class="cctv-name">${camera.name}</div>
      ${camera.roadway ? `<div class="cctv-roadway">${camera.roadway}${camera.direction ? ' · ' + camera.direction : ''}</div>` : ''}
      <div class="cctv-coords">${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}</div>
      <button class="cctv-project-btn ${isProjected ? "active" : ""}">${isProjected ? "REMOVE" : "PROJECT"}</button>
    </div>
  `;

  // Click handler for project/remove button
  const btn = item.querySelector(".cctv-project-btn") as HTMLButtonElement;
  btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    handleProjectClick(camera);
  });

  // Click handler for entire item (also projects)
  item.addEventListener("click", () => {
    handleProjectClick(camera);
  });

  // Load initial thumbnail
  loadThumbnail(camera.id);

  return item;
}

/** Handle project button click */
async function handleProjectClick(camera: Camera): Promise<void> {
  if (!state.manager) return;

  const wasProjected = state.manager.isProjected(camera.id);
  const success = await state.manager.toggleProjection(camera);

  // Update UI is handled by onBillboardChange callback
  if (!wasProjected && !success) {
    // Failed to project (max reached)
    const item = state.cameraList?.querySelector(`[data-camera-id="${camera.id}"]`);
    if (item) {
      item.classList.add("error");
      setTimeout(() => item.classList.remove("error"), 500);
    }
  }
}

/** Load thumbnail for a camera */
async function loadThumbnail(cameraId: string): Promise<void> {
  const img = document.getElementById(`thumb-${cameraId}`) as HTMLImageElement | null;
  if (!img) return;

  // Skip if already have a pending request for this camera
  if (state.pendingRequests.has(cameraId)) return;
  
  // Limit concurrent requests
  if (state.pendingRequests.size >= MAX_CONCURRENT_REQUESTS) return;

  state.pendingRequests.add(cameraId);

  try {
    const response = await fetch(`${PROXY_BASE}/api/cctv/thumbnail/${cameraId}`);
    
    if (response.ok) {
      const blob = await response.blob();
      
      // Revoke previous object URL to prevent memory leak
      const prevUrl = state.objectUrls.get(cameraId);
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
      }
      
      const newUrl = URL.createObjectURL(blob);
      state.objectUrls.set(cameraId, newUrl);
      img.src = newUrl;
      
      // Update status indicator if we got a frame
      const item = img.closest(".cctv-item");
      const status = item?.querySelector(".cctv-status");
      if (status) {
        status.className = "cctv-status live";
        status.textContent = "LIVE";
      }
    } else {
      // Show placeholder for offline
      img.src = "";
      img.alt = "OFFLINE";
      
      const item = img.closest(".cctv-item");
      const status = item?.querySelector(".cctv-status");
      if (status) {
        status.className = "cctv-status offline";
        status.textContent = "OFFLINE";
      }
    }
  } catch (error) {
    // Network error - show offline
    img.src = "";
    img.alt = "ERROR";
  } finally {
    state.pendingRequests.delete(cameraId);
  }
}

/** Start periodic thumbnail refresh */
function startThumbnailRefresh(): void {
  clearThumbnailIntervals();

  // Don't start refresh if no cameras
  if (state.cameras.length === 0) return;

  // Staggered refresh: cycle through cameras with delays
  const refreshCycle = async () => {
    if (state.isRefreshing) return;
    state.isRefreshing = true;
    
    for (let i = 0; i < state.cameras.length; i++) {
      const camera = state.cameras[i];
      if (!camera) continue;
      
      // Load thumbnail (non-blocking)
      loadThumbnail(camera.id);
      
      // Stagger requests to avoid burst
      if (i < state.cameras.length - 1) {
        await new Promise(resolve => setTimeout(resolve, THUMBNAIL_STAGGER_MS));
      }
    }
    
    state.isRefreshing = false;
  };

  // Initial load (staggered)
  refreshCycle();

  // Periodic refresh at slower rate
  state.refreshInterval = window.setInterval(refreshCycle, THUMBNAIL_REFRESH_MS);
}

/** Clear all thumbnail refresh intervals and clean up resources */
function clearThumbnailIntervals(): void {
  if (state.refreshInterval !== null) {
    clearInterval(state.refreshInterval);
    state.refreshInterval = null;
  }

  for (const interval of state.thumbnailIntervals.values()) {
    clearInterval(interval);
  }
  state.thumbnailIntervals.clear();
  
  // Clean up object URLs to prevent memory leaks
  for (const url of state.objectUrls.values()) {
    URL.revokeObjectURL(url);
  }
  state.objectUrls.clear();
  
  // Clear pending requests
  state.pendingRequests.clear();
  state.isRefreshing = false;
}

/** Get current camera count */
export function getCameraCount(): number {
  return state.cameras.length;
}

/** Clean up panel resources */
export function destroyCCTVPanel(): void {
  clearThumbnailIntervals();
  state.container = null;
  state.cameraList = null;
  state.manager = null;
  state.cameras = [];
  state.objectUrls.clear();
  state.pendingRequests.clear();
  state.isRefreshing = false;
}

/** Export the CCTVPanel class for compatibility */
export class CCTVPanel {
  private manager: CCTVManager;
  private element: HTMLElement;

  constructor(manager: CCTVManager) {
    this.manager = manager;
    this.element = initCCTVPanel(manager);
  }

  getElement(): HTMLElement {
    return this.element;
  }

  async updateViewport(bbox: BBox): Promise<void> {
    await updateCamerasForViewport(bbox);
  }

  getCameraCount(): number {
    return getCameraCount();
  }

  destroy(): void {
    destroyCCTVPanel();
  }
}
