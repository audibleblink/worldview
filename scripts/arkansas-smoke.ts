/**
 * Arkansas CCTV Smoke Test
 * Verifies end-to-end connectivity with live API
 */

import { ArkansasSource } from "../src/proxy/cctv/sources/arkansas";

async function main() {
  console.log("Testing Arkansas CCTV source...\n");

  const source = new ArkansasSource();

  // Test 1: Fetch cameras
  console.log("1. Fetching camera list...");
  const cameras = await source.fetchCameras();
  console.log(`   Found ${cameras.length} cameras`);

  if (cameras.length === 0) {
    console.error("   FAIL: No cameras returned");
    process.exit(1);
  }

  // Sample camera
  const camera = cameras[0]!;
  console.log(`\n2. Sample camera:`);
  console.log(`   ID: ${camera.id}`);
  console.log(`   Name: ${camera.name}`);
  console.log(`   Location: ${camera.latitude}, ${camera.longitude}`);
  console.log(`   Media types: ${camera.media.map((m) => m.type).join(", ")}`);

  // Test 2: Get signed HLS URL
  console.log(`\n3. Getting signed HLS URL for ${camera.id}...`);
  try {
    const signedUrl = await source.getSignedHlsUrl(camera.id);
    console.log(`   URL: ${signedUrl.substring(0, 80)}...`);
    console.log(`   Has token: ${signedUrl.includes("token=")}`);
  } catch (error) {
    console.error(`   FAIL: ${error}`);
    process.exit(1);
  }

  // Test 3: Verify thumbnail URL works
  const imageMedia = camera.media.find((m) => m.type === "image");
  if (imageMedia) {
    console.log(`\n4. Testing thumbnail URL...`);
    const response = await fetch(imageMedia.url, { method: "HEAD" });
    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${response.headers.get("Content-Type")}`);
  }

  console.log("\nAll smoke tests passed!");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
