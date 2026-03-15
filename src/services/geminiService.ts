import { GoogleGenAI } from "@google/genai";
import { Message, Mode } from "./types";

const PORTRAIT_CACHE_KEY = "vera_portrait_b64";

const MODELS = {
  chat:    "gemini-2.5-pro",
  summary: "gemini-2.0-flash",
  image:   "imagen-3.0-generate-002",
  tts:     "gemini-2.5-flash-preview-tts",
};

const SYSTEM_INSTRUCTION = `You are Vera, a personal tutor. You speak in natural California American English.
Your tone is warm, confident, and direct. Avoid filler words. Be professional but never robotic.

Your specialties:
1. English: correction, vocabulary, grammar, and conversation practice.
2. Productivity and habits: focus, routines, and consistency.
3. History, business, and general culture: teaching in blocks and checking comprehension.
4. AI applied to sports: trends, tools, and real use cases.

How you work:
- At the start of each session, ask what the user wants to work on today.
- Adapt difficulty to the user's level.
- Correct mistakes by briefly explaining why.
- Propose practical exercises when useful.
- Ask questions to verify understanding.

Language rule: Always respond in the same language the user writes in (Spanish or English).

Commands: /english /habits /learn [topic] /quiz [topic] /sports /summary`;

const VERA_IMAGE_PROMPT =
  "Portrait photo of a woman named Vera, 28 years old, Californian, " +
  "warm medium-brown skin tone, dark straight hair, subtle natural makeup. " +
  "Wearing a smart casual blazer in muted earth tones. " +
  "Clean neutral studio background, soft natural light. " +
  "Confident, approachable, intelligent. Photorealistic, 85mm lens. " +
  "No text, no watermarks.";

const getAI = () => new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || "" });

export async function sendMessageToVera(messages: Message[], _currentMode: Mode): Promise<string> {
  const ai = getAI();
  const history = messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  try {
    const response = await ai.models.generateContent({
      model: MODELS.chat,
      contents: history,
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.7 },
    });
    return response.text || "Sorry, I could not process that. Try again.";
  } catch (error) {
    console.error("Chat error:", error);
    throw new Error("Vera no pudo responder. Revisa tu API key.");
  }
}

export async function getSummary(messages: Message[]): Promise<string> {
  const ai = getAI();
  const history = messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  try {
    const response = await ai.models.generateContent({
      model: MODELS.summary,
      contents: [...history, { role: "user", parts: [{ text: "Summarize what we worked on today in clear bullet points. Be direct." }] }],
      config: { systemInstruction: "You are Vera. Summarize the session directly." },
    });
    return response.text || "No hay suficiente información para un resumen.";
  } catch (error) {
    throw new Error("No se pudo generar el resumen.");
  }
}

export async function generateVeraPortrait(): Promise<string | null> {
  const cached = localStorage.getItem(PORTRAIT_CACHE_KEY);
  if (cached) return cached;
  const ai = getAI();
  try {
    const response = await ai.models.generateImages({
      model: MODELS.image,
      prompt: VERA_IMAGE_PROMPT,
      config: { numberOfImages: 1, aspectRatio: "1:1" },
    });
    const b64 = response.generatedImages?.[0]?.image?.imageBytes;
    if (!b64) return null;
    const dataUrl = `data:image/png;base64,${b64}`;
    try { localStorage.setItem(PORTRAIT_CACHE_KEY, dataUrl); } catch {}
    return dataUrl;
  } catch (error) {
    console.error("Portrait error:", error);
    return null;
  }
}

export function clearVeraPortraitCache(): void {
  localStorage.removeItem(PORTRAIT_CACHE_KEY);
}

export async function generateVeraAudio(text: string): Promise<string | null> {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: MODELS.tts,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return null;
    const blob = await fetch(`data:audio/wav;base64,${base64Audio}`).then(r => r.blob());
    return URL.createObjectURL(blob);
  } catch (error) {
    return null;
  }
}

export async function generateVeraVideo(imageB64: string, prompt: string): Promise<string | null> {
  const ai = getAI();
  try {
    const base64Data = imageB64.split(",")[1];
    let operation = await ai.models.generateVideos({
      model: "veo-2.0-generate-001",
      prompt: `Vera, a 28-year-old Californian woman, speaking naturally to camera. Soft lighting, neutral background. ${prompt}`,
      image: { imageBytes: base64Data, mimeType: "image/png" },
      config: { numberOfVideos: 1, resolution: "720p", aspectRatio: "1:1" },
    });
    while (!operation.done) {
      await new Promise(r => setTimeout(r, 5000));
      operation = await ai.operations.getVideosOperation({ operation });
    }
    const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) return null;
    const videoResponse = await fetch(uri, { headers: { "x-goog-api-key": import.meta.env.VITE_GEMINI_API_KEY || "" } });
    return URL.createObjectURL(await videoResponse.blob());
  } catch (error) {
    return null;
  }
}
