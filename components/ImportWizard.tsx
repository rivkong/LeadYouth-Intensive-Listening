import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, FileAudio, Loader2, Music, Clock, RotateCcw, Sparkles } from 'lucide-react';
import { Material, Segment } from '../types';
import { getAudioBlob } from '../utils/storage';
import { alignAudioWithText } from '../services/geminiService';

interface ImportWizardProps {
  initialData?: Material;
  onClose: () => void;
  onImport: (material: Material, audioBlob: Blob | null) => void;
}

// Improved splitter that merges dangling punctuation/short segments (Fallback Logic)
const splitIntoSentencesFallback = (text: string): string[] => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  let rawSegments: string[] = [];

  // Use Intl.Segmenter if available for better linguistic awareness
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
      const segmenter = new (Intl as any).Segmenter('en', { granularity: 'sentence' });
      rawSegments = [...segmenter.segment(normalized)].map((s: any) => s.segment.trim());
  } else {
      // Fallback regex looking for punctuation followed by space or end of string
      const processed = normalized.replace(/([.!?。！？]+)(\s+|$)/g, "$1|");
      rawSegments = processed.split('|').map(s => s.trim());
  }

  // Filter empty
  rawSegments = rawSegments.filter(s => s.length > 0);

  const finalSegments: string[] = [];
  let pendingBuffer = "";

  // Forward Merge Logic:
  for (let i = 0; i < rawSegments.length; i++) {
      const seg = rawSegments[i];
      const isLast = i === rawSegments.length - 1;
      
      // Threshold increased to 18 to catch things like "That's right", "Me too", "Oh yeah"
      const isShort = seg.length < 18;

      if (isShort && !isLast) {
          pendingBuffer += seg + " ";
      } else {
          finalSegments.push((pendingBuffer + seg).trim());
          pendingBuffer = "";
      }
  }

  if (pendingBuffer.trim().length > 0) {
      if (finalSegments.length > 0) {
          finalSegments.push(pendingBuffer.trim());
      } else {
          finalSegments[finalSegments.length - 1] += " " + pendingBuffer.trim();
      }
  }

  return finalSegments;
};

