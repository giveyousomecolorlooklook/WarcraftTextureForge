
import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Download, 
  RefreshCw,
  Image as ImageIcon,
  Zap,
  Box,
  FileDown,
  Play,
  Code2,
  BookOpen,
  Info,
  AlertCircle
} from 'lucide-react';
import { TextureFormat, ChannelFormulas, ActiveTexture } from './types';
import { BLPConverter } from './services/blpService';
import { TGAConverter } from './services/tgaService';
import { ImageProcessor } from './services/imageProcessor';

const PRESETS = [
  { name: '默认 (无改动)', formulas: { r: 'r', g: 'g', b: 'b', a: 'a' } },
  { name: '手动 BGR 修正 (如仍有问题)', formulas: { r: 'b', g: 'g', b: 'r', a: 'a' } },
  { name: '灰度化', formulas: { r: '0.3*r + 0.6*g + 0.1*b', g: '0.3*r + 0.6*g + 0.1*b', b: '0.3*r + 0.6*g + 0.1*b', a: 'a' } },
  { name: '高对比度 (Hard)', formulas: { r: '(r-128)*1.5+128', g: '(g-128)*1.5+128', b: '(g-128)*1.5+128', a: 'a' } },
  { name: '红色通道过滤', formulas: { r: 'r > 200 ? 255 : 0', g: 'g', b: 'b', a: 'a' } },
  { name: '反色', formulas: { r: '255-r', g: '255-g', b: '255-b', a: 'a' } },
  { name: 'Alpha 增强', formulas: { r: 'r', g: 'g', b: 'b', a: 'Math.min(255, a*1.2)' } },
];

