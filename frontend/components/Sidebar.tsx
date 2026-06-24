import React, { useState, useEffect, useRef } from 'react';
import { Annotation, User, Attachment } from '../types';
import { Button } from './ui/Button';
import { MessageSquare, Clock, PenTool, Send, Paperclip, X, File, Image as ImageIcon, Edit2, Save, Trash2, Reply, ZoomIn, RotateCw, CheckCircle2, Circle } from 'lucide-react';

interface SidebarProps {
  annotations: Annotation[];
  currentTime: number;
  selectionRange: { start: number; end: number } | null;
  currentUser: User;
  onAnnotationSelect: (annotation: Annotation) => void;
  onAddComment: (text: string, attachments: Attachment[], parentId?: string) => void;
  onUpdateAnnotation: (id: string, updates: { startTime?: number; endTime?: number; text?: string; status?: 'pending' | 'completed' }) => void;
  onDeleteAnnotation: (id: string) => void;
  onRefresh?: () => Promise<void>;
  activeAnnotationId?: string;
  isDrawingMode: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  annotations,
  currentTime,
  selectionRange,
  onAnnotationSelect,
  onAddComment,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onRefresh,
  activeAnnotationId,
  isDrawingMode
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'comment' | 'attachment' | 'drawing'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [newComment, setNewComment] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<Attachment[]>([]);
  const [viewingImage, setViewingImage] = useState<{ url: string; name: string } | null>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatRange = (start: number, end: number) => {
      if (Math.abs(end - start) < 0.1) return formatTime(start);
      return `${formatTime(start)} - ${formatTime(end)}`;
  }

