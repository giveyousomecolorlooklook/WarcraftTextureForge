
import { ChannelFormulas } from '../types';

export class ImageProcessor {
  /**
   * Compiles and applies channel formulas to ImageData
   */
  static applyFormulas(originalData: ImageData, formulas: ChannelFormulas): { data: ImageData, error?: string } {
    const newImageData = new ImageData(
      new Uint8ClampedArray(originalData.data),
      originalData.width,
      originalData.height
    );
    
    const data = newImageData.data;
    const len = data.length;

    try {
      // Pre-compile the formula for performance
      // We use a single function that returns an array to minimize overhead
      const compiledShader = new Function('r', 'g', 'b', 'a', 'Math', `
        try {
          const nr = ${formulas.r || 'r'};
          const ng = ${formulas.g || 'g'};
          const nb = ${formulas.b || 'b'};
          const na = ${formulas.a || 'a'};
          return [nr, ng, nb, na];
        } catch(e) {
          return [r, g, b, a];
        }
      `);

      for (let i = 0; i < len; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        const [nr, ng, nb, na] = compiledShader(r, g, b, a, Math);

        // Clamping and assignment
        data[i] = Math.min(255, Math.max(0, nr));
        data[i + 1] = Math.min(255, Math.max(0, ng));
        data[i + 2] = Math.min(255, Math.max(0, nb));
        data[i + 3] = Math.min(255, Math.max(0, na));
      }

      return { data: newImageData };
    } catch (err: any) {
      return { data: newImageData, error: err.message };
    }
  }
}
