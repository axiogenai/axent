import React from 'react';
import {
  Maximize2,
  Minimize2,
  Video,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Terminal
} from 'lucide-react';

interface ExtendedToolbarProps {
  showStdin: boolean;
  onToggleStdin: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isScreenSharing: boolean;
  onToggleScreenShare: () => void;
  isLocked?: boolean;
  isConsoleOpen?: boolean;
  onToggleConsole?: () => void;
  hasOutput?: boolean;
}

export const ExtendedToolbar: React.FC<ExtendedToolbarProps> = ({
  showStdin,
  onToggleStdin,
  isFullscreen,
  onToggleFullscreen,
  isScreenSharing,
  onToggleScreenShare,
  isLocked = false,
  isConsoleOpen = false,
  onToggleConsole,
  hasOutput = false,
}) => {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '7px',
        padding: '2px',
        gap: '2px',
        userSelect: 'none',
      }}
    >
      {/* Primary Action 1: Custom Input */}
      <button
        onClick={onToggleStdin}
        disabled={isLocked}
        title="Toggle Custom Standard Input (stdin) drawer"
        className="btn btn-ghost btn-sm"
        style={{
          height: '26px',
          padding: '0 8px',
          fontSize: '11px',
          gap: '4px',
          borderRadius: '5px',
          background: showStdin ? 'var(--bg-surface)' : 'transparent',
          border: showStdin ? '1px solid var(--border-strong)' : '1px solid transparent',
          color: showStdin ? 'var(--accent)' : 'var(--text-secondary)',
          fontWeight: showStdin ? 700 : 500,
        }}
      >
        <SlidersHorizontal size={12} color={showStdin ? 'var(--accent)' : 'currentColor'} />
        <span>Input</span>
        {showStdin ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {/* Action: Toggle Console & Diagnostics Panel */}
      {onToggleConsole && (
        <button
          onClick={onToggleConsole}
          disabled={isLocked}
          title={isConsoleOpen ? 'Hide Console & Diagnostics Panel' : 'Show Console & Diagnostics Panel'}
          className="btn btn-ghost btn-sm"
          style={{
            height: '26px',
            padding: '0 8px',
            fontSize: '11px',
            gap: '4px',
            borderRadius: '5px',
            background: isConsoleOpen ? 'var(--bg-surface)' : 'transparent',
            border: isConsoleOpen ? '1px solid var(--border-strong)' : '1px solid transparent',
            color: isConsoleOpen ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: isConsoleOpen ? 700 : 500,
          }}
        >
          <Terminal size={12} color={isConsoleOpen ? 'var(--accent)' : 'currentColor'} />
          <span>Console</span>
          {hasOutput && !isConsoleOpen && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--accent)',
                display: 'inline-block'
              }}
            />
          )}
        </button>
      )}

      {/* Primary Action 2: CCTV Screen Share */}
      <button
        onClick={onToggleScreenShare}
        title={
          isScreenSharing
            ? 'Live CCTV screen sharing active. Click to stop.'
            : 'Share screen to Invigilator CCTV control room'
        }
        className="btn btn-ghost btn-sm"
        style={{
          height: '26px',
          padding: '0 8px',
          fontSize: '11px',
          gap: '4px',
          borderRadius: '5px',
          background: isScreenSharing ? 'var(--danger-bg)' : 'transparent',
          border: isScreenSharing ? '1px solid var(--danger-border)' : '1px solid transparent',
          color: isScreenSharing ? 'var(--danger)' : 'var(--text-secondary)',
          fontWeight: isScreenSharing ? 700 : 500,
        }}
      >
        <Video size={12} />
        <span>{isScreenSharing ? 'CCTV On' : 'CCTV'}</span>
      </button>

      {/* Primary Action 3: Kiosk Fullscreen */}
      <button
        onClick={onToggleFullscreen}
        disabled={isLocked}
        title={isFullscreen ? 'Exit Fullscreen Kiosk Mode' : 'Lock exam into Fullscreen Kiosk'}
        className="btn btn-ghost btn-sm"
        style={{
          height: '26px',
          padding: '0 8px',
          fontSize: '11px',
          gap: '4px',
          borderRadius: '5px',
          background: isFullscreen ? 'var(--accent-subtle)' : 'transparent',
          border: isFullscreen ? '1px solid var(--accent)' : '1px solid transparent',
          color: isFullscreen ? 'var(--accent)' : 'var(--text-secondary)',
          fontWeight: isFullscreen ? 700 : 500,
        }}
      >
        {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        <span>{isFullscreen ? 'Exit Kiosk' : 'Kiosk'}</span>
      </button>
    </div>
  );
};
