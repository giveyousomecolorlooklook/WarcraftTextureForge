
/**
 * BLP (Binary Library Package) Parser & Encoder
 * 针对魔兽争霸3优化：处理 BLP1 特有的 BGR 通道反转问题。
 */

export class BLPConverter {
  /**
   * 将 R 和 B 通道互换
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
    
    const offset = view.getUint32(28, true);
    const size = view.getUint32(92, true);

    if (type === 0) {
      // JPEG 类型 BLP
      const jpegHeaderSize = view.getUint32(156, true);
      const headerData = new Uint8Array(buffer, 160, jpegHeaderSize);
      const imageDataPart = new Uint8Array(buffer, offset, size);
      
      const fullJpeg = new Uint8Array(headerData.length + imageDataPart.length);
      fullJpeg.set(headerData);
      fullJpeg.set(imageDataPart, headerData.length);
      
      // 浏览器解压 JPEG 得到的是标准 RGB
      const imageData = await this.imageToImageData(fullJpeg, 'image/jpeg');
      
      // 魔兽 BLP1 的 JPEG 实际存储为 BGR，所以解码后需要反转回 RGB
      if (magic === 'BLP1') {
        this.swapRBChannels(imageData);
      }
      
      return imageData;
    } else {
      throw new Error('目前仅支持 JPEG 压缩类型的 BLP1/2。');
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
  static async encode(canvas: HTMLCanvasElement, quality: number = 0.9): Promise<Blob> {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法获取 Canvas 上下文');

    // 1. 获取当前画面的像素数据
    const imageData = ctx.getImageData(0, 0, width, height);

    // 2. 将 RGB 转换为 BGR（因为 BLP1 引擎期待 BGR 编码的 JPEG）
    this.swapRBChannels(imageData);

    // 3. 将转换后的数据画到临时 Canvas 上准备导出
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx?.putImageData(imageData, 0, 0);

    // 4. 生成 JPEG 数据流
    const jpegBlob = await new Promise<Blob | null>(res => tempCanvas.toBlob(b => res(b), 'image/jpeg', quality));
    if (!jpegBlob) throw new Error('生成 JPEG 失败');
    const jpegBuffer = await jpegBlob.arrayBuffer();
    const jpegData = new Uint8Array(jpegBuffer);

    // 5. 构建 BLP1 文件头 (164 bytes)
    const header = new ArrayBuffer(164);
    const view = new DataView(header);
    
    view.setUint8(0, 'B'.charCodeAt(0));
    view.setUint8(1, 'L'.charCodeAt(0));
    view.setUint8(2, 'P'.charCodeAt(0));
    view.setUint8(3, '1'.charCodeAt(0));
    
    view.setUint32(4, 0, true); // Type 0 = JPEG
    view.setUint32(8, 0, true); // Flags
    view.setUint32(12, width, true);
    view.setUint32(16, height, true);
    view.setUint32(20, 5, true); // Extra
    view.setUint32(24, 1, true); // HasMips (1)
    
    const offset = 164;
    view.setUint32(28, offset, true);
    view.setUint32(92, jpegData.length, true);
    view.setUint32(156, 0, true); // JpegHeaderSize
    
    const finalBuffer = new Uint8Array(header.byteLength + jpegData.byteLength);
    finalBuffer.set(new Uint8Array(header));
    finalBuffer.set(jpegData, header.byteLength);
    
    return new Blob([finalBuffer], { type: 'application/octet-stream' });
  }
}
