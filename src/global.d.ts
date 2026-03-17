/**
 * Cesium UMD global type declarations.
 * Cesium is loaded via <script> tag in index.html, making it a global.
 * This file bridges the cesium module types to the global `Cesium` variable.
 */

import type * as CesiumModule from "cesium";

declare global {
  const Cesium: typeof CesiumModule & typeof CesiumModule.default;

  /**
   * Re-export Cesium types used as type annotations throughout the codebase.
   * Only include types that are actually referenced — keep in sync with usage.
   */
  namespace Cesium {
    // Core geometry & math
    export type Cartesian2 = CesiumModule.Cartesian2;
    export type Cartesian3 = CesiumModule.Cartesian3;
    export type Cartographic = CesiumModule.Cartographic;
    export type Color = CesiumModule.Color;
    export type Quaternion = CesiumModule.Quaternion;
    export type HeadingPitchRange = CesiumModule.HeadingPitchRange;
    export type JulianDate = CesiumModule.JulianDate;
    export type Math = typeof CesiumModule.Math;

    // Viewer & scene
    export type Viewer = CesiumModule.Viewer;
    export type Scene = CesiumModule.Scene;
    export type Entity = CesiumModule.Entity;

    // Collections & primitives
    export type BillboardCollection = CesiumModule.BillboardCollection;
    export type Billboard = CesiumModule.Billboard;
    export type BillboardGraphics = CesiumModule.BillboardGraphics;
    export type PointPrimitiveCollection = CesiumModule.PointPrimitiveCollection;
    export type PointPrimitive = CesiumModule.PointPrimitive;
    export type LabelCollection = CesiumModule.LabelCollection;
    export type Label = CesiumModule.Label;
    export type LabelGraphics = CesiumModule.LabelGraphics;
    export type ModelGraphics = CesiumModule.ModelGraphics;
    export type PrimitiveCollection = CesiumModule.PrimitiveCollection;
    export type Primitive = CesiumModule.Primitive;

    // Interaction
    export type ScreenSpaceEventHandler = CesiumModule.ScreenSpaceEventHandler;

    // Properties
    export type ConstantPositionProperty = CesiumModule.ConstantPositionProperty;
    export type ConstantProperty = CesiumModule.ConstantProperty;

    // Display
    export type HorizontalOrigin = CesiumModule.HorizontalOrigin;
    export type VerticalOrigin = CesiumModule.VerticalOrigin;
    export type LabelStyle = CesiumModule.LabelStyle;
    export type ArcType = CesiumModule.ArcType;
    export type NearFarScalar = CesiumModule.NearFarScalar;
    export type DistanceDisplayCondition = CesiumModule.DistanceDisplayCondition;
  }
}

export {};
