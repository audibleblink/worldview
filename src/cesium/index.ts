/**
 * WorldView - Cesium Bindings
 *
 * Exports all Cesium-related SolidJS bindings.
 */

// Provider and context
export { CesiumProvider, CesiumContext } from "./CesiumProvider";
export type { CesiumProviderProps, CesiumViewerOptions, CesiumContextValue } from "./CesiumProvider";

// Core hook
export { useCesium, useViewer } from "./useCesium";

// Hooks
export { usePreRender } from "./hooks/usePreRender";
export type { PreRenderCallback } from "./hooks/usePreRender";

export { useCamera } from "./hooks/useCamera";
export type { CameraState, CameraViewOptions, UseCameraReturn, BBox } from "./hooks/useCamera";

export { useSelection } from "./hooks/useSelection";
export type { UseSelectionReturn } from "./hooks/useSelection";

export { useFollowMode } from "./hooks/useFollowMode";
export type { FollowOptions, UseFollowModeReturn } from "./hooks/useFollowMode";

// Reactive bindings
export { createEntity } from "./createEntity";
export type { EntityOptions, CreateEntityReturn } from "./createEntity";

export { createBillboardCollection } from "./createBillboardCollection";
export type {
  BillboardOptions,
  CreateBillboardCollectionOptions,
  CreateBillboardCollectionReturn,
} from "./createBillboardCollection";

export { createPointCollection } from "./createPointCollection";
export type {
  PointOptions,
  CreatePointCollectionOptions,
  CreatePointCollectionReturn,
} from "./createPointCollection";

export { createPrimitive, createReactivePrimitive } from "./createPrimitive";
export type { CreatePrimitiveOptions, CreatePrimitiveReturn } from "./createPrimitive";