const App: React.FC = () => {
  const [activeTexture, setActiveTexture] = useState<ActiveTexture | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formulas, setFormulas] = useState<ChannelFormulas>(PRESETS[0].formulas);
  const [needsReforge, setNeedsReforge] = useState(false);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTexture) setNeedsReforge(true);
  }, [formulas]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const ext = file.name.split('.').pop()?.toUpperCase();
      let detectedFormat = TextureFormat.PNG;
      if (ext === 'BLP') detectedFormat = TextureFormat.BLP;
      else if (ext === 'TGA') detectedFormat = TextureFormat.TGA;

      const buffer = await file.arrayBuffer();
      let imageData: ImageData;

      if (detectedFormat === TextureFormat.BLP) {
        imageData = await BLPConverter.decode(buffer);
      } else if (detectedFormat === TextureFormat.TGA) {
        imageData = TGAConverter.decode(buffer);
      } else {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.src = url;
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Context error');
        ctx.drawImage(img, 0, 0);
        imageData = ctx.getImageData(0, 0, img.width, img.height);
        URL.revokeObjectURL(url);
      }

      const previewCanvas = document.createElement('canvas');
      previewCanvas.width = imageData.width;
      previewCanvas.height = imageData.height;
      const ctx = previewCanvas.getContext('2d');
      if (ctx) ctx.putImageData(imageData, 0, 0);
      const originalUrl = previewCanvas.toDataURL('image/png');

      const result = ImageProcessor.applyFormulas(imageData, formulas);
      if (ctx) ctx.putImageData(result.data, 0, 0);
      const processedUrl = previewCanvas.toDataURL('image/png');

      setActiveTexture({
        file, name: file.name, format: detectedFormat, originalUrl, processedUrl,
        width: imageData.width, height: imageData.height, imageData,
        processedImageData: result.data, formulas: { ...formulas }
      });

      setNeedsReforge(false);
      setIsProcessing(false);
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      alert('文件解码失败');
    }
  };

  const manualReforge = () => {
    if (!activeTexture) return;
    setIsProcessing(true);
    setFormulaError(null);
    
    const result = ImageProcessor.applyFormulas(activeTexture.imageData, formulas);
    
    if (result.error) {
      setFormulaError(result.error);
      setIsProcessing(false);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = activeTexture.width;
    canvas.height = activeTexture.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(result.data, 0, 0);
      const processedUrl = canvas.toDataURL('image/png');
      setActiveTexture(prev => prev ? { ...prev, processedImageData: result.data, processedUrl, formulas: { ...formulas } } : null);
    }
    setNeedsReforge(false);
    setIsProcessing(false);
  };

  const applyPreset = (presetFormulas: ChannelFormulas) => {
    setFormulas({ ...presetFormulas });
  };

  const downloadAs = async (format: TextureFormat) => {
    if (!activeTexture || !activeTexture.processedImageData) return;
    const data = activeTexture.processedImageData;
    const canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext('2d')?.putImageData(data, 0, 0);

    let blob: Blob;
    let fileName = activeTexture.name.split('.')[0];
    if (format === TextureFormat.PNG) {
      blob = await new Promise(res => canvas.toBlob(b => res(b!), 'image/png'));
      fileName += '.png';
    } else if (format === TextureFormat.TGA) {
      blob = TGAConverter.encode(data);
      fileName += '.tga';
    } else {
      blob = await BLPConverter.encode(canvas);
      fileName += '.blp';
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-[1400px] mx-auto flex flex-col gap-6">
      <header className="flex justify-between items-center bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600 rounded-xl shadow-lg">
            <Box className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">WC3 ALCHEMY ENGINE</h1>
            <p className="text-slate-500 text-[10px] font-bold tracking-widest uppercase">魔兽纹理通道识别与重塑算法</p>
          </div>
        </div>
        {activeTexture && (
          <div className="flex gap-3">
             <button onClick={manualReforge} className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all border shadow-lg ${needsReforge ? 'bg-amber-500 hover:bg-amber-400 border-amber-500 text-slate-900 font-black' : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white font-bold'}`}>
              <Play className="w-4 h-4 fill-current" />
              <span className="text-xs uppercase">{needsReforge ? '执行算法' : '重新应用'}</span>
            </button>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Section: Image Viewports */}
        <main className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6 order-2 lg:order-1">
          {/* Viewport 1: Original (Interactive Upload Area) */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden flex flex-col min-h-[500px] relative">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".blp,.tga,.png,.jpg,.jpeg" className="hidden" />
            <div className="p-4 bg-slate-800/40 border-b border-slate-700/50 flex justify-between items-center">
              <span className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                <ImageIcon className="w-3 h-3" /> 源纹理 (RAW)
              </span>
              {activeTexture && <span className="text-[10px] font-mono text-slate-500">{activeTexture.width}x{activeTexture.height}</span>}
            </div>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 relative flex items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] overflow-hidden cursor-pointer group"
            >
              {activeTexture ? (
                <>
                  <img src={activeTexture.originalUrl} className="max-w-full max-h-full object-contain shadow-2xl rounded-sm transition-opacity group-hover:opacity-40" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/40 backdrop-blur-[2px]">
                    <Upload className="w-8 h-8 text-white mb-2" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">更换文件</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-5 p-12 rounded-3xl border-2 border-dashed border-slate-800 group-hover:border-indigo-500/50 group-hover:bg-indigo-500/5 transition-all">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center shadow-xl group-hover:scale-105 transition-all">
                    {isProcessing ? <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" /> : <Upload className="w-6 h-6 text-indigo-400" />}
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-black text-slate-200 uppercase tracking-widest">点击上传</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase mt-2">BLP / TGA / PNG</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Viewport 2: Processed */}
          <div className={`bg-slate-900 border ${activeTexture ? 'border-indigo-500/30 shadow-[0_0_80px_-40px_rgba(99,102,241,0.5)]' : 'border-slate-700/50'} rounded-2xl overflow-hidden flex flex-col relative min-h-[500px]`}>
            <div className={`p-4 ${activeTexture ? 'bg-indigo-900/10 border-indigo-500/20' : 'bg-slate-800/40 border-slate-700/50'} border-b flex justify-between items-center`}>
              <span className={`text-xs font-black uppercase ${activeTexture ? 'text-indigo-400' : 'text-slate-400'} tracking-widest flex items-center gap-2`}>
                <Zap className="w-3 h-3 fill-current" /> 算法结果 (FORGED)
              </span>
              {activeTexture && (
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${needsReforge ? 'bg-amber-500 animate-ping' : 'bg-indigo-500 animate-pulse'}`} />
                  <span className={`text-[10px] font-black uppercase tracking-tighter ${needsReforge ? 'text-amber-500' : 'text-indigo-500'}`}>
                    {needsReforge ? '待执行' : '已就绪'}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1 relative flex items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] overflow-hidden group">
              {activeTexture?.processedUrl ? (
                <>
                  <img src={activeTexture.processedUrl} className={`max-w-full max-h-full object-contain transition-all duration-300 ${isProcessing ? 'opacity-30 blur-sm' : 'opacity-100'}`} />
                  <div className={`absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-all flex flex-col items-center justify-center p-6 gap-6 opacity-0 group-hover:opacity-100 ${isProcessing ? 'hidden' : ''}`}>
                    <FileDown className="w-10 h-10 text-indigo-400 mb-2" />
                    <div className="grid grid-cols-1 gap-2.5 w-full max-w-[200px]">
                      {(['BLP', 'TGA', 'PNG'] as const).map(fmt => (
                        <button key={fmt} onClick={() => downloadAs(TextureFormat[fmt])} className="flex items-center justify-between p-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-lg group/btn">
                          <span className="text-[11px] font-black text-white">{fmt === 'BLP' ? 'WC3 BLP (Classic)' : fmt}</span>
                          <Download className="w-4 h-4 text-white/50 group-hover/btn:translate-y-0.5 transition-transform" />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-4 opacity-5">
                  <Code2 className="w-16 h-16 text-slate-400 stroke-1" />
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right Section: Configuration & Presets */}
        <aside className="lg:col-span-4 flex flex-col gap-6 sticky top-8 order-1 lg:order-2">
          {/* Formula Editor */}
          <section className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-wider">
                <Code2 className="w-4 h-4 text-indigo-400" /> 识别算法 (f(r,g,b,a))
              </h2>
              <div className="group relative">
                <Info className="w-4 h-4 text-slate-500 cursor-help" />
                <div className="absolute right-0 top-6 w-64 p-3 bg-slate-900 border border-slate-700 rounded-xl hidden group-hover:block z-50 text-[10px] text-slate-400 leading-relaxed shadow-2xl">
                  <p className="font-bold text-white mb-1 uppercase">变量说明:</p>
                  <p>r, g, b, a: 原始通道值 (0-255)</p>
                  <p>Math: 支持 Math.min, Math.abs 等</p>
                  <p className="mt-2 font-bold text-white mb-1 uppercase">示例:</p>
                  <p className="text-indigo-400 font-mono italic">r > 150 ? 255 : r</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {(['r', 'g', 'b', 'a'] as const).map(channel => (
                <div key={channel} className="space-y-1.5">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">{channel} 通道公式</span>
                    {formulaError && <span className="text-[9px] text-rose-500 font-bold">Error</span>}
                  </div>
                  <input 
                    type="text" 
                    value={formulas[channel]} 
                    onChange={e => setFormulas({...formulas, [channel]: e.target.value})}
                    placeholder={channel}
                    className={`w-full bg-slate-900 border ${formulaError ? 'border-rose-500/50 focus:border-rose-500' : 'border-slate-700 focus:border-indigo-500'} rounded-lg px-3 py-2 text-xs font-mono text-indigo-300 outline-none transition-all shadow-inner`}
                  />
                </div>
              ))}
            </div>

            {formulaError && (
              <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-rose-400 font-medium leading-normal">{formulaError}</p>
              </div>
            )}
          </section>

          {/* Presets */}
          <section className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 shadow-xl">
            <h2 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-wider mb-4">
              <BookOpen className="w-4 h-4 text-indigo-400" /> 炼金配方 (预设)
            </h2>
            <div className="grid grid-cols-1 gap-2">
              {PRESETS.map(p => (
                <button 
                  key={p.name} 
                  onClick={() => applyPreset(p.formulas)}
                  className="w-full text-left p-3 rounded-xl bg-slate-900/50 border border-slate-700 hover:border-indigo-500 hover:bg-indigo-500/5 transition-all group"
                >
                  <span className="text-[11px] font-bold text-slate-400 group-hover:text-white transition-colors">{p.name}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>

      </div>

      <footer className="mt-auto py-8 flex flex-col items-center gap-3 opacity-20 border-t border-slate-700/30">
        <div className="flex items-center gap-6 text-[8px] font-black text-slate-400 uppercase tracking-[0.5em]">
           <span>High Performance Compiled Math Engine</span>
           <span className="w-1 h-1 rounded-full bg-slate-700" />
           <span>Dynamic RGBA Recognition</span>
           <span className="w-1 h-1 rounded-full bg-slate-700" />
           <span>Warcraft III Native Compliance</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