  const parseTimeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10) || 0;
      const secs = parseInt(parts[1], 10) || 0;
      return mins * 60 + secs;
    }
    return 0;
  };

  const handleStartEdit = (ann: Annotation) => {
    setEditingId(ann.id);
    setEditText(ann.text);
    setEditStartTime(formatTime(ann.startTime));
    setEditEndTime(formatTime(ann.endTime));
  };

  const handleSaveEdit = (annId: string) => {
    const startTime = parseTimeToSeconds(editStartTime);
    const endTime = parseTimeToSeconds(editEndTime);
    
    onUpdateAnnotation(annId, {
      text: editText,
      startTime,
      endTime,
    });
    
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
    setEditStartTime('');
    setEditEndTime('');
  };

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleToggleStatus = (ann: Annotation) => {
    onUpdateAnnotation(ann.id, { status: ann.status === 'completed' ? 'pending' : 'completed' });
  };

  // Distinct authors across all annotations (for the user filter)
  const authorOptions = Array.from(
    new Map<string, User>(annotations.map(a => [a.author.id, a.author])).values()
  );

  // Top-level comments after applying the active filters
  const visibleAnnotations = annotations.filter(ann => {
    if (ann.parentId) return false;
    if (typeFilter === 'comment' && ann.type !== 'comment') return false;
    if (typeFilter === 'attachment' && !(ann.attachments && ann.attachments.length > 0)) return false;
    if (typeFilter === 'drawing' && !(ann.type === 'drawing' || ann.drawingData)) return false;
    if (statusFilter !== 'all' && ann.status !== statusFilter) return false;
    if (userFilter !== 'all' && ann.author.id !== userFilter) return false;
    return true;
  });
  const totalTopLevel = annotations.filter(ann => !ann.parentId).length;
  const isFiltered = typeFilter !== 'all' || statusFilter !== 'all' || userFilter !== 'all';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && attachments.length === 0) return;
    onAddComment(newComment, attachments);
    setNewComment('');
    setAttachments([]);
    // Blur the textarea to allow keyboard shortcuts to work again
    textareaRef.current?.blur();
  };

  const handleReplySubmit = (parentId: string) => {
    if (!replyText.trim() && replyAttachments.length === 0) return;
    onAddComment(replyText, replyAttachments, parentId);
    setReplyText('');
    setReplyAttachments([]);
    setReplyingToId(null);
  };

  const handleDelete = (id: string, hasReplies: boolean) => {
    const message = hasReplies 
      ? 'This will delete the comment and all its replies. Are you sure?'
      : 'Are you sure you want to delete this comment?';
    
    if (window.confirm(message)) {
      onDeleteAnnotation(id);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          
          // Convert file to base64
          const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file); // This creates a base64 data URL
          });
          
          const newAttachment: Attachment = {
              id: Math.random().toString(36).substring(7),
              name: file.name,
              type: file.type.startsWith('image/') ? 'image' : 'file',
              url: base64 // Store as base64 data URL instead of blob URL
          };
          setAttachments(prev => [...prev, newAttachment]);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const handleReplyFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          
          const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
          });
          
          const newAttachment: Attachment = {
              id: Math.random().toString(36).substring(7),
              name: file.name,
              type: file.type.startsWith('image/') ? 'image' : 'file',
              url: base64
          };
          setReplyAttachments(prev => [...prev, newAttachment]);
      }
      if (replyFileInputRef.current) replyFileInputRef.current.value = '';
  }

  const removeAttachment = (id: string) => {
      setAttachments(prev => prev.filter(a => a.id !== id));
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
          if (item.type.startsWith('image/')) {
              e.preventDefault();
              const file = item.getAsFile();
              if (!file) continue;

              // Convert pasted image to base64
              const base64 = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
              });

              const newAttachment: Attachment = {
                  id: Math.random().toString(36).substring(7),
                  name: `pasted-image-${Date.now()}.${file.type.split('/')[1] || 'png'}`,
                  type: 'image',
                  url: base64
              };
              setAttachments(prev => [...prev, newAttachment]);
              break; // Only handle the first image
          }
      }
  }

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [annotations.length]);

  // Close image viewer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && viewingImage) {
        setViewingImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingImage]);

  return (
    <div className="w-96 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 flex flex-col h-full shrink-0 transition-colors">
      
      {/* Header */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-purple-600 dark:text-purple-500" />
            Comments
          </h2>
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 disabled:opacity-50 transition-colors"
              title="Refresh comments"
            >
              <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mt-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-purple-600"
            title="Filter by type"
          >
            <option value="all">All types</option>
            <option value="comment">Comments</option>
            <option value="attachment">Has attachment</option>
            <option value="drawing">Has drawing</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-purple-600"
            title="Filter by status"
          >
            <option value="all">All status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-purple-600"
            title="Filter by author"
          >
            <option value="all">All authors</option>
            {authorOptions.map(author => (
              <option key={author.id} value={author.id}>{author.name}</option>
            ))}
          </select>
        </div>
        <div className="text-xs text-zinc-500 mt-2">
          {isFiltered ? `${visibleAnnotations.length} of ${totalTopLevel} items` : `${totalTopLevel} items`}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {visibleAnnotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-zinc-400 dark:text-zinc-600 text-center">
            <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
            <p className="text-sm">{isFiltered ? 'No comments match the filters.' : 'No comments yet.'}</p>
          </div>
        ) : (
          visibleAnnotations.map((ann) => {
            const isEditing = editingId === ann.id;
            const isReplying = replyingToId === ann.id;
            const replies = annotations.filter(r => r.parentId === ann.id);
            const hasReplies = replies.length > 0;
            
            return (
            <div key={ann.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700/50 overflow-hidden">
              {/* Parent Comment */}
              <div 
                onClick={() => !isEditing && onAnnotationSelect(ann)}
                className={`group p-3 transition-all ${
                  !isEditing && 'cursor-pointer'
                } ${
                  activeAnnotationId === ann.id 
                    ? 'bg-purple-50 dark:bg-purple-900/20' 
                    : 'bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {ann.author.avatar ? (
                    <img 
                      src={ann.author.avatar} 
                      alt={ann.author.name} 
                      className="w-6 h-6 rounded-full ring-2 ring-white dark:ring-zinc-800"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full ring-2 ring-white dark:ring-zinc-800 bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                      {ann.author.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{ann.author.name}</span>
                </div>
                
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleSaveEdit(ann.id)}
                      className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400"
                      title="Save changes"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStatus(ann);
                      }}
                      className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium border transition-colors ${
                        ann.status === 'completed'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/30 hover:bg-green-200 dark:hover:bg-green-900/50'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                      }`}
                      title={ann.status === 'completed' ? 'Mark as pending' : 'Mark as completed'}
                    >
                      {ann.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                      <span>{ann.status === 'completed' ? 'Done' : 'Pending'}</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(ann);
                      }}
                      className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(ann.id, hasReplies);
                      }}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
                      activeAnnotationId === ann.id 
                        ? 'bg-purple-500 text-white' 
                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                    }`}>
                      {ann.type === 'drawing' ? <PenTool className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      <span className="font-mono">{formatRange(ann.startTime, ann.endTime)}</span>
                    </div>
                  </div>
                )}
              </div>
              
              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 rounded-lg p-2 text-sm text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-purple-600 focus:border-transparent focus:outline-none resize-none"
                    rows={3}
                    placeholder="Comment text..."
                  />
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">Start Time</label>
                      <input
                        type="text"
                        value={editStartTime}
                        onChange={(e) => setEditStartTime(e.target.value)}
                        placeholder="0:00"
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 rounded px-2 py-1 text-sm font-mono text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-purple-600 focus:border-transparent focus:outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">End Time</label>
                      <input
                        type="text"
                        value={editEndTime}
                        onChange={(e) => setEditEndTime(e.target.value)}
                        placeholder="0:00"
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 rounded px-2 py-1 text-sm font-mono text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-purple-600 focus:border-transparent focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                    {ann.text}
                  </p>

                  {/* Attachments List */}
                  {ann.attachments && ann.attachments.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                          {ann.attachments.map(att => (
                              <div key={att.id} className="relative group/att">
                                  {att.type === 'image' ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setViewingImage({ url: att.url, name: att.name });
                                        }}
                                        className="relative cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-md"
                                      >
                                        <img src={att.url} alt={att.name} className="w-16 h-16 object-cover rounded-md border border-zinc-200 dark:border-zinc-700" />
                                        <div className="absolute inset-0 bg-black/0 group-hover/att:bg-black/40 rounded-md transition-all flex items-center justify-center">
                                          <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover/att:opacity-100 transition-opacity" />
                                        </div>
                                      </button>
                                  ) : (
                                      <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700 flex flex-col items-center justify-center text-zinc-500">
                                          <File className="w-6 h-6" />
                                          <span className="text-[9px] mt-1 w-full text-center truncate px-1">{att.name}</span>
                                      </div>
                                  )}
                              </div>
                          ))}
                      </div>
                  )}
                  
                  <div className="mt-2 text-[10px] text-zinc-400 dark:text-zinc-500 flex justify-between items-center">
                    <span>{new Date(ann.createdAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-2">
                      {ann.drawingData && <span className="text-emerald-500 flex items-center gap-1">Has Drawing</span>}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setReplyingToId(ann.id);
                        }}
                        className="flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
                      >
                        <Reply className="w-3 h-3" />
                        <span>Reply</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
              </div>

              {/* Reply Input */}
              {isReplying && (
                <div className="p-3 bg-zinc-100/50 dark:bg-zinc-800/30 border-t border-zinc-200 dark:border-zinc-700">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-1">
                    <Reply className="w-3 h-3" />
                    Replying to {ann.author.name}
                  </div>
                
                {replyAttachments.length > 0 && (
                  <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
                    {replyAttachments.map(att => (
                      <div key={att.id} className="relative shrink-0">
                        {att.type === 'image' ? (
                          <img src={att.url} className="w-12 h-12 object-cover rounded border border-zinc-200 dark:border-zinc-700" />
                        ) : (
                          <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center rounded border border-zinc-200 dark:border-zinc-700">
                            <File className="w-5 h-5 text-zinc-400" />
                          </div>
                        )}
                        <button 
                          type="button"
                          onClick={() => setReplyAttachments(prev => prev.filter(a => a.id !== att.id))}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Write a reply..."
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 rounded-lg p-2 pr-8 text-sm text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-purple-600 focus:border-transparent focus:outline-none resize-none"
                      rows={2}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleReplySubmit(ann.id);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => replyFileInputRef.current?.click()}
                      className="absolute bottom-2 right-2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                      title="Attach file"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                    </button>
                    <input 
                      type="file" 
                      ref={replyFileInputRef} 
                      className="hidden" 
                      onChange={handleReplyFileSelect}
                      accept="image/*,.pdf,.doc,.docx" 
                    />
                  </div>
                  <Button 
                    onClick={() => handleReplySubmit(ann.id)}
                    variant="primary" 
                    size="icon"
                    className="h-auto self-end"
                    disabled={!replyText.trim() && replyAttachments.length === 0}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                  <Button 
                    onClick={() => {
                      setReplyingToId(null);
                      setReplyText('');
                      setReplyAttachments([]);
                    }}
                    variant="ghost" 
                    size="icon"
                    className="h-auto self-end"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}

              {/* Replies */}
              {replies.length > 0 && (
                <div className="border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/20">
                  <div className="px-3 py-2 text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide font-medium flex items-center gap-1">
                    <Reply className="w-3 h-3" />
                    {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
                  </div>
                  <div className="space-y-0 divide-y divide-zinc-200 dark:divide-zinc-700/50">
                    {replies.map(reply => {
                      const isEditingReply = editingId === reply.id;
                      
                      return (
                        <div
                          key={reply.id}
                          onClick={() => !isEditingReply && onAnnotationSelect(reply)}
                          className={`group p-3 pl-6 transition-all text-sm ${
                            !isEditingReply && 'cursor-pointer'
                          } ${
                            activeAnnotationId === reply.id 
                              ? 'bg-purple-50 dark:bg-purple-900/20' 
                              : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          {reply.author.avatar ? (
                            <img 
                              src={reply.author.avatar} 
                              alt={reply.author.name} 
                              className="w-5 h-5 rounded-full ring-1 ring-white dark:ring-zinc-800"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full ring-1 ring-white dark:ring-zinc-800 bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
                              {reply.author.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">{reply.author.name}</span>
                        </div>
                        
                        {!isEditingReply && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(reply);
                              }}
                              className="p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Edit"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(reply.id, false);
                              }}
                              className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {isEditingReply ? (
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 rounded p-2 text-xs text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-purple-600 focus:border-transparent focus:outline-none resize-none"
                            rows={2}
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleSaveEdit(reply.id)}
                              className="px-2 py-1 rounded text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-2 py-1 rounded text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                            {reply.text}
                          </p>
                          
                          {reply.attachments && reply.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {reply.attachments.map(att => (
                                <div key={att.id} className="relative group/replyatt">
                                  {att.type === 'image' ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setViewingImage({ url: att.url, name: att.name });
                                      }}
                                      className="relative cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 rounded"
                                    >
                                      <img src={att.url} alt={att.name} className="w-12 h-12 object-cover rounded border border-zinc-200 dark:border-zinc-700" />
                                      <div className="absolute inset-0 bg-black/0 group-hover/replyatt:bg-black/40 rounded transition-all flex items-center justify-center">
                                        <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover/replyatt:opacity-100 transition-opacity" />
                                      </div>
                                    </button>
                                  ) : (
                                    <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700 flex flex-col items-center justify-center text-zinc-500">
                                      <File className="w-4 h-4" />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <div className="mt-1 text-[9px] text-zinc-400 dark:text-zinc-500">
                            {new Date(reply.createdAt).toLocaleDateString()}
                          </div>
                        </>
                      )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            );
          })
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex items-center justify-between mb-2 text-xs text-zinc-500">
            <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded font-mono ${
                    selectionRange 
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30' 
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                }`}>
                {selectionRange 
                    ? `${formatTime(selectionRange.start)} - ${formatTime(selectionRange.end)}`
                    : formatTime(currentTime)
                }
                </span>
                <span>
                {isDrawingMode ? 'Drawing' : (selectionRange ? 'Range Selected' : 'Current Frame')}
                </span>
            </div>
            {attachments.length > 0 && <span>{attachments.length} attached</span>}
          </div>

          {/* New Attachments Preview */}
          {attachments.length > 0 && (
              <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
                  {attachments.map(att => (
                      <div key={att.id} className="relative shrink-0">
                          {att.type === 'image' ? (
                               <img src={att.url} className="w-12 h-12 object-cover rounded border border-zinc-200 dark:border-zinc-700" />
                          ) : (
                              <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center rounded border border-zinc-200 dark:border-zinc-700">
                                  <File className="w-5 h-5 text-zinc-400" />
                              </div>
                          )}
                          <button 
                             type="button"
                             onClick={() => removeAttachment(att.id)}
                             className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                          >
                              <X className="w-3 h-3" />
                          </button>
                      </div>
                  ))}
              </div>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
                <textarea
                ref={textareaRef}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 pr-10 text-sm text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-purple-600 focus:border-transparent focus:outline-none resize-none placeholder-zinc-400 dark:placeholder-zinc-600"
                placeholder={isDrawingMode ? "Describe your drawing..." : "Add a comment... (paste images with Ctrl+V)"}
                rows={3}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                    }
                }}
                onPaste={handlePaste}
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-2 right-2 p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-white bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                    title="Attach file"
                >
                    <Paperclip className="w-4 h-4" />
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileSelect}
                    accept="image/*,.pdf,.doc,.docx" 
                />
            </div>
            <Button 
              type="submit" 
              variant="primary" 
              className="h-auto self-end mb-1"
              disabled={!newComment.trim() && attachments.length === 0}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </div>

      {/* Image Viewer Modal */}
      {viewingImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setViewingImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full">
            <button
              onClick={() => setViewingImage(null)}
              className="absolute -top-10 right-0 p-2 text-white/70 hover:text-white transition-colors"
              title="Close"
            >
              <X className="w-6 h-6" />
            </button>
            <img 
              src={viewingImage.url} 
              alt={viewingImage.name}
              className="w-full h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute -bottom-8 left-0 right-0 text-center text-white/70 text-sm truncate">
              {viewingImage.name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};