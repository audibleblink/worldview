/**
 * Phase 2 Verification - CCTV Integration
 * Run with: bun test/phase2-verify.ts
 */

const PROXY_URL = "http://localhost:3001";

async function verify() {
  console.log("Phase 2 Verification: CCTV Integration\n");
  console.log("=".repeat(50));

  let passed = 0;
  let failed = 0;

  // Test 1: Cameras endpoint exists and returns data
  console.log("\n1. Testing CCTV cameras endpoint...");
  try {
    const camerasRes = await fetch(`${PROXY_URL}/api/cctv/cameras`);
    if (!camerasRes.ok) {
      throw new Error(`HTTP ${camerasRes.status}`);
    }
    const cameras = await camerasRes.json();
    console.log(`   OK: Cameras endpoint returns ${cameras.length} cameras`);
    passed++;

    // Test 1b: Cameras have required fields
    const sample = cameras[0];
    if (sample.id && sample.name && sample.latitude && sample.longitude && sample.status) {
      console.log(`   OK: Camera data has required fields`);
      passed++;
    } else {
      console.log(`   FAIL: Camera missing required fields`);
      failed++;
    }
  } catch (error) {
    console.log(`   FAIL: Cameras endpoint error: ${error}`);
    failed++;
  }

  // Test 2: Cameras bbox filtering works
  console.log("\n2. Testing bbox filtering...");
  try {
    const bbox = "-97.80,30.20,-97.70,30.30"; // Austin area
    const filteredRes = await fetch(`${PROXY_URL}/api/cctv/cameras?bbox=${bbox}`);
    const filtered = await filteredRes.json();
    console.log(`   OK: Filtered cameras in bbox: ${filtered.length}`);
    
    // Verify all cameras are within bbox
    const [west, south, east, north] = bbox.split(",").map(Number);
    const allInBbox = filtered.every((c: any) => 
      c.longitude >= west && c.longitude <= east &&
      c.latitude >= south && c.latitude <= north
    );
    
    if (allInBbox) {
      console.log(`   OK: All cameras within bbox bounds`);
      passed++;
    } else {
      console.log(`   FAIL: Some cameras outside bbox`);
      failed++;
    }
  } catch (error) {
    console.log(`   FAIL: Bbox filtering error: ${error}`);
    failed++;
  }

  // Test 3: Thumbnail endpoint returns image
  console.log("\n3. Testing thumbnail endpoint...");
  try {
    const thumbRes = await fetch(`${PROXY_URL}/api/cctv/thumbnail/atx-congress-6th`);
    if (thumbRes.ok) {
      const contentType = thumbRes.headers.get("content-type");
      if (contentType?.includes("image")) {
        console.log(`   OK: Thumbnail returns ${contentType}`);
        const blob = await thumbRes.blob();
        console.log(`   OK: Thumbnail size: ${blob.size} bytes`);
        passed++;
      } else {
        console.log(`   FAIL: Unexpected content type: ${contentType}`);
        failed++;
      }
    } else {
      console.log(`   FAIL: Thumbnail HTTP ${thumbRes.status}`);
      failed++;
    }
  } catch (error) {
    console.log(`   FAIL: Thumbnail error: ${error}`);
    failed++;
  }

  // Test 4: Invalid camera returns 404
  console.log("\n4. Testing 404 for invalid camera...");
  try {
    const badRes = await fetch(`${PROXY_URL}/api/cctv/thumbnail/nonexistent-camera`);
    if (badRes.status === 404) {
      console.log(`   OK: Invalid camera returns 404`);
      passed++;
    } else {
      console.log(`   FAIL: Expected 404, got ${badRes.status}`);
      failed++;
    }
  } catch (error) {
    console.log(`   FAIL: 404 test error: ${error}`);
    failed++;
  }

  // Test 5: CCTVManager module loads
  console.log("\n5. Testing CCTVManager module...");
  try {
    const { CCTVManager } = await import("../src/ground/cctv/CCTVManager.ts");
    if (CCTVManager) {
      console.log("   OK: CCTVManager exports correctly");
      
      const manager = new CCTVManager();
      if (typeof manager.fetchCamerasInViewport === "function" &&
          typeof manager.projectCamera === "function" &&
          typeof manager.removeProjection === "function" &&
          typeof manager.getActiveBillboards === "function") {
        console.log("   OK: CCTVManager has required methods");
        passed++;
      } else {
        console.log("   FAIL: CCTVManager missing methods");
        failed++;
      }
    } else {
      console.log("   FAIL: CCTVManager not exported");
      failed++;
    }
  } catch (error) {
    console.log(`   FAIL: CCTVManager import error: ${error}`);
    failed++;
  }

  // Test 6: CCTVPanel module loads
  console.log("\n6. Testing CCTVPanel module...");
  try {
    const { CCTVPanel } = await import("../src/ground/cctv/CCTVPanel.ts");
    if (CCTVPanel) {
      console.log("   OK: CCTVPanel exports correctly");
      passed++;
    } else {
      console.log("   FAIL: CCTVPanel not exported");
      failed++;
    }
  } catch (error) {
    console.log(`   FAIL: CCTVPanel import error: ${error}`);
    failed++;
  }

  // Test 7: Types module loads
  console.log("\n7. Testing types module...");
  try {
    const types = await import("../src/ground/cctv/types.ts");
    if (types.DEFAULT_CCTV_CONFIG) {
      console.log("   OK: Types module exports correctly");
      console.log(`   Config: maxBillboards=${types.DEFAULT_CCTV_CONFIG.maxBillboards}, ` +
                  `altitude=${types.DEFAULT_CCTV_CONFIG.billboardAltitude}m`);
      passed++;
    } else {
      console.log("   FAIL: Types missing exports");
      failed++;
    }
  } catch (error) {
    console.log(`   FAIL: Types import error: ${error}`);
    failed++;
  }

  // Test 8: CCTVBillboard utilities
  console.log("\n8. Testing CCTVBillboard utilities...");
  try {
    const billboard = await import("../src/ground/cctv/CCTVBillboard.ts");
    const requiredFunctions = [
      "createBillboardCanvas",
      "drawBorder",
      "drawLoadingState",
      "drawOfflineState",
      "drawVideoFrame",
    ];
    
    const allExist = requiredFunctions.every(fn => typeof billboard[fn] === "function");
    if (allExist) {
      console.log("   OK: CCTVBillboard utilities exported");
      passed++;
    } else {
      console.log("   FAIL: Missing CCTVBillboard utilities");
      failed++;
    }
  } catch (error) {
    console.log(`   FAIL: CCTVBillboard import error: ${error}`);
    failed++;
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log("\n  Phase 2 verification PASSED");
  } else {
    console.log("\n  Phase 2 verification FAILED - some tests did not pass");
    process.exit(1);
  }

  console.log("\n Manual checks required:");
  console.log("   1. Open app in browser");
  console.log("   2. Verify CCTV panel appears in left panel");
  console.log("   3. Pan to Austin area - cameras should appear");
  console.log("   4. Click camera to project billboard into 3D scene");
  console.log("   5. Verify billboard appears at camera location");
  console.log("   6. Verify thumbnails refresh (1fps)");
}

verify().catch(console.error);
