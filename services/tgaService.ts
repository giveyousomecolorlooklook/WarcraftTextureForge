
export class TGAConverter {
  /**
   * Decodes TGA data to ImageData.
   * Supports Uncompressed TrueColor (2) and RLE TrueColor (10).
   */
  static decode(buffer: ArrayBuffer): ImageData {
    const view = new DataView(buffer);
    const idLength = view.getUint8(0);
    const imageType = view.getUint8(2);
    const width = view.getUint16(12, true);
    const height = view.getUint16(14, true);
    const pixelDepth = view.getUint8(16);
    const descriptor = view.getUint8(17);

    if (imageType !== 2 && imageType !== 10) {
      throw new Error('仅支持未压缩或 RLE 压缩的真彩色 TGA 文件。');
    }

    const isBottomToTop = !(descriptor & 0x20);
    const dataStart = 18 + idLength;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const rawData = new Uint8Array(buffer, dataStart);

    let offset = 0;
    let pixelIndex = 0;
    const totalPixels = width * height;

    while (pixelIndex < totalPixels) {
      if (imageType === 10) {
        // RLE Packet
        const packetHeader = rawData[offset++];
        const count = (packetHeader & 0x7F) + 1;
        const isRLE = (packetHeader & 0x80) !== 0;

        if (isRLE) {
          const b = rawData[offset++];
          const g = rawData[offset++];
          const r = rawData[offset++];
          const a = (pixelDepth === 32) ? rawData[offset++] : 255;
          for (let i = 0; i < count; i++) {
            this.setPixel(pixels, pixelIndex++, width, height, r, g, b, a, isBottomToTop);
          }
        } else {
          for (let i = 0; i < count; i++) {
            const b = rawData[offset++];
            const g = rawData[offset++];
            const r = rawData[offset++];
            const a = (pixelDepth === 32) ? rawData[offset++] : 255;
            this.setPixel(pixels, pixelIndex++, width, height, r, g, b, a, isBottomToTop);
          }
        }
      } else {
        // Raw Uncompressed
        const b = rawData[offset++];
        const g = rawData[offset++];
        const r = rawData[offset++];
        const a = (pixelDepth === 32) ? rawData[offset++] : 255;
        this.setPixel(pixels, pixelIndex++, width, height, r, g, b, a, isBottomToTop);
      }
    }

    return new ImageData(pixels, width, height);
  }

  private static setPixel(
    pixels: Uint8ClampedArray, 
    index: number, 
    width: number, 
    height: number, 
    r: number, g: number, b: number, a: number,
    isBottomToTop: boolean
  ) {
    const x = index % width;
    const y = Math.floor(index / width);
    const targetY = isBottomToTop ? (height - 1 - y) : y;
    const pixelIdx = (targetY * width + x) * 4;
    pixels[pixelIdx] = r;
    pixels[pixelIdx + 1] = g;
    pixels[pixelIdx + 2] = b;
    pixels[pixelIdx + 3] = a;
  }

  /**
   * Encodes ImageData to a TGA file (Uncompressed 32-bit).
   */
  static encode(imageData: ImageData): Blob {
    const { width, height, data } = imageData;
    const headerSize = 18;
    const pixelDataSize = width * height * 4;
    const buffer = new ArrayBuffer(headerSize + pixelDataSize);
    const view = new DataView(buffer);

    view.setUint8(2, 2); // Uncompressed TrueColor
    view.setUint16(12, width, true);
    view.setUint16(14, height, true);
    view.setUint8(16, 32); 
    view.setUint8(17, 8); // Descriptor: 8-bit alpha, bottom-left origin (standard)

    const output = new Uint8Array(buffer);
    let offset = headerSize;
    
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        output[offset++] = data[idx + 2]; // B
        output[offset++] = data[idx + 1]; // G
        output[offset++] = data[idx + 0]; // R
        output[offset++] = data[idx + 3]; // A
      }
    }

    return new Blob([buffer], { type: 'image/x-tga' });
  }
}
