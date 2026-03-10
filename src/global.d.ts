/**
 * WorldView - Global Type Declarations
 *
 * Cesium is loaded as a UMD global from a CDN in index.html.
 * This declaration file makes TypeScript aware of the global Cesium variable.
 */

// Import all Cesium types from the module
import * as CesiumModule from "cesium";

// Re-export Cesium as a global variable
// This matches the UMD pattern where `window.Cesium` is the namespace
declare global {
  // Cesium UMD global - all exports from cesium module are available here
  const Cesium: typeof CesiumModule & typeof CesiumModule.default;

  // Also declare the Cesium namespace for type usage in declarations
  namespace Cesium {
    // Re-export all types from cesium module
    export type Viewer = CesiumModule.Viewer;
    export type Scene = CesiumModule.Scene;
    export type Camera = CesiumModule.Camera;
    export type Entity = CesiumModule.Entity;
    export type EntityCollection = CesiumModule.EntityCollection;
    export type DataSource = CesiumModule.DataSource;
    export type DataSourceCollection = CesiumModule.DataSourceCollection;
    export type Cartesian2 = CesiumModule.Cartesian2;
    export type Cartesian3 = CesiumModule.Cartesian3;
    export type Cartographic = CesiumModule.Cartographic;
    export type Color = CesiumModule.Color;
    export type Matrix4 = CesiumModule.Matrix4;
    export type Quaternion = CesiumModule.Quaternion;
    export type HeadingPitchRoll = CesiumModule.HeadingPitchRoll;
    export type HeadingPitchRange = CesiumModule.HeadingPitchRange;
    export type Rectangle = CesiumModule.Rectangle;
    export type BoundingSphere = CesiumModule.BoundingSphere;
    export type BillboardCollection = CesiumModule.BillboardCollection;
    export type Billboard = CesiumModule.Billboard;
    export type BillboardGraphics = CesiumModule.BillboardGraphics;
    export type PointPrimitiveCollection = CesiumModule.PointPrimitiveCollection;
    export type PointPrimitive = CesiumModule.PointPrimitive;
    export type PointGraphics = CesiumModule.PointGraphics;
    export type LabelCollection = CesiumModule.LabelCollection;
    export type Label = CesiumModule.Label;
    export type LabelGraphics = CesiumModule.LabelGraphics;
    export type PolylineCollection = CesiumModule.PolylineCollection;
    export type Polyline = CesiumModule.Polyline;
    export type PolylineGraphics = CesiumModule.PolylineGraphics;
    export type PathGraphics = CesiumModule.PathGraphics;
    export type ModelGraphics = CesiumModule.ModelGraphics;
    export type ScreenSpaceEventHandler = CesiumModule.ScreenSpaceEventHandler;
    export type PostProcessStage = CesiumModule.PostProcessStage;
    export type PostProcessStageCollection = CesiumModule.PostProcessStageCollection;
    export type ConstantPositionProperty = CesiumModule.ConstantPositionProperty;
    export type ConstantProperty = CesiumModule.ConstantProperty;
    export type ColorMaterialProperty = CesiumModule.ColorMaterialProperty;
    export type SampledPositionProperty = CesiumModule.SampledPositionProperty;
    export type CallbackProperty = CesiumModule.CallbackProperty;
    export type JulianDate = CesiumModule.JulianDate;
    export type Event = CesiumModule.Event;
    export type Cesium3DTileset = CesiumModule.Cesium3DTileset;
    export type PrimitiveCollection = CesiumModule.PrimitiveCollection;
    export type Primitive = CesiumModule.Primitive;
    export type GroundPrimitive = CesiumModule.GroundPrimitive;
    export type Model = CesiumModule.Model;
    export type NearFarScalar = CesiumModule.NearFarScalar;
    export type DistanceDisplayCondition = CesiumModule.DistanceDisplayCondition;
    export type HorizontalOrigin = CesiumModule.HorizontalOrigin;
    export type VerticalOrigin = CesiumModule.VerticalOrigin;
    export type LabelStyle = CesiumModule.LabelStyle;
    export type ArcType = CesiumModule.ArcType;
    export type ScreenSpaceEventType = CesiumModule.ScreenSpaceEventType;
    export type KeyboardEventModifier = CesiumModule.KeyboardEventModifier;
    export type Transforms = typeof CesiumModule.Transforms;
    export type Math = typeof CesiumModule.Math;
    export type Globe = CesiumModule.Globe;
    export type Ellipsoid = CesiumModule.Ellipsoid;
    export type ImageryLayer = CesiumModule.ImageryLayer;
    export type TerrainProvider = CesiumModule.TerrainProvider;
  }
}

export {};
