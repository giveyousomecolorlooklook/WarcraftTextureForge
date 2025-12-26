
export enum TextureFormat {
  BLP = 'BLP',
  TGA = 'TGA',
  PNG = 'PNG'
}

export interface ChannelFormulas {
  r: string;
  g: string;
  b: string;
  a: string;
}

export interface ActiveTexture {
  file: File;
  name: string;
  format: TextureFormat;
  originalUrl: string;
  processedUrl?: string;
  width: number;
  height: number;
  imageData: ImageData; 
  processedImageData?: ImageData;
  formulas: ChannelFormulas;
  insight?: string;
}
