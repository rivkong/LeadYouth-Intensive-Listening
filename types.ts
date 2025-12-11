export interface Segment {
  id: string;
  text: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
}

export interface Material {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  duration: string;
  imageUrl: string;
  audioUrl: string; // In a real app, this would be a real URL. We will mock or use TTS.
  segments: Segment[];
}

export interface UserState {
  currentMaterialId: string | null;
  isPlaying: boolean;
  playbackProgress: number; // 0 to 1
  currentTime: number; // seconds
}
