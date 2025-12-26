
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function analyzeColorChoice(fileName: string, mappingsCount: number): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `用户正在调整魔兽纹理 "${fileName}" 的配色。当前已应用 ${mappingsCount} 组颜色映射。
      请以中文回答（80字以内）：
      1. 简述该配色方案在《魔兽争霸3》引擎中的视觉表现建议（如对比度、团队颜色兼容性）。
      2. 提醒用户注意 Alpha 通道在重色映射时是否需要微调。
      3. 评价一下这种配色适合哪种类型的单位或建筑（如不死族、暗夜精灵等）。`,
    });
    return response.text || "调色方案已就绪。";
  } catch (err) {
    return "调色完成，建议在编辑器中检查团队颜色可见度。";
  }
}
