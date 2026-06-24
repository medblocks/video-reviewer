export interface User {
  id: string;
  name: string;
  avatar?: string; // Optional - generated on frontend if not provided
}

export interface Attachment {
  id: string;
  type: 'image' | 'file';
  url: string; // Base64 data URL (e.g., "data:image/png;base64,...")
  name: string;
}

// Storing the full Fabric JSON object
export interface DrawingPath {
  version: string;
  objects: any[]; 
}

export interface Annotation {
  id: string;
  videoId: string;
  parentId?: string;
  startTime: number; // Start of the annotation (seconds)
  endTime: number;   // End of the annotation (seconds). Equals startTime for point comments.
  author: User;
  text: string;
  createdAt: number;
  type: 'comment' | 'drawing';
  drawingData?: DrawingPath;
  attachments: Attachment[];
  status: 'pending' | 'completed';
}

export interface VideoMetadata {
  id: string;
  name: string;
  url: string;
  duration: number;
}

export interface VisualSuggestion {
  category: 'MEME' | 'ANIMATION' | 'ILLUSTRATION';
  title: string;
  description: string;
}
