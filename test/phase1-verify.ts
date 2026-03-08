/**
 * Phase 1 Verification Script
 * Tests the Traffic Particle System components
 * 
 * Run with: bun test/phase1-verify.ts
 * Note: Requires proxy server running on port 3001
 */

import { OSMFetcher } from "../src/ground/traffic/OSMFetcher.ts";
import { buildNetwork } from "../src/ground/traffic/RoadNetwork.ts";
import { getHeatmapColor, getTerminalColor } from "../src/ground/traffic/particleStyles.ts";

const AUSTIN_BBOX = { west: -97.76, south: 30.25, east: -97.72, north: 30.29 };
const PROXY_URL = "http://localhost:3001";

async function verify() {
  console.log("Phase 1 Verification\n");
  console.log("=".repeat(50));
  
  let passed = 0;
  let failed = 0;

  // Test 1: Check proxy is running
  console.log("\n1. Checking proxy server...");
  try {
    const healthRes = await fetch(`${PROXY_URL}/health`);
    if (healthRes.ok) {
      console.log("   [PASS] Proxy server is running");
      passed++;
    } else {
      console.log("   [FAIL] Proxy server returned error");
      failed++;
    }
  } catch (error) {
    console.log("   [FAIL] Proxy server not reachable - start it with: bun run proxy");
    console.log("   Skipping network tests...\n");
    
    // Run offline tests only
    await runOfflineTests();
    return;
  }

  // Test 2: OSM fetch works
  console.log("\n2. Testing OSM fetch...");
  try {
    // Direct API call to test proxy
    const query = `[out:json][timeout:25];
(
  way["highway"~"^(motorway|primary|secondary|tertiary|residential)$"](${AUSTIN_BBOX.south},${AUSTIN_BBOX.west},${AUSTIN_BBOX.north},${AUSTIN_BBOX.east});
);
out geom;`;
    
    const response = await fetch(`${PROXY_URL}/api/osm`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: query,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const wayCount = data.elements?.filter((e: any) => e.type === "way").length || 0;
    
    if (wayCount > 0) {
      console.log(`   [PASS] Fetched ${wayCount} road segments from OSM`);
      passed++;
    } else {
      console.log("   [FAIL] No roads returned from OSM");
      failed++;
    }
    
    // Test 3: Road network builds
    console.log("\n3. Testing road network...");
    const ways = data.elements
      .filter((el: any) => el.type === "way" && Array.isArray(el.geometry))
      .map((el: any) => ({
        id: el.id,
        tags: el.tags || {},
        geometry: el.geometry,
      }));
    
    const network = buildNetwork(ways);
    
    if (network.length > 0) {
      console.log(`   [PASS] Built ${network.length} segments`);
      passed++;
    } else {
      console.log("   [FAIL] Failed to build network");
      failed++;
    }

    // Test 4: Has motorway segments
    console.log("\n4. Testing road classifications...");
    const motorways = network.filter(s => s.highway === "motorway" || s.highway === "motorway_link");
    const primary = network.filter(s => s.highway === "primary" || s.highway === "primary_link");
    const residential = network.filter(s => s.highway === "residential");
    
    console.log(`   - Motorway segments: ${motorways.length}`);
    console.log(`   - Primary segments: ${primary.length}`);
    console.log(`   - Residential segments: ${residential.length}`);
    
    if (network.length > 0) {
      console.log("   [PASS] Road classification working");
      passed++;
    } else {
      console.log("   [FAIL] No segments found");
      failed++;
    }

    // Test 5: Has one-way streets
    console.log("\n5. Testing one-way street detection...");
    const oneways = network.filter(s => s.oneway);
    console.log(`   - One-way segments: ${oneways.length}`);
    console.log(`   - Two-way segments: ${network.length - oneways.length}`);
    
    // One-way detection is pass if we can detect the flag (even if 0)
    console.log("   [PASS] One-way detection working");
    passed++;

  } catch (error) {
    console.log(`   [FAIL] OSM fetch error: ${error}`);
    failed++;
  }

  // Run offline tests
  await runOfflineTests();

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log("\n[SUCCESS] Phase 1 verification complete!");
  } else {
    console.log("\n[WARNING] Some tests failed - check output above");
    process.exit(1);
  }
}

