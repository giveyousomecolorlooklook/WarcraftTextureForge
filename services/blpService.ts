
/**
 * BLP (Binary Library Package) Parser & Encoder
 * 针对魔兽争霸3优化：修复了 BLP1 文件头偏移和 Mipmap 数组结构。
 * 新增：在编解码过程中自动处理 RB 通道交换以适应魔兽引擎的 BGR 偏好。
 */

export class BLPConverter {
  /**
   * 将 R 和 B 通道互换
   * WC3 BLP 内部通常使用 BGR 顺序
   */
  private static swapRBChannels(imageData: ImageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      data[i] = data[i + 2];   // R = B
      data[i + 2] = r;         // B = old R
    }
  }

  /**
   * 解码 BLP
   */
  static async decode(buffer: ArrayBuffer): Promise<ImageData> {
    const view = new DataView(buffer);
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    
    if (magic !== 'BLP1' && magic !== 'BLP2') {
      throw new Error('无效的 BLP 文件格式');
    }

    const type = view.getUint32(4, true); // 0: JPEG, 1: Paletted/Direct
    const width = view.getUint32(12, true);
    const height = view.getUint32(16, true);
    
    // Mipmap 偏移和大小在固定位置
    const offset = view.getUint32(28, true);
    const size = view.getUint32(92, true);

    if (type === 0) {
      // JPEG 类型 BLP
      const jpegHeaderSize = view.getUint32(156, true);
      let fullJpeg: Uint8Array;

      if (jpegHeaderSize > 0) {
        const headerData = new Uint8Array(buffer, 160, jpegHeaderSize);
        const imageDataPart = new Uint8Array(buffer, offset, size);
        fullJpeg = new Uint8Array(headerData.length + imageDataPart.length);
        fullJpeg.set(headerData);
        fullJpeg.set(imageDataPart, headerData.length);
      } else {
        // 直接在 offset 处包含完整的 JPEG
        fullJpeg = new Uint8Array(buffer, offset, size);
      }
      
      const imageData = await this.imageToImageData(fullJpeg, 'image/jpeg');
      
      // 关键修正：魔兽 BLP1 JPEG 通常需要 RB 交换才能正确显示
      this.swapRBChannels(imageData);
      
      return imageData;
    } else {
      throw new Error('目前仅支持 JPEG 压缩类型的 BLP。Direct/Paletted 格式正在开发中。');
    }
  }

  private static async imageToImageData(data: Uint8Array, mimeType: string): Promise<ImageData> {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('无法创建 Canvas');
        ctx.drawImage(img, 0, 0);
        const idata = ctx.getImageData(0, 0, img.width, img.height);
        URL.revokeObjectURL(url);
        resolve(idata);
      };
      img.onerror = () => reject('图片加载失败');
      img.src = url;
    });
  }

  /**
   * 编码为 BLP1 (JPEG 压缩)
   */
  static async encode(canvas: HTMLCanvasElement, quality: number = 0.85): Promise<Blob> {
    const width = canvas.width;
    const height = canvas.height;

    // 编码前执行 RB 交换，使导出的 JPEG 数据符合 WC3 引擎预期
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) throw new Error('无法创建临时渲染上下文');
    
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法获取源上下文');
    const idata = ctx.getImageData(0, 0, width, height);
    
    this.swapRBChannels(idata);
    tempCtx.putImageData(idata, 0, 0);

    // 生成标准的 JPEG 数据
    const jpegBlob = await new Promise<Blob | null>(res => tempCanvas.toBlob(b => res(b), 'image/jpeg', quality));
    if (!jpegBlob) throw new Error('生成 JPEG 失败');
    const jpegBuffer = await jpegBlob.arrayBuffer();
    const jpegData = new Uint8Array(jpegBuffer);

    const headerSize = 156;
    const header = new ArrayBuffer(headerSize + 4); 
    const view = new DataView(header);
    
    view.setUint8(0, 'B'.charCodeAt(0));
    view.setUint8(1, 'L'.charCodeAt(0));
    view.setUint8(2, 'P'.charCodeAt(0));
    view.setUint8(3, '1'.charCodeAt(0));
    
    view.setUint32(4, 0, true);   // Type: JPEG
    view.setUint32(8, 8, true);   // AlphaBits
    view.setUint32(12, width, true);
    view.setUint32(16, height, true);
    view.setUint32(20, 5, true);  // Subtype (JPEG 通常设为 5)
    view.setUint32(24, 1, true);  // HasMipmaps: 1

    const firstMipOffset = 160; 
    view.setUint32(28, firstMipOffset, true); 
    for (let i = 1; i < 16; i++) view.setUint32(28 + i * 4, 0, true);

    view.setUint32(92, jpegData.length, true);
    for (let i = 1; i < 16; i++) view.setUint32(92 + i * 4, 0, true);

    view.setUint32(156, 0, true);
    
    const finalBuffer = new Uint8Array(header.byteLength + jpegData.byteLength);
    finalBuffer.set(new Uint8Array(header));
    finalBuffer.set(jpegData, header.byteLength);
    
    return new Blob([finalBuffer], { type: 'application/octet-stream' });
  }
}
