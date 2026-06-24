import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { VideoPlayer, VideoPlayerRef } from './components/VideoPlayer';
import { Timeline } from './components/Timeline';
import { Sidebar } from './components/Sidebar';
import { Button } from './components/ui/Button';
import { UserOnboardingModal } from './components/UserOnboardingModal';
import { VisualSuggestionsModal } from './components/VisualSuggestionsModal';
import { DriveLinkInput } from './components/DriveLinkInput';
import { Annotation, Attachment, User, VisualSuggestion } from './types';
import { 
  getAnnotations, 
  saveAnnotation,
  updateAnnotation,
  deleteAnnotation,
  createUser, 
  getStoredUser, 
  getUser,
  exportAnnotations,
  importAnnotations,
  downloadExportAsFile,
  getVisualSuggestions,
  getDriveStatus,
  getDriveAuthUrl,
  getDriveStreamUrl,
  extractDriveFileId,
  API_ORIGIN,
  ExportData
} from './services/api';
import { generateFastFileHash, generateFileHash } from './utils/hash';
import { parseVTT, getTranscriptForRange, getFullTranscript, TranscriptCue, fetchAndParseVTT } from './utils/transcript';
import { Pen, Upload, Play, Pause, MousePointer2, Moon, Sun, Captions, CaptionsOff, Trash2, Download, FileUp, Sparkles } from 'lucide-react';

// Frame Note Logo Component
const FrameNoteLogo = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
    {/* Film frame */}
    <rect x="4" y="6" width="24" height="20" rx="2" className="stroke-amber-500" strokeWidth="2" fill="none" />
    {/* Film perforations */}
    <rect x="6" y="9" width="3" height="4" rx="0.5" className="fill-amber-500" />
    <rect x="6" y="19" width="3" height="4" rx="0.5" className="fill-amber-500" />
    <rect x="23" y="9" width="3" height="4" rx="0.5" className="fill-amber-500" />
    <rect x="23" y="19" width="3" height="4" rx="0.5" className="fill-amber-500" />
    {/* Pencil/note icon */}
    <path d="M13 18L18 13L20 15L15 20H13V18Z" className="fill-amber-500" />
    <path d="M19 12L20 11C20.5 10.5 21.5 10.5 22 11C22.5 11.5 22.5 12.5 22 13L21 14L19 12Z" className="fill-amber-400" />
  </svg>
);