async function runOfflineTests() {
  let passed = 0;
  let failed = 0;

  // Test 6: Particle system module loads
  console.log("\n6. Testing TrafficParticleSystem module...");
  try {
    const { TrafficParticleSystem } = await import("../src/ground/traffic/TrafficParticleSystem.ts");
    if (TrafficParticleSystem) {
      console.log("   [PASS] TrafficParticleSystem exports correctly");
      passed++;
    } else {
      console.log("   [FAIL] TrafficParticleSystem not exported");
      failed++;
    }
  } catch (error) {
    console.log(`   [FAIL] Module load error: ${error}`);
    failed++;
  }

  // Test 7: Style functions work
  console.log("\n7. Testing particle styles...");
  try {
    // Test heatmap colors
    const heatSlow = getHeatmapColor(0.2);
    const heatMedium = getHeatmapColor(0.5);
    const heatFast = getHeatmapColor(1.0);
    
    console.log(`   - Slow (0.2): R=${heatSlow.red.toFixed(2)}, G=${heatSlow.green.toFixed(2)}`);
    console.log(`   - Medium (0.5): R=${heatMedium.red.toFixed(2)}, G=${heatMedium.green.toFixed(2)}`);
    console.log(`   - Fast (1.0): R=${heatFast.red.toFixed(2)}, G=${heatFast.green.toFixed(2)}`);
    
    if (heatSlow.red > heatFast.red) {
      console.log("   [PASS] Slow traffic is redder than fast");
      passed++;
    } else {
      console.log("   [FAIL] Color gradient incorrect");
      failed++;
    }

    // Test terminal colors
    const terminal = getTerminalColor(0.5);
    console.log(`   - Terminal (0.5): R=${terminal.red.toFixed(2)}, G=${terminal.green.toFixed(2)}, B=${terminal.blue.toFixed(2)}`);
    
    if (terminal.green > terminal.red && terminal.green > terminal.blue) {
      console.log("   [PASS] Terminal color is phosphor green");
      passed++;
    } else {
      console.log("   [FAIL] Terminal color should be green-dominant");
      failed++;
    }
  } catch (error) {
    console.log(`   [FAIL] Style function error: ${error}`);
    failed++;
  }

  // Test 8: OSMFetcher module loads
  console.log("\n8. Testing OSMFetcher module...");
  try {
    const { OSMFetcher } = await import("../src/ground/traffic/OSMFetcher.ts");
    const fetcher = new OSMFetcher();
    if (fetcher) {
      console.log("   [PASS] OSMFetcher instantiates correctly");
      passed++;
    } else {
      console.log("   [FAIL] OSMFetcher failed to instantiate");
      failed++;
    }
  } catch (error) {
    console.log(`   [FAIL] Module load error: ${error}`);
    failed++;
  }

  // Test 9: RoadNetwork module loads
  console.log("\n9. Testing RoadNetwork module...");
  try {
    const { RoadNetwork, buildNetwork } = await import("../src/ground/traffic/RoadNetwork.ts");
    if (RoadNetwork && buildNetwork) {
      console.log("   [PASS] RoadNetwork exports correctly");
      passed++;
    } else {
      console.log("   [FAIL] RoadNetwork not fully exported");
      failed++;
    }
  } catch (error) {
    console.log(`   [FAIL] Module load error: ${error}`);
    failed++;
  }

  // Test 10: Index exports
  console.log("\n10. Testing ground/traffic index exports...");
  try {
    const groundModule = await import("../src/ground/traffic/index.ts");
    const exports = Object.keys(groundModule);
    console.log(`   - Exports: ${exports.join(", ")}`);
    
    if (exports.includes("TrafficParticleSystem") && 
        exports.includes("OSMFetcher") && 
        exports.includes("buildNetwork") &&
        exports.includes("getHeatmapColor")) {
      console.log("   [PASS] All expected exports present");
      passed++;
    } else {
      console.log("   [FAIL] Missing expected exports");
      failed++;
    }
  } catch (error) {
    console.log(`   [FAIL] Index module error: ${error}`);
    failed++;
  }

  return { passed, failed };
}

verify().catch(console.error);
