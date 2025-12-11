import { GoogleGenAI, Type } from "@google/genai";
import { Material, Segment } from "../types";

// Helper to safely get the AI client
const getGenAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY is missing. Generative features will fail.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

// Convert Blob to Base64 for API transmission
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const alignAudioWithText = async (audioBlob: Blob, fullText: string): Promise<Segment[] | null> => {
  try {
    const ai = getGenAI();
    if (!ai) return null;

    const base64Audio = await blobToBase64(audioBlob);
    const model = "gemini-2.5-flash"; // Supports multimodal input

    const prompt = `
      I have an audio file and a transcript.
      Task: Align the provided transcript to the audio with high precision for a listening practice app.
      
      Instructions:
      1. Listen to the audio carefully.
      2. Split the transcript into natural sentences or logical phrases based on the speaker's actual pauses and intonation.
      3. CRITICAL: Merge short interjections (e.g., "Right", "Okay", "Yeah", "Me too", "Uh-huh") into the preceding or succeeding sentence. Do not create isolated segments for words less than 1 second unless they are surrounded by long silence.
      4. Crucial: Do not change, add, or remove any words. The concatenated text of all segments must match the provided transcript exactly.
      5. Provide the start and end time for each segment in seconds.
      
      Transcript:
      "${fullText}"
      
      Return a JSON object with a "segments" array.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type || "audio/mp3",
              data: base64Audio
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  startTime: { type: Type.NUMBER },
                  endTime: { type: Type.NUMBER }
                },
                required: ["text", "startTime", "endTime"]
              }
            }
          }
        }
      }
    });

    const json = JSON.parse(response.text || "{}");
    if (json.segments && Array.isArray(json.segments) && json.segments.length > 0) {
       return json.segments.map((s: any, i: number) => {
         // Fix: Shift start time back by 0.6s to capture the attack of the first word.
         // AI VAD can be too tight.
         const PADDING = 0.6;
         const adjustedStart = Math.max(0, s.startTime - PADDING);
         
         return {
           id: `ai-${Date.now()}-${i}`,
           text: s.text,
           startTime: adjustedStart,
           endTime: s.endTime
         };
       });
    }
    
    return null;

  } catch (error) {
    console.error("AI Alignment failed:", error);
    return null;
  }
};

export const generateMaterial = async (topic: string): Promise<Material | null> => {
  // Deprecated generator function, but kept for type compatibility if needed
  return null;
};

export const getWordDefinition = async (word: string, context: string): Promise<string> => {
  try {
    const ai = getGenAI();
    if (!ai) return "API Key missing";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Define the word "${word}" briefly (under 30 words) as it is used in this context: "${context}". Return just the definition.`,
    });
    return response.text || "Definition not found.";
  } catch (error) {
    console.error("Definition error", error);
    return "Could not load definition.";
  }
};