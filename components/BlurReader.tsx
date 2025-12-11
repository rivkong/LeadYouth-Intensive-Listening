
import React, { useEffect, useRef, useState } from 'react';
import { Material, Segment } from '../types';
import { ArrowLeft, Play, Pause, Square, AlignJustify, SkipBack, SkipForward, Repeat, Download, Mic, Eye, EyeOff, BookOpen, MessageSquare, MicOff, RotateCcw, RotateCw } from 'lucide-react';
import { mergeAudioBlobs } from '../utils/audioUtils';

interface BlurReaderProps {
  material: Material;
  onBack: () => void;
}

type ViewMode = 'visible' | 'blur' | 'blind';
type PlaybackMode = 'article' | 'sentence';
type LoopSetting = number;

export const BlurReader: React.FC<BlurReaderProps> = ({ material, onBack }) => {
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  
  // Settings
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('sentence');
  const [loopSetting, setLoopSetting] = useState<LoopSetting>(1);
  const [viewMode, setViewMode] = useState<ViewMode>('blur');
  
  // Recording State
  const [userRecordings, setUserRecordings] = useState<Record<string, Blob>>({});
  const [recordingState, setRecordingState] = useState<'inactive' | 'recording' | 'paused'>('inactive');
  const [isExporting, setIsExporting] = useState(false);
  const [isUserPlaying, setIsUserPlaying] = useState(false);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const userAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const preciseCheckRef = useRef<number>();
  const simulationRef = useRef<number | null>(null);
  
  // Sync Refs
  const activeIndexRef = useRef(-1);
  const playCountRef = useRef(0);

  // --- Initialization ---
  useEffect(() => {
    setActiveIndex(-1);
    activeIndexRef.current = -1;
    setCurrentTime(0);
    setIsPlaying(false);
    playCountRef.current = 0;
    setUserRecordings({});
    segmentRefs.current = segmentRefs.current.slice(0, material.segments.length);
    
    if (!material.audioUrl) {
        const lastSeg = material.segments[material.segments.length - 1];
        setDuration(lastSeg ? lastSeg.endTime : 60);
    }
  }, [material]);

  // --- Loop Logic ---
  useEffect(() => {
    if (isPlaying && material.audioUrl) {
      const check = () => {
        if (audioRef.current) {
           const t = audioRef.current.currentTime;
           const idx = activeIndexRef.current;
           
           if (playbackMode === 'sentence' && idx !== -1) {
               const seg = material.segments[idx];
               // Buffer logic
               if (t >= seg.endTime - 0.15) {
                   playCountRef.current += 1;
                   if (playCountRef.current < loopSetting) {
                       audioRef.current.currentTime = seg.startTime;
                   } else {
                       audioRef.current.pause();
                       audioRef.current.currentTime = seg.startTime;
                       setCurrentTime(seg.startTime);
                       setIsPlaying(false);
                       playCountRef.current = 0;
                   }
               }
           }
        }
        preciseCheckRef.current = requestAnimationFrame(check);
      };
      preciseCheckRef.current = requestAnimationFrame(check);
    }
    return () => {
        if (preciseCheckRef.current) cancelAnimationFrame(preciseCheckRef.current);
    };
  }, [isPlaying, playbackMode, loopSetting, material.audioUrl]);


  // --- Simulation Mode ---
  const startSimulation = (startTimeOffset: number) => {
    if (simulationRef.current) window.clearInterval(simulationRef.current);
    const startTimestamp = Date.now() - (startTimeOffset * 1000);
    
    simulationRef.current = window.setInterval(() => {
        const newTime = (Date.now() - startTimestamp) / 1000;
        
        if (playbackMode === 'sentence' && activeIndexRef.current !== -1) {
            const idx = activeIndexRef.current;
            const seg = material.segments[idx];

            if (newTime >= seg.endTime) {
                 playCountRef.current += 1;
                 if (playCountRef.current < loopSetting) {
                     startSimulation(seg.startTime);
                 } else {
                     if (simulationRef.current) window.clearInterval(simulationRef.current);
                     setIsPlaying(false);
                     setCurrentTime(seg.startTime);
                     playCountRef.current = 0;
                 }
                 return;
            }
        }

        if (newTime >= duration && duration > 0) {
            setIsPlaying(false);
            setCurrentTime(0);
            if (simulationRef.current) window.clearInterval(simulationRef.current);
        } else {
            setCurrentTime(newTime);
        }
    }, 100);
  };

  // --- Playback Controls ---
  const togglePlay = () => {
    if (isUserPlaying && userAudioRef.current) {
        userAudioRef.current.pause();
        setIsUserPlaying(false);
    }

    if (material.audioUrl) {
      if (!audioRef.current) return;
      
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        // Stop recording if playing starts
        if (recordingState !== 'inactive') stopRecording();
        audioRef.current.play().catch(e => console.error("Playback error", e));
        setIsPlaying(true);
      }
    } else {
      if (isPlaying) {
        if (simulationRef.current) window.clearInterval(simulationRef.current);
        setIsPlaying(false);
      } else {
        setIsPlaying(true);
        startSimulation(currentTime);
      }
    }
  };
  
  const replayCurrent = () => {
      if (activeIndexRef.current === -1) return;
      const targetTime = material.segments[activeIndexRef.current].startTime;
      playCountRef.current = 0;
      
      if (material.audioUrl && audioRef.current) {
          audioRef.current.currentTime = targetTime;
          setCurrentTime(targetTime);
          if (!isPlaying) {
              audioRef.current.play();
              setIsPlaying(true);
          }
      } else if (!material.audioUrl) {
          startSimulation(targetTime);
          setIsPlaying(true);
      }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      if (!isDragging) {
        setCurrentTime(audioRef.current.currentTime);
      }
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      setCurrentTime(time);
      if (audioRef.current) {
          audioRef.current.currentTime = time;
      }
  };

  const skipToSegment = (direction: 'prev' | 'next') => {
      let targetIndex = activeIndexRef.current;
      
      if (targetIndex === -1) {
          targetIndex = 0;
      } else {
          if (direction === 'prev') {
              const currentSeg = material.segments[targetIndex];
              // If we are more than 2 seconds into the segment, go to start of current segment
              if (currentSeg && (currentTime - currentSeg.startTime > 2)) {
                 targetIndex = targetIndex; 
              } else {
                 targetIndex = targetIndex - 1;
              }
          } else {
              targetIndex = targetIndex + 1;
          }
      }

      if (targetIndex < 0) targetIndex = 0;
      if (targetIndex >= material.segments.length) targetIndex = material.segments.length - 1;

      activeIndexRef.current = targetIndex;
      setActiveIndex(targetIndex);
      playCountRef.current = 0;
      
      const targetTime = material.segments[targetIndex]?.startTime ?? 0;
      setCurrentTime(targetTime);
      
      if (material.audioUrl && audioRef.current) {
          audioRef.current.currentTime = targetTime;
          audioRef.current.play();
          setIsPlaying(true);
      } else if (!material.audioUrl) {
          startSimulation(targetTime);
          setIsPlaying(true);
      }
  };

  const seekRelative = (seconds: number) => {
      if (audioRef.current) {
          const newTime = Math.max(0, Math.min(audioRef.current.duration, audioRef.current.currentTime + seconds));
          audioRef.current.currentTime = newTime;
          setCurrentTime(newTime);
      }
  };

  // --- Helper Icons/Labels ---
  const cycleViewMode = () => {
      setViewMode(prev => {
          if (prev === 'visible') return 'blur';
          if (prev === 'blur') return 'blind';
          return 'visible';
      });
  };

  // --- Keyboard Shortcuts (Moved after function definitions) ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

          // Play/Pause
          if (e.code === 'Space') { 
              e.preventDefault(); 
              togglePlay(); 
          }
          // Replay
          if (e.key === 'Control') { 
              e.preventDefault(); 
              replayCurrent(); 
          }
          // View Mode
          if (e.code === 'ArrowUp') { 
              e.preventDefault(); 
              cycleViewMode(); 
          }
          
          // Navigation & Seeking
          if (e.code === 'ArrowLeft') { 
              e.preventDefault(); 
              if (e.shiftKey) {
                  seekRelative(-2); // Shift + Left = Rewind 2s
              } else {
                  skipToSegment('prev'); 
              }
          }
          if (e.code === 'ArrowRight') { 
              e.preventDefault(); 
              if (e.shiftKey) {
                  seekRelative(2); // Shift + Right = Forward 2s
              } else {
                  skipToSegment('next'); 
              }
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [material.audioUrl, isPlaying, viewMode, activeIndex, playbackMode]); // Added deps


  const handleSegmentClick = (segment: Segment) => {
      const idx = material.segments.findIndex(s => s.id === segment.id);
      activeIndexRef.current = idx;
      setActiveIndex(idx);
      playCountRef.current = 0;

      if (audioRef.current) {
          audioRef.current.currentTime = segment.startTime;
          audioRef.current.play();
          setIsPlaying(true);
      } else if (!material.audioUrl) {
          startSimulation(segment.startTime);
          setIsPlaying(true);
      }
  };

  // --- Scroll Sync ---
  useEffect(() => {
    const idx = material.segments.findIndex(
      (seg) => currentTime >= seg.startTime && currentTime < seg.endTime
    );
    if (idx !== -1 && idx !== activeIndex) {
        if (playbackMode === 'article') {
            activeIndexRef.current = idx;
            setActiveIndex(idx);
        }
        if (segmentRefs.current[idx]) {
            segmentRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
  }, [currentTime, material.segments, playbackMode]);

  useEffect(() => {
    return () => {
      if (simulationRef.current) window.clearInterval(simulationRef.current);
      if (preciseCheckRef.current) cancelAnimationFrame(preciseCheckRef.current);
    };
  }, []);


  // --- RECORDING LOGIC ---
  const getSupportedMimeType = () => {
      const types = ['audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'];
      for (const type of types) {
          if (MediaRecorder.isTypeSupported(type)) return type;
      }
      return ''; 
  };

  const handleRecordButton = async () => {
      if (activeIndex === -1) return;

      if (recordingState === 'inactive') {
          await startRecording();
      } else if (recordingState === 'recording') {
          mediaRecorderRef.current?.pause();
          setRecordingState('paused');
      } else if (recordingState === 'paused') {
          mediaRecorderRef.current?.resume();
          setRecordingState('recording');
      }
  };

  const startRecording = async () => {
      if (isPlaying) togglePlay(); 

      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const options = { mimeType: getSupportedMimeType() };
          const mediaRecorder = options.mimeType ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
          
          recordingChunksRef.current = []; 

          mediaRecorder.ondataavailable = (e) => {
              if (e.data.size > 0) recordingChunksRef.current.push(e.data);
          };

          mediaRecorder.onstop = () => {
              const blob = new Blob(recordingChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
              const currentSegId = material.segments[activeIndexRef.current].id;
              setUserRecordings(prev => ({ ...prev, [currentSegId]: blob }));
              stream.getTracks().forEach(track => track.stop());
              recordingChunksRef.current = [];
          };
          
          mediaRecorderRef.current = mediaRecorder;
          mediaRecorder.start(100); 
          setRecordingState('recording');
      } catch (err) {
          console.error("Mic access denied or error", err);
          alert("Could not access microphone. Please check permissions.");
      }
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && recordingState !== 'inactive') {
          mediaRecorderRef.current.stop();
          setRecordingState('inactive');
      }
  };

  const playUserRecording = () => {
      if (activeIndex === -1) return;
      const segId = material.segments[activeIndex].id;
      const blob = userRecordings[segId];
      if (!blob) return;

      if (isPlaying && audioRef.current) {
          audioRef.current.pause();
          setIsPlaying(false);
      }

      const url = URL.createObjectURL(blob);
      if (userAudioRef.current) {
          userAudioRef.current.src = url;
          userAudioRef.current.play();
          setIsUserPlaying(true);
          userAudioRef.current.onended = () => {
              setIsUserPlaying(false);
              URL.revokeObjectURL(url);
          };
      }
  };

  const deleteUserRecording = () => {
      if (activeIndex === -1) return;
      const segId = material.segments[activeIndex].id;
      const newRecs = { ...userRecordings };
      delete newRecs[segId];
      setUserRecordings(newRecs);
  };

  const handleExport = async () => {
      const orderedBlobs: Blob[] = [];
      let hasRecordings = false;
      for (const seg of material.segments) {
          if (userRecordings[seg.id]) {
              orderedBlobs.push(userRecordings[seg.id]);
              hasRecordings = true;
          }
      }
      if (!hasRecordings) {
          alert("No recordings found to export.");
          return;
      }
      setIsExporting(true);
      try {
          const wavBlob = await mergeAudioBlobs(orderedBlobs);
          const url = URL.createObjectURL(wavBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `practice-${material.title.slice(0, 20)}.wav`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (e) {
          console.error("Export failed", e);
          alert("Failed to create audio file. Ensure recordings are valid.");
      }
      setIsExporting(false);
  };

  const getViewModeIcon = () => {
      if (viewMode === 'visible') return <Eye size={20} />;
      if (viewMode === 'blur') return <AlignJustify size={20} />;
      return <EyeOff size={20} />;
  };

  const cycleLoopSetting = () => {
      if (playbackMode !== 'sentence') return;
      setLoopSetting(prev => {
          if (prev === 1) return 2;
          if (prev === 2) return 3;
          if (prev === 3) return Infinity;
          return 1;
      });
  };

  // --- Render ---
  const hasCurrentRecording = activeIndex !== -1 && !!userRecordings[material.segments[activeIndex]?.id];
  const formatTime = (t: number) => {
      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#09090b] flex flex-col animate-in fade-in duration-300">
      
      {material.audioUrl && (
        <audio
          ref={audioRef}
          src={material.audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
        />
      )}
      <audio ref={userAudioRef} />

      {/* --- Top Navbar --- */}
      <header className="flex-none px-4 py-4 md:px-6 flex items-center justify-between z-10 bg-[#09090b] border-b border-zinc-800">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="font-sans text-xs uppercase tracking-widest font-bold">Back to Library</span>
        </button>
        
        <div className="flex items-center gap-2">
            <button 
                onClick={cycleViewMode}
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-700 bg-transparent text-white hover:bg-zinc-800 transition-all"
            >
                {getViewModeIcon()}
                <span className="text-xs font-bold uppercase hidden md:inline tracking-wider">
                    {viewMode === 'visible' ? 'Full Text' : viewMode === 'blur' ? 'Blur Mode' : 'Blind Mode'}
                </span>
            </button>
        </div>
      </header>

      {/* --- Main Text Area --- */}
      <main className="flex-1 overflow-y-auto px-4 md:px-6 relative custom-scrollbar" ref={scrollContainerRef}>
        <div className="max-w-2xl mx-auto pb-48 pt-12">
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-white mb-10 text-center leading-tight">{material.title}</h1>
            
            <div className="space-y-8">
              {material.segments.map((seg, index) => {
                const isActive = index === activeIndex;
                const hasRec = !!userRecordings[seg.id];
                
                return (
                  <div 
                    key={seg.id}
                    ref={(el) => (segmentRefs.current[index] = el)}
                    onClick={() => handleSegmentClick(seg)}
                    className={`
                        relative transition-all duration-300 ease-out cursor-pointer p-6 rounded-sm border-l-2
                        ${isActive ? 'bg-zinc-900/50 border-l-[#d44c47]' : 'border-l-transparent hover:bg-zinc-900/30'}
                    `}
                  >
                     <p className={`text-xl md:text-2xl font-serif leading-loose tracking-wide ${isActive ? 'text-white' : 'text-zinc-500'}`}>
                        {seg.text.split(/(\s+)/).map((part, i) => {
                             let className = "";
                             if (viewMode === 'blind') className = "bg-zinc-800 text-zinc-800 rounded-sm select-none";
                             else if (viewMode === 'blur') className = "structure-blur text-transparent text-shadow-white";
                             
                             return <span key={i} className={className}>{part}</span>;
                        })}
                     </p>
                     
                     {hasRec && !isActive && (
                         <div className="absolute top-6 right-6 text-[#d44c47]">
                             <Mic size={16} fill="currentColor" />
                         </div>
                     )}
                  </div>
                );
              })}
            </div>
        </div>
      </main>

      {/* --- Bottom Controls --- */}
      <div className="flex-none bg-[#09090b] border-t border-zinc-800 pb-8 pt-0 safe-area-bottom relative">
         
         {/* Progress Bar */}
         <div className="w-full relative group cursor-pointer mb-4">
             <input 
                type="range" 
                min={0} 
                max={duration || 1} 
                step={0.1}
                value={currentTime}
                onMouseDown={() => setIsDragging(true)}
                onMouseUp={() => setIsDragging(false)}
                onTouchStart={() => setIsDragging(true)}
                onTouchEnd={() => setIsDragging(false)}
                onChange={handleSeek}
                className="w-full h-1.5 bg-zinc-800 rounded-none appearance-none cursor-pointer accent-[#d44c47] focus:outline-none focus:ring-0"
             />
             <div className="absolute top-2 left-2 text-[10px] text-zinc-500 font-mono pointer-events-none">
                 {formatTime(currentTime)} / {formatTime(duration)}
             </div>
         </div>

         {/* Recording Status Bar */}
         {(recordingState !== 'inactive' || hasCurrentRecording) && (
             <div className="mx-auto max-w-xl px-4 mb-4">
                 <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-sm p-3 px-4">
                    {recordingState !== 'inactive' ? (
                        <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${recordingState === 'recording' ? 'bg-[#d44c47] animate-pulse' : 'bg-yellow-500'}`} />
                            <span className="text-xs font-bold text-white uppercase tracking-wider">
                                {recordingState === 'recording' ? 'Recording...' : 'Paused'}
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-[#1db954]" />
                            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Recorded</span>
                        </div>
                    )}
                    
                    {recordingState === 'inactive' && hasCurrentRecording && (
                        <div className="flex items-center gap-4">
                            <button onClick={playUserRecording} className="p-1 hover:text-white text-zinc-500 transition-colors">
                                {isUserPlaying ? <Square size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}
                            </button>
                            <button onClick={deleteUserRecording} className="p-1 hover:text-[#d44c47] text-zinc-500 transition-colors">
                                <MicOff size={16} />
                            </button>
                        </div>
                    )}

                    {recordingState !== 'inactive' && (
                         <button onClick={stopRecording} className="text-xs font-bold text-[#d44c47] hover:text-[#ff5e5e] uppercase tracking-widest">
                             Stop & Save
                         </button>
                    )}
                 </div>
             </div>
         )}

         {/* Main Deck */}
         <div className="max-w-xl mx-auto px-4 flex items-center justify-between gap-2">
            
            {/* Playback Mode & Loop */}
            <div className="flex items-center gap-1">
                <button 
                    onClick={() => setPlaybackMode(m => m === 'article' ? 'sentence' : 'article')}
                    className={`p-2 rounded-full transition-colors ${playbackMode === 'article' ? 'text-white bg-zinc-800' : 'text-zinc-600 hover:text-white'}`}
                    title={playbackMode === 'article' ? "Article Mode" : "Sentence Mode"}
                >
                    {playbackMode === 'article' ? <BookOpen size={20} /> : <MessageSquare size={20} />}
                </button>
                
                {/* Unified Loop Button */}
                <button 
                    onClick={cycleLoopSetting}
                    disabled={playbackMode !== 'sentence'}
                    className={`
                        relative w-10 h-10 flex items-center justify-center rounded-full transition-colors
                        ${playbackMode === 'sentence' ? 'text-white' : 'text-zinc-700 opacity-50'}
                    `}
                >
                    <Repeat size={20} />
                    <span className="absolute text-[8px] font-bold bg-[#09090b] px-0.5 -bottom-1 text-center min-w-[12px]">
                        {loopSetting === Infinity ? '∞' : loopSetting}
                    </span>
                </button>
            </div>

            {/* Transport */}
            <div className="flex items-center gap-4">
                 {/* Skip -2s */}
                 <button onClick={() => seekRelative(-2)} className="text-zinc-500 hover:text-white transition-colors" title="Rewind 2s (Shift + Left)">
                     <RotateCcw size={20} />
                 </button>

                 <button onClick={() => skipToSegment('prev')} className="text-zinc-500 hover:text-white transition-colors">
                     <SkipBack size={24} fill="currentColor" />
                 </button>
                 
                 <button 
                    onClick={togglePlay}
                    className="w-16 h-16 bg-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all text-black shadow-xl"
                 >
                    {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                 </button>

                 <button onClick={() => skipToSegment('next')} className="text-zinc-500 hover:text-white transition-colors">
                     <SkipForward size={24} fill="currentColor" />
                 </button>

                 {/* Skip +2s */}
                 <button onClick={() => seekRelative(2)} className="text-zinc-500 hover:text-white transition-colors" title="Forward 2s (Shift + Right)">
                     <RotateCw size={20} />
                 </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
                <button 
                  onClick={handleExport}
                  disabled={isExporting}
                  className="text-zinc-500 hover:text-white transition-colors p-2"
                  title="Download Recording"
                >
                   <Download size={20} />
                </button>

                <button 
                    onClick={handleRecordButton}
                    className={`
                        w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg
                        ${recordingState === 'recording' ? 'bg-[#d44c47] text-white scale-110' : 
                          recordingState === 'paused' ? 'bg-yellow-500 text-white' : 
                          'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'}
                    `}
                    title="Microphone"
                >
                    {recordingState === 'recording' ? <Pause size={20} fill="currentColor" /> : 
                     recordingState === 'paused' ? <Play size={20} fill="currentColor" /> :
                     <Mic size={22} />}
                </button>
            </div>
         </div>
      </div>
    </div>
  );
};
