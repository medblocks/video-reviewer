import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Annotation } from '../types';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface TimelineProps {
  duration: number;
  currentTime: number;
  annotations: Annotation[];
  selectionRange: { start: number; end: number } | null;
  onSeek: (time: number) => void;
  onRangeSelect: (range: { start: number; end: number } | null) => void;
}

type DragMode = 'none' | 'create' | 'extend-start' | 'extend-end';

// Zoom levels: 1x, 2x, 4x, 8x, 16x
const ZOOM_LEVELS = [1, 2, 4, 8, 16];

const TimelineComponent: React.FC<TimelineProps> = ({
  duration,
  currentTime, 
  annotations,
  selectionRange,
  onSeek,
  onRangeSelect
}) => {
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [localHoverTime, setLocalHoverTime] = useState<number | null>(null);
  const [tempRange, setTempRange] = useState<{ start: number; end: number } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  // Zoom state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCenter, setZoomCenter] = useState(0); // Center of zoom window in seconds
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Calculate visible time window based on zoom
  const visibleDuration = duration / zoomLevel;
  const viewStart = Math.max(0, zoomCenter - visibleDuration / 2);
  const viewEnd = Math.min(duration, viewStart + visibleDuration);
  const actualViewStart = viewEnd === duration ? Math.max(0, duration - visibleDuration) : viewStart;
  const actualViewEnd = actualViewStart + visibleDuration;

  // Keep zoom centered on current time when zooming
  const handleZoomIn = useCallback(() => {
    const currentIdx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (currentIdx < ZOOM_LEVELS.length - 1) {
      setZoomLevel(ZOOM_LEVELS[currentIdx + 1]);
      setZoomCenter(currentTime);
    }
  }, [zoomLevel, currentTime]);

  const handleZoomOut = useCallback(() => {
    const currentIdx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (currentIdx > 0) {
      setZoomLevel(ZOOM_LEVELS[currentIdx - 1]);
      setZoomCenter(currentTime);
    }
  }, [zoomLevel, currentTime]);

  const handleResetZoom = useCallback(() => {
    setZoomLevel(1);
    setZoomCenter(duration / 2);
  }, [duration]);

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    }
  }, [handleZoomIn, handleZoomOut]);

  // Keep playhead visible when zoomed
  useEffect(() => {
    if (zoomLevel > 1) {
      if (currentTime < actualViewStart || currentTime > actualViewEnd) {
        setZoomCenter(currentTime);
      }
    }
  }, [currentTime, zoomLevel, actualViewStart, actualViewEnd]);

  const getTimeFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!timelineRef.current || duration === 0) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    // Convert to time based on current zoom window
    const relativeTime = (x / rect.width) * visibleDuration;
    return Math.max(0, Math.min(duration, actualViewStart + relativeTime));
  }, [duration, visibleDuration, actualViewStart]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const time = getTimeFromEvent(e);
    setDragMode('create');
    setDragStart(time);
    setTempRange(null);
  };

  // Handle extending range from the start handle
  const handleStartHandleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectionRange) return;
    setDragMode('extend-start');
    setTempRange({ ...selectionRange });
  };

  // Handle extending range from the end handle
  const handleEndHandleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectionRange) return;
    setDragMode('extend-end');
    setTempRange({ ...selectionRange });
  };

  // Global mouse move and mouse up handlers for smooth dragging
  useEffect(() => {
    if (dragMode === 'none') return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const time = getTimeFromEvent(e);
      setLocalHoverTime(time);

      if (dragMode === 'extend-start' && tempRange) {
        // Extend from start, but don't let it go past end
        const newStart = Math.min(time, tempRange.end - 0.05);
        setTempRange({ start: Math.max(0, newStart), end: tempRange.end });
      } else if (dragMode === 'extend-end' && tempRange) {
        // Extend from end, but don't let it go before start
        const newEnd = Math.max(time, tempRange.start + 0.05);
        setTempRange({ start: tempRange.start, end: Math.min(duration, newEnd) });
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      const time = getTimeFromEvent(e);

      if (dragMode === 'create' && dragStart !== null) {
        if (Math.abs(time - dragStart) < 0.1) {
          // Single click - just seek without modifying selection range
          onSeek(time);
        } else {
          // Drag to create range
          const start = Math.min(dragStart, time);
          const end = Math.max(dragStart, time);
          onRangeSelect({ start, end });
          onSeek(start);
        }
      } else if ((dragMode === 'extend-start' || dragMode === 'extend-end') && tempRange) {
        onRangeSelect(tempRange);
        onSeek(tempRange.start);
      }

      setDragMode('none');
      setDragStart(null);
      setTempRange(null);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragMode, dragStart, tempRange, duration, getTimeFromEvent, onSeek, onRangeSelect]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const time = getTimeFromEvent(e);
    setLocalHoverTime(time);
  };

  // Format time with milliseconds for precision
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  // Format time without milliseconds for display
  const formatTimeShort = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate percentages relative to the zoomed view
  const getZoomedPercent = useCallback((time: number) => {
    if (visibleDuration === 0) return 0;
    return ((time - actualViewStart) / visibleDuration) * 100;
  }, [actualViewStart, visibleDuration]);

  const progressPercent = getZoomedPercent(currentTime);
  
  // Use temp range while dragging handles, otherwise use selection range
  const displayRange = tempRange || selectionRange;
  const selectionStyle = useSelectionStyleZoomed(displayRange, dragStart, localHoverTime, dragMode === 'create', actualViewStart, visibleDuration);

  return (
    <div className="w-full h-24 flex flex-col justify-center px-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 select-none transition-colors">
      {/* Top info bar */}
      <div className="flex justify-between items-center text-xs text-zinc-400 dark:text-zinc-500 mb-1 font-mono">
        <span>{formatTimeShort(actualViewStart)}</span>
        
        <div className="flex items-center gap-2">
          {displayRange && (
            <span className="text-purple-500 dark:text-purple-400">
              Range: {formatTime(displayRange.start)} → {formatTime(displayRange.end)} 
              <span className="text-zinc-500 ml-2">({((displayRange.end - displayRange.start) * 1000).toFixed(0)}ms)</span>
            </span>
          )}
          
          {/* Zoom controls */}
          <div className="flex items-center gap-1 ml-2 border-l border-zinc-200 dark:border-zinc-700 pl-2">
            <button 
              onClick={handleZoomOut}
              disabled={zoomLevel === 1}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] min-w-[32px] text-center font-semibold text-zinc-500">{zoomLevel}x</span>
            <button 
              onClick={handleZoomIn}
              disabled={zoomLevel === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Zoom in (Ctrl+Scroll)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {zoomLevel > 1 && (
              <button 
                onClick={handleResetZoom}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ml-1"
                title="Reset zoom"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        
        <span>{formatTimeShort(actualViewEnd)}</span>
      </div>
      
      {/* Keyboard hint */}
      <div className="text-[10px] text-zinc-400 dark:text-zinc-600 mb-1 text-center pointer-events-none">
        <span className="opacity-70">
          <kbd className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-500">A</kbd> set start
          <span className="mx-1.5">·</span>
          <kbd className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-500">S</kbd> set end & pause
          <span className="mx-1.5">·</span>
          <kbd className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-500">Q</kbd> snap start
          <span className="mx-1.5">·</span>
          <kbd className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-500">W</kbd> snap end
        </span>
      </div>
      
      <div 
        ref={timelineRef}
        className="relative w-full h-8 flex items-center cursor-pointer group"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
            setLocalHoverTime(null);
        }}
        onWheel={handleWheel}
      >
        {/* Track Background */}
        <div className="absolute w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          {/* Played Progress */}
          <div 
            className="h-full bg-zinc-400/50 dark:bg-zinc-600/50"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Existing Annotation Markers - only show if in visible range */}
        {annotations.map((ann) => {
           // Check if annotation is visible in current zoom window
           if (ann.endTime < actualViewStart || ann.startTime > actualViewEnd) return null;
           
           const startPct = getZoomedPercent(Math.max(ann.startTime, actualViewStart));
           const endPct = getZoomedPercent(Math.min(ann.endTime, actualViewEnd));
           const widthPct = endPct - startPct;
           const isRange = widthPct > 0.5;

           return isRange ? (
             <div 
                key={ann.id}
                className={`absolute h-1.5 top-1/2 -mt-0.75 z-10 opacity-60 pointer-events-none
                   ${ann.type === 'drawing' ? 'bg-emerald-500' : 'bg-yellow-500'}
                `}
                style={{ left: `${startPct}%`, width: `${widthPct}%` }}
             />
           ) : (
             <div
                key={ann.id}
                className={`absolute w-1 h-3 rounded-full transform -translate-x-1/2 top-1/2 -mt-1.5 z-10 transition-all
                  ${ann.type === 'drawing' ? 'bg-emerald-500' : 'bg-yellow-500'}
                  group-hover:h-4 group-hover:z-20
                `}
                style={{ left: `${startPct}%` }}
              />
           );
        })}

        {/* Current Active Selection Range with drag handles */}
        {selectionStyle && (
            <div 
                className="absolute h-full top-0 bg-purple-500/30 z-10"
                style={{ left: `${selectionStyle.left}%`, width: `${selectionStyle.width}%` }}
            >
              {/* Left handle - extend start */}
              <div 
                className="absolute left-0 top-0 h-full w-2 bg-purple-500 cursor-ew-resize hover:bg-purple-600 transition-colors flex items-center justify-center group/handle"
                onMouseDown={handleStartHandleMouseDown}
              >
                <div className="w-0.5 h-3 bg-white/60 rounded-full group-hover/handle:bg-white/80" />
              </div>
              {/* Right handle - extend end */}
              <div 
                className="absolute right-0 top-0 h-full w-2 bg-purple-500 cursor-ew-resize hover:bg-purple-600 transition-colors flex items-center justify-center group/handle"
                onMouseDown={handleEndHandleMouseDown}
              >
                <div className="w-0.5 h-3 bg-white/60 rounded-full group-hover/handle:bg-white/80" />
              </div>
            </div>
        )}

        {/* Playhead */}
        <div 
          className="absolute w-3 h-3 bg-purple-600 dark:bg-white rounded-full shadow-md transform -translate-x-1/2 pointer-events-none z-30 ring-2 ring-white dark:ring-0"
          style={{ left: `${progressPercent}%` }}
        />
        
        {/* Playhead Line */}
        <div 
            className="absolute w-px h-6 bg-purple-600/50 dark:bg-white/50 transform -translate-x-1/2 pointer-events-none z-20"
            style={{ left: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};

export const Timeline = React.memo(TimelineComponent);

function useSelectionStyleZoomed(
    selectionRange: { start: number; end: number } | null,
    dragStart: number | null,
    localHoverTime: number | null,
    isCreating: boolean,
    viewStart: number,
    visibleDuration: number
) {
    if (visibleDuration === 0) return null;

    let start = 0;
    let end = 0;

    if (isCreating && dragStart !== null && localHoverTime !== null) {
        start = Math.min(dragStart, localHoverTime);
        end = Math.max(dragStart, localHoverTime);
    } else if (selectionRange) {
        start = selectionRange.start;
        end = selectionRange.end;
    } else {
        return null;
    }

    // Check if selection is visible in current view
    const viewEnd = viewStart + visibleDuration;
    if (end < viewStart || start > viewEnd) return null;

    // Clamp to visible range
    const clampedStart = Math.max(start, viewStart);
    const clampedEnd = Math.min(end, viewEnd);

    const left = ((clampedStart - viewStart) / visibleDuration) * 100;
    const width = ((clampedEnd - clampedStart) / visibleDuration) * 100;

    // Ensure minimum visible width
    const minWidth = 0.5;
    const adjustedWidth = Math.max(width, minWidth);

    return { left, width: adjustedWidth };
}