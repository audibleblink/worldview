/**
 * PNG Encoding Utilities
 * Simple PNG encoder for generating fallback frames
 */

/** Draw text onto pixel buffer (simple bitmap font) */
export function drawText(
  pixels: Uint8Array,
  width: number,
  height: number,
  text: string,
  x: number,
  y: number,
  color = [0, 255, 136]
): void {
  const charWidth = 6;
  const charHeight = 8;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const cx = x + i * charWidth;

    if (cx >= width - charWidth) break;

    const charCode = char?.charCodeAt(0) ?? 0;

    for (let py = 0; py < charHeight; py++) {
      for (let px = 0; px < charWidth - 1; px++) {
        const pixelX = cx + px;
        const pixelY = y + py;

        if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
          const pattern = (charCode * 17 + px + py * 3) % 8;
          if (pattern < 5 && char !== " ") {
            const idx = (pixelY * width + pixelX) * 4;
            pixels[idx] = color[0] ?? 0;
            pixels[idx + 1] = color[1] ?? 255;
            pixels[idx + 2] = color[2] ?? 136;
            pixels[idx + 3] = 255;
          }
        }
      }
    }
  }
}

/** Draw border on pixel buffer */
export function drawBorder(
  pixels: Uint8Array,
  width: number,
  height: number,
  color = [0, 255, 136]
): void {
  const borderWidth = 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < borderWidth || x >= width - borderWidth || y < borderWidth || y >= height - borderWidth) {
        const idx = (y * width + x) * 4;
        pixels[idx] = color[0] ?? 0;
        pixels[idx + 1] = color[1] ?? 255;
        pixels[idx + 2] = color[2] ?? 136;
        pixels[idx + 3] = 255;
      }
    }
  }
}

/** Encode RGBA pixels as PNG */
export function encodePNG(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  const ihdr = createIHDRChunk(width, height);
  const idat = createIDATChunk(pixels, width, height);
  const iend = createIENDChunk();

  const result = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length);
  let offset = 0;

  result.set(signature, offset);
  offset += signature.length;

  result.set(ihdr, offset);
  offset += ihdr.length;

  result.set(idat, offset);
  offset += idat.length;

  result.set(iend, offset);

  return result;
}

function createIHDRChunk(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);

  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  data[8] = 8;  // Bit depth
  data[9] = 6;  // Color type (RGBA)
  data[10] = 0; // Compression method
  data[11] = 0; // Filter method
  data[12] = 0; // Interlace method

  return createChunk("IHDR", data);
}

function createIDATChunk(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const rowSize = width * 4 + 1;
  const filteredData = new Uint8Array(rowSize * height);

  for (let y = 0; y < height; y++) {
    filteredData[y * rowSize] = 0; // Filter type: None
    filteredData.set(
      pixels.subarray(y * width * 4, (y + 1) * width * 4),
      y * rowSize + 1
    );
  }

  const compressed = Bun.deflateSync(filteredData);
  return createChunk("IDAT", compressed);
}

function createIENDChunk(): Uint8Array {
  return createChunk("IEND", new Uint8Array(0));
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, data.length, false);

  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);

  chunk.set(data, 8);

  const crc = crc32(chunk.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crc, false);

  return chunk;
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] ?? 0;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}
