import React, { useState } from 'react';
import { Cloud, Link2 } from 'lucide-react';

interface DriveLinkInputProps {
  isConnected: boolean;
  // Receives the raw pasted link; the parent handles file-ID extraction,
  // the OAuth connect flow (if needed), and loading the video.
  onLoad: (rawUrl: string) => void | Promise<void>;
  variant?: 'full' | 'compact';
}

export const DriveLinkInput: React.FC<DriveLinkInputProps> = ({
  isConnected,
  onLoad,
  variant = 'full',
}) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isLoading) return;
    setIsLoading(true);
    try {
      await onLoad(url);
      setUrl('');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClasses =
    'flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500';

  if (variant === 'compact') {
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Google Drive link"
          className={`${inputClasses} w-48 py-1.5`}
        />
        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-200 px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 border border-zinc-200 dark:border-zinc-700 disabled:opacity-50 disabled:pointer-events-none"
        >
          <Cloud className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <span className="hidden sm:inline">{isLoading ? 'Loading…' : 'Load'}</span>
        </button>
      </form>
    );
  }

  return (
    <div className="w-full max-w-md flex flex-col items-center gap-2">
      <form onSubmit={handleSubmit} className="w-full flex items-center gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a Google Drive video link"
          className={inputClasses}
        />
        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="cursor-pointer bg-zinc-800 dark:bg-zinc-700 hover:bg-zinc-700 dark:hover:bg-zinc-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
        >
          {isConnected ? <Link2 className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
          {isLoading ? 'Loading…' : isConnected ? 'Load' : 'Connect & Load'}
        </button>
      </form>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        {isConnected
          ? 'Google Drive connected'
          : 'You’ll be asked to connect Google Drive the first time'}
      </p>
    </div>
  );
};
