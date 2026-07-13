import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { DrawingPath } from '../types';
import { Play } from 'lucide-react';
import * as fabricWrapper from 'fabric';

// Resolve fabric instance from potential ESM export shapes
const fabric = (fabricWrapper as any).fabric || (fabricWrapper as any).default || fabricWrapper;

interface VideoPlayerProps {
  src: string;
  subtitleSrc?: string | null;
  isCaptionsEnabled?: boolean;
  isDrawingMode: boolean;
  isPaused: boolean;
  currentTime: number;
  // We now receive a single drawing object to render (active annotation), or null
  activeDrawing: DrawingPath | null;
  playbackSpeed?: number;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  togglePlay: () => void;
  onError?: () => void;
}

export interface VideoPlayerRef {
  seekTo: (time: number) => void;
  getCanvasJSON: () => DrawingPath | null;
  clearCanvas: () => void;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({
  src,
  subtitleSrc,
  isCaptionsEnabled = true,
  isDrawingMode,
  isPaused,
  currentTime,
  activeDrawing,
  playbackSpeed = 1,
  onTimeUpdate,
  onDurationChange,
  togglePlay,
  onError
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Use any for the canvas ref to avoid TypeScript issues
  const fabricCanvasRef = useRef<any>(null);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    },
    getCanvasJSON: () => {
      if (!fabricCanvasRef.current) return null;
      const json = fabricCanvasRef.current.toJSON();
      // Only return if there are actual objects
      if (json.objects && json.objects.length > 0) {
        return json as DrawingPath;
      }
      return null;
    },
    clearCanvas: () => {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.clear();
      }
    }
  }));

  // Initialize Fabric Canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    
    // Safety check if fabric loaded correctly
    if (!fabric || !fabric.Canvas) {
        console.error("Fabric.js not loaded correctly", fabric);
        return;
    }

    // Create fabric canvas
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      selection: true, // Allow selecting to delete
    });

    // Configure Brush
    if (fabric.PencilBrush) {
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.width = 4;
        canvas.freeDrawingBrush.color = '#a855f7'; // Purple-600
    }

    fabricCanvasRef.current = canvas;

    // Handle Resize
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && fabricCanvasRef.current) {
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        
        // Scale objects to match new size (optional, but good for responsiveness)
        fabricCanvasRef.current.setDimensions({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);

    // Keyboard listener for deletion
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Backspace' || e.key === 'Delete') {
            const activeObjects = canvas.getActiveObjects();
            if (activeObjects.length) {
                canvas.discardActiveObject();
                activeObjects.forEach((obj: any) => {
                    canvas.remove(obj);
                });
            }
        }
    }
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      canvas.dispose();
    };
  }, []);

  // Sync Drawing Mode
  useEffect(() => {
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.isDrawingMode = isDrawingMode;
      // If entering drawing mode, deselect everything
      if (isDrawingMode) {
          fabricCanvasRef.current.discardActiveObject();
          fabricCanvasRef.current.requestRenderAll();
      }
    }
  }, [isDrawingMode]);

  // Track the last loaded drawing ID to detect actual changes
  const lastLoadedDrawingRef = useRef<string | null>(null);
  
  // Load Active Drawing (when clicking an annotation in sidebar or when annotation becomes visible)
  useEffect(() => {
    if (!fabricCanvasRef.current) return;

    // Create a unique key for the current drawing to detect actual changes
    const drawingKey = activeDrawing ? JSON.stringify(activeDrawing) : null;

    if (activeDrawing) {
      // Only reload if the drawing actually changed
      if (lastLoadedDrawingRef.current !== drawingKey) {
        lastLoadedDrawingRef.current = drawingKey;
        // Load saved drawing
        fabricCanvasRef.current.loadFromJSON(activeDrawing, () => {
          fabricCanvasRef.current?.renderAll();
          // Make objects read-only if we are NOT in drawing mode
          if (!isDrawingMode) {
               fabricCanvasRef.current?.getObjects().forEach((obj: any) => {
                   obj.selectable = false;
                   obj.evented = false;
                   // Fix for touch/pointer events passing through
                   obj.hasControls = false;
                   obj.hasBorders = false;
                   obj.lockMovementX = true;
                   obj.lockMovementY = true;
               });
          }
        });
      }
    } else if (!isDrawingMode) {
       // Clear if no active drawing and not currently drawing new one
       lastLoadedDrawingRef.current = null;
       fabricCanvasRef.current.clear();
    }
  }, [activeDrawing, isDrawingMode]);

  // Handle Play/Pause
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPaused) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(e => console.log("Autoplay prevented"));
      // Note: Don't clear canvas here - the activeDrawing effect handles
      // showing/hiding drawings based on currentTime and annotation ranges
    }
  }, [isPaused]);

  // Handle Subtitles
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !subtitleSrc) return;

    const updateTrackMode = () => {
        if (video.textTracks && video.textTracks[0]) {
            video.textTracks[0].mode = isCaptionsEnabled ? 'showing' : 'hidden';
        }
    };
    updateTrackMode();
    const timer = setTimeout(updateTrackMode, 100);
    return () => clearTimeout(timer);
  }, [subtitleSrc, isCaptionsEnabled]);

  // Handle Playback Speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full bg-black flex items-center justify-center overflow-hidden group`}
    >
      <video
        ref={videoRef}
        src={src}
        className="max-w-full max-h-full"
        onTimeUpdate={() => videoRef.current && onTimeUpdate(videoRef.current.currentTime)}
        onLoadedMetadata={() => videoRef.current && onDurationChange(videoRef.current.duration)}
        onError={() => onError?.()}
        onClick={togglePlay}
        crossOrigin="anonymous"
      >
         {subtitleSrc && (
            <track 
                kind="captions" 
                src={subtitleSrc} 
                srcLang="en" 
                label="English" 
                default 
            />
        )}
      </video>

       {/* Canvas Overlay */}
       <div className="absolute inset-0 z-10 pointer-events-none">
          {/* Wrap canvas in a div that handles pointer events based on mode. 
              If NOT in drawing mode, we disable pointer events so clicks pass through to video for pausing. */}
          <div className={`w-full h-full ${isDrawingMode ? 'pointer-events-auto' : 'pointer-events-none'}`}>
             <canvas ref={canvasRef} />
          </div>
       </div>

      {isPaused && !isDrawingMode && !activeDrawing && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none group-hover:bg-black/10 transition-colors z-0"
        >
          <div className="p-4 rounded-full bg-white/10 backdrop-blur-sm shadow-xl">
             <Play className="w-8 h-8 text-white fill-white" />
          </div>
        </div>
      )}
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';