export const ImportWizard: React.FC<ImportWizardProps> = ({ initialData, onClose, onImport }) => {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [existingAudioBlob, setExistingAudioBlob] = useState<Blob | null>(null);
  const [offset, setOffset] = useState<string>('0'); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string>("");
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill data if editing
  useEffect(() => {
    if (initialData) {
        setTitle(initialData.title);
        // Reconstruct full text from segments
        setText(initialData.segments.map(s => s.text).join(' '));
        if (initialData.segments.length > 0) {
            setOffset(initialData.segments[0].startTime.toString());
        }
        
        // Fetch existing blob to allow calculation if user doesn't upload new file
        getAudioBlob(initialData.id).then(blob => {
            if (blob) setExistingAudioBlob(blob);
        });
    }
  }, [initialData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAudioFile(e.target.files[0]);
    }
  };

  const processImport = async () => {
    if (!title || !text) return;
    
    const blobToUse = audioFile || existingAudioBlob;
    if (!blobToUse) {
        alert("Please upload an audio file.");
        return;
    }

    setIsProcessing(true);
    setLoadingStage("Loading Audio...");

    try {
      const audioUrl = URL.createObjectURL(blobToUse);

      const duration = await new Promise<number>((resolve, reject) => {
        const audio = new Audio(audioUrl);
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => reject("Could not load audio metadata");
      });

      const offsetSeconds = parseFloat(offset) || 0;
      if (offsetSeconds >= duration) throw new Error("Offset cannot be longer than audio.");
      
      // --- AI ALIGNMENT ATTEMPT ---
      setLoadingStage("AI Aligning (this may take a moment)...");
      
      let segments: Segment[] | null = null;
      
      // Try AI alignment first
      segments = await alignAudioWithText(blobToUse, text);

      // --- FALLBACK LOGIC ---
      if (!segments) {
         console.warn("AI Alignment failed or unavailable. Falling back to linear calculation.");
         setLoadingStage("Falling back to standard alignment...");
         
         const cleanedSegments = splitIntoSentencesFallback(text);
         if (cleanedSegments.length === 0) throw new Error("No segments found.");

         const effectiveDuration = duration - offsetSeconds;
         const totalChars = cleanedSegments.reduce((acc, s) => acc + s.length, 0);
         let currentTime = offsetSeconds; 
         
         segments = cleanedSegments.map((s, i) => {
            const segmentDuration = totalChars > 0 ? (s.length / totalChars) * effectiveDuration : 0;
            const seg: Segment = {
              id: `imp-${Date.now()}-${i}`,
              text: s,
              startTime: currentTime,
              endTime: currentTime + segmentDuration
            };
            currentTime += segmentDuration;
            return seg;
         });
      }

      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      // Image Logic: Leave empty to trigger CSS Fallback in ArticleCard
      // This ensures reliability in China/Netlify without blocked external requests.
      const finalImageUrl = initialData?.imageUrl || "";

      const newMaterial: Material = {
        id: initialData ? initialData.id : `custom-${Date.now()}`,
        title,
        description: text.slice(0, 150).replace(/\s+/g, ' ') + "...",
        category: "Imported",
        difficulty: "Medium",
        duration: durationStr,
        imageUrl: finalImageUrl,
        audioUrl: "", // Filled by App
        segments: segments!
      };

      onImport(newMaterial, audioFile ? audioFile : null);

    } catch (error) {
      console.error("Import failed", error);
      alert(error instanceof Error ? error.message : "Failed to process audio.");
      setIsProcessing(false);
      setLoadingStage("");
    }
  };

  const isReady = title && text && (audioFile || existingAudioBlob);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#09090b] rounded-sm shadow-2xl overflow-hidden border border-zinc-800 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-[#09090b]">
          <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-2">
            {initialData ? 'Edit Session' : 'New Session'}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
          
          {/* Title Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-zinc-500 tracking-widest font-sans">Title</label>
            <input 
              type="text" 
              placeholder="The Title of the Piece"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-transparent border-b border-zinc-700 px-0 py-2 text-3xl font-serif text-white focus:outline-none focus:border-white transition-all placeholder:text-zinc-800 placeholder:font-serif placeholder:italic"
            />
          </div>

          {/* Audio Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-zinc-500 tracking-widest font-sans">Audio Source</label>
            
            {/* If editing and has existing blob, show different UI */}
            {existingAudioBlob && !audioFile ? (
                 <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-sm p-4">
                     <div className="flex items-center gap-3 text-zinc-300">
                         <Music size={20} />
                         <span className="font-mono text-sm">Using existing audio</span>
                     </div>
                     <button 
                        onClick={() => audioInputRef.current?.click()}
                        className="text-xs uppercase font-bold text-[#d44c47] hover:text-white transition-colors flex items-center gap-1"
                     >
                         <RotateCcw size={12} /> Replace
                     </button>
                 </div>
            ) : null}

            <div 
              onClick={() => audioInputRef.current?.click()}
              className={`border border-dashed rounded-sm p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group
                ${(existingAudioBlob && !audioFile) ? 'hidden' : ''}
                ${audioFile ? 'border-white bg-zinc-900' : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900'}
              `}
            >
              <input 
                ref={audioInputRef}
                type="file" 
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg" 
                className="hidden" 
                onChange={handleFileChange}
              />
              {audioFile ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-3 shadow-lg">
                    <Music className="text-black" size={24} />
                  </div>
                  <p className="text-white font-serif italic text-lg">{audioFile.name}</p>
                </>
              ) : (
                <>
                  <FileAudio className="text-zinc-600 mb-3 group-hover:text-white transition-colors" size={32} />
                  <p className="text-zinc-500 font-sans text-sm uppercase tracking-wide group-hover:text-white transition-colors">Upload Audio File</p>
                </>
              )}
            </div>
          </div>

          {/* Intro Offset & AI Badge */}
          <div className="flex items-center gap-4">
            <div className="bg-zinc-900/50 p-4 border-l-2 border-[#d44c47] flex-1">
                <label className="text-xs font-bold uppercase text-zinc-500 tracking-widest block mb-2">Intro Offset (Fallback Only)</label>
                <div className="flex items-center gap-2">
                    <Clock size={16} className="text-zinc-500" />
                    <input 
                    type="number" 
                    min="0"
                    step="0.5"
                    value={offset}
                    onChange={(e) => setOffset(e.target.value)}
                    className="bg-transparent border-none text-white font-mono text-lg focus:ring-0 p-0 w-24"
                    />
                </div>
            </div>
            
            <div className="flex-1 border border-zinc-800 p-4 flex flex-col justify-center h-full">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-500 tracking-widest mb-1">
                   <Sparkles size={14} className="text-yellow-500" /> AI Alignment
                </div>
                <p className="text-[10px] text-zinc-600">
                    We'll try to use AI to sync text with audio precisely. If it fails, we fall back to a standard calculation using the offset.
                </p>
            </div>
          </div>

          {/* Transcript */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-zinc-500 tracking-widest font-sans">Full Text</label>
            <textarea 
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the full text here. We will align it to the audio."
                className="w-full h-64 bg-zinc-900/30 border border-zinc-800 rounded-sm p-4 text-base md:text-lg font-serif leading-relaxed text-zinc-300 focus:border-zinc-600 focus:bg-zinc-900 focus:outline-none transition-all placeholder:text-zinc-700 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-[#09090b] border-t border-zinc-800 flex justify-between items-center">
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest hidden sm:block">
              LeadYouth Editor v2.2
          </div>
          <div className="flex gap-4 items-center">
            {isProcessing && (
                <span className="text-xs text-[#d44c47] font-bold uppercase animate-pulse mr-2">
                    {loadingStage}
                </span>
            )}
            <button 
                onClick={onClose}
                disabled={isProcessing}
                className="px-6 py-3 font-sans font-bold text-zinc-500 hover:text-white transition-colors uppercase text-xs tracking-widest disabled:opacity-50"
            >
                Cancel
            </button>
            <button 
                onClick={processImport}
                disabled={!isReady || isProcessing}
                className={`
                flex items-center gap-2 px-8 py-3 rounded-full font-sans font-bold text-white shadow-lg transition-all text-xs uppercase tracking-widest
                ${(!isReady || isProcessing) 
                    ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' 
                    : 'bg-[#d44c47] hover:bg-[#ff5e5e]'}
                `}
            >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : (initialData ? 'Save Changes' : 'Create Session')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};