export default function App() {
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // User State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Video State
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [subtitleSrc, setSubtitleSrc] = useState<string | null>(null);
  const [isCaptionsEnabled, setIsCaptionsEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Google Drive State
  const [isDriveConnected, setIsDriveConnected] = useState(false);

  // Transcript State
  const [transcriptCues, setTranscriptCues] = useState<TranscriptCue[]>([]);
  
  // Visual Suggestions State
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);
  const [suggestions, setSuggestions] = useState<VisualSuggestion[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  
  // Available playback speeds
  const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5];
  
  // App Mode State
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [selectedTool, setSelectedTool] = useState<'pointer' | 'pen'>('pointer');
  
  // Selection State
  const [selectionRange, setSelectionRange] = useState<{start: number, end: number} | null>(null);

  // Data State
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  
  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts for video control and time range selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (!videoSrc) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault(); // Prevent page scroll
          setIsPlaying(prev => !prev);
          break;
        
        case 'ArrowLeft':
          // Jump back 5 seconds
          e.preventDefault();
          const newTimeBack = Math.max(0, currentTime - 5);
          videoPlayerRef.current?.seekTo(newTimeBack);
          setCurrentTime(newTimeBack);
          break;
        
        case 'ArrowRight':
          // Jump forward 5 seconds
          e.preventDefault();
          const newTimeForward = Math.min(duration, currentTime + 5);
          videoPlayerRef.current?.seekTo(newTimeForward);
          setCurrentTime(newTimeForward);
          break;
        
        case 'KeyA':
          // Set/snap start time for range at current playhead position
          e.preventDefault();
          setSelectionRange(prev => {
            const start = currentTime;
            // If we already have an end time that's after the new start, keep it
            const end = prev && prev.end > start ? prev.end : Math.min(start + 1, duration);
            return { start, end };
          });
          break;
        
        case 'KeyS':
          // Set/snap end time for range at current playhead position and pause
          e.preventDefault();
          setIsPlaying(false); // Pause video when setting end point
          setSelectionRange(prev => {
            const end = currentTime;
            // If we already have a start time that's before the new end, keep it
            const start = prev && prev.start < end ? prev.start : Math.max(0, end - 1);
            return { start, end };
          });
          break;
        
        case 'KeyQ':
          // Snap start of existing range to current position (without changing end)
          e.preventDefault();
          if (selectionRange && currentTime < selectionRange.end) {
            setSelectionRange({ start: currentTime, end: selectionRange.end });
          }
          break;
        
        case 'KeyW':
          // Snap end of existing range to current position (without changing start)
          e.preventDefault();
          if (selectionRange && currentTime > selectionRange.start) {
            setSelectionRange({ start: selectionRange.start, end: currentTime });
            setIsPlaying(false);
          }
          break;
        
        case 'Escape':
          // Clear selection range
          e.preventDefault();
          setSelectionRange(null);
          setActiveAnnotationId(null);
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoSrc, currentTime, duration, selectionRange]);

  // Theme Effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Check for existing user on mount
  useEffect(() => {
    const initUser = async () => {
      const storedUser = getStoredUser();
      if (storedUser) {
        // Verify user still exists in database
        const dbUser = await getUser(storedUser.id);
        if (dbUser) {
          setCurrentUser(dbUser);
        } else {
          // User doesn't exist in DB, show onboarding
          setShowOnboarding(true);
        }
      } else {
        setShowOnboarding(true);
      }
      setIsUserLoading(false);
    };
    initUser();
  }, []);

  // Check Google Drive connection status once we have a user
  useEffect(() => {
    if (!currentUser) return;
    getDriveStatus(currentUser.id).then(setIsDriveConnected);
  }, [currentUser]);

  // Re-fetch annotations for the current video (used on load and manual refresh)
  const refreshAnnotations = useCallback(async () => {
    if (!videoId) return;
    const loaded = await getAnnotations(videoId);
    setAnnotations(loaded);
  }, [videoId]);

  // Load annotations when video loads (using content hash as ID)
  useEffect(() => {
    refreshAnnotations();
  }, [refreshAnnotations]);

  // Handle user creation from onboarding
  const handleUserCreate = async (name: string) => {
    try {
      setIsUserLoading(true);
      const user = await createUser(name);
      setCurrentUser(user);
      setShowOnboarding(false);
    } catch (error) {
      console.error('Failed to create user:', error);
      alert('Failed to create user. Please make sure the server is running.');
    } finally {
      setIsUserLoading(false);
    }
  };

  // Handle Range Selection from Timeline
  const handleRangeSelect = (range: { start: number; end: number } | null) => {
      setSelectionRange(range);
      if (range) {
          setIsPlaying(false);
          setActiveAnnotationId(null); // Deselect specific comment if creating a new range
      }
  };

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (time: number) => {
    videoPlayerRef.current?.seekTo(time);
    setCurrentTime(time);
  };

  const handleToolChange = (tool: 'pointer' | 'pen') => {
    setSelectedTool(tool);
    if (tool === 'pen') {
      setIsDrawingMode(true);
      setIsPlaying(false); 
      // Clear existing active drawing if we want to draw new stuff
      setActiveAnnotationId(null); 
      videoPlayerRef.current?.clearCanvas();
    } else {
      setIsDrawingMode(false);
    }
  };

  const clearCurrentDrawing = () => {
      videoPlayerRef.current?.clearCanvas();
  }

  const handleAddComment = async (text: string, attachments: Attachment[], parentId?: string) => {
    if (!videoId || !currentUser) return;

    // Get Drawing Data from Fabric via Ref
    const currentDrawing = videoPlayerRef.current?.getCanvasJSON();

    // Determine Start/End
    let start = currentTime;
    let end = currentTime;

    if (selectionRange) {
        start = selectionRange.start;
        end = selectionRange.end;
    } else if (currentDrawing) {
        // If there is a drawing, default to 3 seconds or max duration
        end = Math.min(start + 1, duration);
    }

    // If this is a reply, inherit the parent's time range
    if (parentId) {
      const parent = annotations.find(a => a.id === parentId);
      if (parent) {
        start = parent.startTime;
        end = parent.endTime;
      }
    }

    try {
      const newAnnotation = await saveAnnotation({
        videoId: videoId,
        userId: currentUser.id,
        parentId: parentId,
        startTime: start,
        endTime: end,
        author: currentUser,
        text: text,
        type: currentDrawing ? 'drawing' : 'comment',
        drawingData: currentDrawing || undefined,
        attachments: attachments,
        status: 'pending'
      });

      setAnnotations(prev => [...prev, newAnnotation].sort((a, b) => a.startTime - b.startTime));
      
      // Select the new annotation and seek to its start to ensure it's visible immediately
      setActiveAnnotationId(newAnnotation.id);
      videoPlayerRef.current?.seekTo(start);
      setCurrentTime(start);
      
      // Clear the selection range after adding comment
      setSelectionRange(null);
      
      // Reset drawing mode
      if (selectedTool === 'pen') {
        handleToolChange('pointer');
      } else {
          // Clear the canvas if we just submitted a drawing
          videoPlayerRef.current?.clearCanvas();
      }
    } catch (error) {
      console.error('Failed to save annotation:', error);
      alert('Failed to save annotation. Please make sure the server is running.');
    }
  };

  // Export annotations as JSON
  const handleExport = async () => {
    if (!videoId) return;
    try {
      const data = await exportAnnotations(videoId);
      downloadExportAsFile(data);
    } catch (error) {
      console.error('Failed to export:', error);
      alert('Failed to export annotations.');
    }
  };

  // Import annotations from JSON
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !videoId || !currentUser) return;

    try {
      const text = await file.text();
      const data: ExportData = JSON.parse(text);

      // Validate video hash matches
      if (data.videoHash !== videoId) {
        const confirm = window.confirm(
          `Warning: The imported annotations are for a different video.\n\n` +
          `Import file hash: ${data.videoHash.substring(0, 16)}...\n` +
          `Current video hash: ${videoId.substring(0, 16)}...\n\n` +
          `Do you want to import anyway?`
        );
        if (!confirm) return;
      }

      const result = await importAnnotations(videoId, data.annotations, currentUser.id);
      
      // Reload annotations
      const loaded = await getAnnotations(videoId);
      setAnnotations(loaded);
      
      alert(`Successfully imported ${result.imported} annotations!`);
    } catch (error) {
      console.error('Failed to import:', error);
      alert('Failed to import annotations. Make sure the file is valid JSON.');
    }

    // Reset input
    if (importInputRef.current) {
      importInputRef.current.value = '';
    }
  };

  const handleAnnotationSelect = (ann: Annotation) => {
    setActiveAnnotationId(ann.id);
    setIsPlaying(false);
    videoPlayerRef.current?.seekTo(ann.startTime);
    setCurrentTime(ann.startTime);
    setSelectionRange({ start: ann.startTime, end: ann.endTime });
    
    // If in drawing mode, exit it to view the annotation
    if (isDrawingMode) {
        setSelectedTool('pointer');
        setIsDrawingMode(false);
    }
  };

  const handleUpdateAnnotation = async (id: string, updates: { startTime?: number; endTime?: number; text?: string; status?: 'pending' | 'completed' }) => {
    try {
      const updated = await updateAnnotation(id, updates);
      
      // Update the annotations list
      setAnnotations(prev => prev.map(ann => ann.id === id ? updated : ann).sort((a, b) => a.startTime - b.startTime));
      
      // Update selection range if this annotation is active
      if (activeAnnotationId === id && updates.startTime !== undefined && updates.endTime !== undefined) {
        setSelectionRange({ start: updates.startTime, end: updates.endTime });
      }
    } catch (error) {
      console.error('Failed to update annotation:', error);
      alert('Failed to update annotation. Please make sure the server is running.');
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    try {
      await deleteAnnotation(id);
      
      // Remove the annotation and any replies from the list
      setAnnotations(prev => prev.filter(ann => ann.id !== id && ann.parentId !== id));
      
      // Clear active annotation if it was deleted
      if (activeAnnotationId === id) {
        setActiveAnnotationId(null);
        setSelectionRange(null);
      }
    } catch (error) {
      console.error('Failed to delete annotation:', error);
      alert('Failed to delete annotation. Please make sure the server is running.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Generate content hash for unique identification across machines
      const hash = await generateFastFileHash(file);
      
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setVideoId(hash); // Use hash as the unique video identifier
      setSubtitleSrc(null); 
      setAnnotations([]); 
      setIsPlaying(false);
      setCurrentTime(0);
      setSelectionRange(null);
    }
  };

  // Open the Google Drive OAuth popup and resolve once it reports success.
  const connectDrive = (): Promise<void> => {
    if (!currentUser) return Promise.reject(new Error('No user'));

    return new Promise((resolve, reject) => {
      const popup = window.open(
        getDriveAuthUrl(currentUser.id),
        'drive_oauth',
        'width=500,height=650'
      );

      if (!popup) {
        reject(new Error('Popup blocked'));
        return;
      }

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== API_ORIGIN) return;
        if (event.data?.type === 'drive-connected') {
          cleanup();
          setIsDriveConnected(true);
          resolve();
        } else if (event.data?.type === 'drive-error') {
          cleanup();
          reject(new Error(event.data?.message || 'Drive connection failed'));
        }
      };

      // Detect the user closing the popup without completing consent.
      const pollClosed = window.setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new Error('Popup closed before connecting'));
        }
      }, 500);

      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        window.clearInterval(pollClosed);
      };

      window.addEventListener('message', handleMessage);
    });
  };

  // Load a video from a pasted Google Drive share link.
  const handleLoadDriveLink = async (rawUrl: string) => {
    const fileId = extractDriveFileId(rawUrl);
    if (!fileId) {
      alert('Could not parse a Google Drive file link. Please paste a valid share link.');
      return;
    }

    if (!currentUser) return;

    // Connect Drive first if we haven't already.
    if (!isDriveConnected) {
      try {
        await connectDrive();
      } catch (error) {
        console.error('Drive connection failed:', error);
        alert('Could not connect to Google Drive. Please try again.');
        return;
      }
    }

    // Mirror handleFileUpload's reset, using the streaming proxy as the source
    // and the Drive file ID as the video identity.
    setVideoSrc(getDriveStreamUrl(fileId, currentUser.id));
    setVideoId(fileId);
    setSubtitleSrc(null);
    setAnnotations([]);
    setIsPlaying(false);
    setCurrentTime(0);
    setSelectionRange(null);
  };

  // Surface a token-revoked stream error and offer to reconnect.
  const handleVideoError = async () => {
    if (!videoId || !videoSrc) return;
    // Only Drive-sourced videos go through the backend stream endpoint.
    if (!videoSrc.includes('/drive/stream/')) return;

    setIsDriveConnected(false);
    const reconnect = window.confirm(
      'Could not load this Google Drive video. Your Drive connection may have expired. Reconnect?'
    );
    if (!reconnect || !currentUser) return;

    try {
      await connectDrive();
      // Force the <video> to re-request with a fresh token.
      setVideoSrc(getDriveStreamUrl(videoId, currentUser.id) + `&t=${Date.now()}`);
    } catch (error) {
      console.error('Drive reconnection failed:', error);
    }
  };

  const handleSubtitleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let vttContent: string;

    if (file.name.endsWith('.vtt')) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        vttContent = e.target?.result as string;
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        setSubtitleSrc(URL.createObjectURL(blob));
        setIsCaptionsEnabled(true);
        
        // Parse VTT for transcript
        const cues = parseVTT(vttContent);
        setTranscriptCues(cues);
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        vttContent = "WEBVTT\n\n" + content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        setSubtitleSrc(URL.createObjectURL(blob));
        setIsCaptionsEnabled(true);
        
        // Parse VTT for transcript
        const cues = parseVTT(vttContent);
        setTranscriptCues(cues);
      };
      reader.readAsText(file);
    }
  };

  // Handle getting visual suggestions from Gemini
  const handleGetVisualSuggestions = async () => {
    if (!selectionRange || transcriptCues.length === 0) return;

    try {
      setShowSuggestionsModal(true);
      setIsSuggestionsLoading(true);
      setSuggestions([]);

      const fullTranscript = getFullTranscript(transcriptCues);
      const selectionTranscript = getTranscriptForRange(
        transcriptCues,
        selectionRange.start,
        selectionRange.end
      );

      const result = await getVisualSuggestions(
        fullTranscript,
        selectionTranscript,
        selectionRange
      );

      setSuggestions(result);
    } catch (error) {
      console.error('Failed to get visual suggestions:', error);
      alert('Failed to get visual suggestions. Please make sure the server is running and GEMINI_API_KEY is configured.');
    } finally {
      setIsSuggestionsLoading(false);
    }
  };

  // Determine what drawing to show based on current time
  // We use a two-step memoization to prevent activeDrawing from changing reference on every frame update
  
  // Small tolerance for time comparison (handles video frame alignment issues)
  const TIME_EPSILON = 0.1; // 100ms tolerance
  
  // Helper to check if current time is within annotation range (with tolerance)
  const isTimeInRange = useCallback((time: number, start: number, end: number) => {
    return time >= (start - TIME_EPSILON) && time <= (end + TIME_EPSILON);
  }, []);
  
  // 1. Calculate a unique signature for the currently visible annotations
  const visibleAnnotationIdsString = useMemo(() => {
    if (isDrawingMode) return "";
    
    // Priority: Explicit selection
    if (activeAnnotationId) {
        const activeAnn = annotations.find(a => a.id === activeAnnotationId);
        if (activeAnn?.drawingData && isTimeInRange(currentTime, activeAnn.startTime, activeAnn.endTime)) {
            return activeAnn.id;
        }
        return "";
    }

    // Fallback: All visible annotations
    return annotations
        .filter(ann => ann.drawingData && isTimeInRange(currentTime, ann.startTime, ann.endTime))
        .map(ann => ann.id)
        .sort()
        .join(',');
  }, [activeAnnotationId, annotations, currentTime, isDrawingMode, isTimeInRange]);

  // 2. Generate the drawing object only when the signature changes
  const activeDrawing = useMemo(() => {
      if (!visibleAnnotationIdsString) return null;
      
      const ids = visibleAnnotationIdsString.split(',');
      const visibleAnns = annotations.filter(a => ids.includes(a.id));
      
      if (visibleAnns.length === 0) return null;
      
      // If only one, return it directly to preserve original structure
      if (visibleAnns.length === 1) {
          return visibleAnns[0].drawingData || null;
      }

      // If multiple, merge their objects
      const combinedObjects = visibleAnns.flatMap(ann => ann.drawingData?.objects || []);
      
      return {
          version: "5.3.0",
          objects: combinedObjects
      };
  }, [visibleAnnotationIdsString, annotations]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-black text-zinc-900 dark:text-white transition-colors duration-300">
      
      {/* Navbar */}
      <header className="h-16 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-6 shrink-0 z-30 transition-colors">
        <div className="flex items-center gap-4">
          <FrameNoteLogo />
          <div>
             <h1 className="font-bold text-lg leading-tight tracking-tight text-zinc-900 dark:text-white">Frame Note</h1>
             <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Video Annotations</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {videoSrc && (
             <>
             {!subtitleSrc ? (
                 <label className="cursor-pointer bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-200 px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 border border-zinc-200 dark:border-zinc-700">
                    <Captions className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                    <span className="hidden sm:inline">Add Captions</span>
                    <input type="file" accept=".vtt,.srt" className="hidden" onChange={handleSubtitleUpload} />
                 </label>
             ) : (
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsCaptionsEnabled(!isCaptionsEnabled)}
                        className={`p-1.5 rounded-md border transition-colors flex items-center gap-1.5 text-sm font-medium ${
                            isCaptionsEnabled 
                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/50' 
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                    >
                        {isCaptionsEnabled ? <Captions className="w-4 h-4" /> : <CaptionsOff className="w-4 h-4" />}
                        <span className="hidden sm:inline">{isCaptionsEnabled ? 'Captions On' : 'Captions Off'}</span>
                    </button>
                    
                    <label className="cursor-pointer p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 transition-colors">
                        <Upload className="w-4 h-4" /> 
                        <input type="file" accept=".vtt,.srt" className="hidden" onChange={handleSubtitleUpload} />
                    </label>
                </div>
             )}

             {/* Export/Import Buttons */}
             <div className="flex items-center gap-1">
                <button
                  onClick={handleExport}
                  className="p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors"
                  title="Export Annotations (JSON)"
                >
                  <Download className="w-4 h-4" />
                </button>
                <label className="p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors cursor-pointer" title="Import Annotations (JSON)">
                  <FileUp className="w-4 h-4" />
                  <input 
                    type="file" 
                    accept=".json" 
                    className="hidden" 
                    ref={importInputRef}
                    onChange={handleImportFile} 
                  />
                </label>
             </div>

             {currentUser && (
               <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800/50 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700/50">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">Collaborating as {currentUser.name}</span>
               </div>
             )}
             </>
          )}
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Editor Area */}
        <div className="flex-1 flex flex-col relative bg-zinc-50 dark:bg-zinc-950 transition-colors">
          
          {videoSrc ? (
            <>
              {/* Toolbar Overlay */}
              <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border border-zinc-200 dark:border-zinc-800 p-1.5 rounded-xl shadow-xl flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  active={selectedTool === 'pointer'}
                  onClick={() => handleToolChange('pointer')}
                  title="Select / Navigate"
                >
                  <MousePointer2 className="w-4 h-4" />
                </Button>
                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />
                <Button 
                  variant="ghost" 
                  size="icon"
                  active={selectedTool === 'pen'}
                  onClick={() => handleToolChange('pen')}
                  title="Draw Annotation (Pauses Video)"
                >
                  <Pen className="w-4 h-4" />
                </Button>
                
                {/* Additional controls when in drawing mode */}
                {isDrawingMode && (
                    <>
                    <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={clearCurrentDrawing}
                        title="Clear Canvas"
                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                    </>
                )}
                
                {/* Visual Suggestions Button - only show when captions are loaded and selection range exists */}
                {subtitleSrc && selectionRange && transcriptCues.length > 0 && (
                    <>
                    <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />
                    <Button
                        variant="ghost"
                        onClick={handleGetVisualSuggestions}
                        title="Get AI Visual Suggestions"
                        className="text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 flex items-center gap-1.5 px-3"
                    >
                        <Sparkles className="w-4 h-4" />
                        <span className="text-xs font-medium hidden sm:inline">Visual Ideas</span>
                    </Button>
                    </>
                )}
              </div>

              {/* Video Container */}
              <div className="flex-1 min-h-0 relative">
                 <VideoPlayer
                    ref={videoPlayerRef}
                    src={videoSrc}
                    subtitleSrc={subtitleSrc}
                    isCaptionsEnabled={isCaptionsEnabled}
                    isPaused={!isPlaying}
                    currentTime={currentTime}
                    isDrawingMode={isDrawingMode}
                    activeDrawing={activeDrawing}
                    playbackSpeed={playbackSpeed}
                    onTimeUpdate={handleTimeUpdate}
                    onDurationChange={setDuration}
                    togglePlay={togglePlay}
                    onError={handleVideoError}
                 />
              </div>

              {/* Timeline Container */}
              <div className="shrink-0 z-20">
                <Timeline
                  duration={duration}
                  currentTime={currentTime}
                  annotations={annotations}
                  selectionRange={selectionRange}
                  onSeek={handleSeek}
                  onRangeSelect={handleRangeSelect}
                />
                
                {/* Playback Controls */}
                <div className="h-14 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-6 transition-colors">
                   <div className="flex items-center gap-2 w-1/3">
                      <Button variant="ghost" size="icon" onClick={togglePlay}>
                        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                      </Button>
                   </div>
                   <div className="w-1/3 text-center">
                     <span className="text-zinc-500 font-mono text-xs tracking-widest">
                        {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')} 
                        <span className="text-zinc-400 dark:text-zinc-600"> / </span> 
                        {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
                     </span>
                   </div>
                   <div className="w-1/3 flex justify-end items-center gap-2">
                      {/* Playback Speed Control */}
                      <div className="flex items-center gap-1">
                        <select
                          value={playbackSpeed}
                          onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                          className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-xs font-mono text-zinc-600 dark:text-zinc-300 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          {PLAYBACK_SPEEDS.map(speed => (
                            <option key={speed} value={speed}>
                              {speed}x
                            </option>
                          ))}
                        </select>
                      </div>
                   </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 bg-zinc-50 dark:bg-zinc-950 dark:bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] dark:from-zinc-900 dark:via-zinc-950 dark:to-zinc-950 transition-colors">
               <div className="w-24 h-24 bg-white dark:bg-zinc-900 rounded-3xl flex items-center justify-center mb-6 border border-zinc-200 dark:border-zinc-800 shadow-xl">
                  <Upload className="w-10 h-10 text-zinc-400 dark:text-zinc-600" />
               </div>
               <h2 className="text-xl font-medium text-zinc-700 dark:text-zinc-300 mb-2">No Video Loaded</h2>
               <p className="text-sm max-w-xs text-center mb-8 text-zinc-500">
                 Upload a video file or load one from Google Drive to start annotating, reviewing, and collaborating with your team.
               </p>
               <label className="cursor-pointer bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-full text-sm font-medium transition-all shadow-lg shadow-purple-900/20 hover:scale-105 active:scale-95 flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Select Video File
                  <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
              </label>

              <div className="flex items-center gap-3 my-6 w-full max-w-md">
                 <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                 <span className="text-xs uppercase tracking-widest text-zinc-400 dark:text-zinc-600">or</span>
                 <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
              </div>

              <DriveLinkInput isConnected={isDriveConnected} onLoad={handleLoadDriveLink} />
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        {currentUser && (
          <Sidebar
            annotations={annotations}
            currentTime={currentTime}
            selectionRange={selectionRange}
            currentUser={currentUser}
            onAnnotationSelect={handleAnnotationSelect}
            onAddComment={handleAddComment}
            onUpdateAnnotation={handleUpdateAnnotation}
            onDeleteAnnotation={handleDeleteAnnotation}
            onRefresh={refreshAnnotations}
            activeAnnotationId={activeAnnotationId || undefined}
            isDrawingMode={isDrawingMode}
          />
        )}
        
      </main>

      {/* User Onboarding Modal */}
      {showOnboarding && (
        <UserOnboardingModal 
          onComplete={handleUserCreate}
          isLoading={isUserLoading}
        />
      )}

      {/* Visual Suggestions Modal */}
      {showSuggestionsModal && selectionRange && (
        <VisualSuggestionsModal
          suggestions={suggestions}
          isLoading={isSuggestionsLoading}
          onClose={() => setShowSuggestionsModal(false)}
          timeRange={selectionRange}
        />
      )}
    </div>
  );
}