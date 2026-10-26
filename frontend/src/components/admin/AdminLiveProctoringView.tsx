import React, { useState } from 'react';
import {
  KeyRound,
  Video,
  Monitor,
  Search,
  Filter,
  AlertTriangle,
  Lock,
  Unlock,
  Radio,
  Eye,
  Volume2,
  RefreshCw,
  Building,
  CheckCircle2,
  ShieldAlert,
  Send,
  PlusCircle,
  FileText
} from 'lucide-react';
import { CandidateStation, CollegeLabInfo, ThemeMode } from '../../types/dna';
import { playSound } from '../../utils/sounds';

interface AdminLiveProctoringViewProps {
  stations: CandidateStation[];
  allLabs: CollegeLabInfo[];
  selectedLabId: string;
  setSelectedLabId: (labId: string) => void;
  onInspectStation: (station: CandidateStation) => void;
  onSendWarning: (station: CandidateStation) => void;
  onLockStation: (stationId: string) => void;
  onUnlockStation: (stationId: string) => void;
  onConnectTestStation: () => void;
  onConnectTestMcqStation: () => void;
  theme?: ThemeMode;
}

export const AdminLiveProctoringView: React.FC<AdminLiveProctoringViewProps> = ({
  stations,
  allLabs,
  selectedLabId,
  setSelectedLabId,
  onInspectStation,
  onSendWarning,
  onLockStation,
  onUnlockStation,
  onConnectTestStation,
  onConnectTestMcqStation,
}) => {
  const [streamMode, setStreamMode] = useState<'camera' | 'screen'>('camera');
  const [searchQuery, setSearchQuery] = useState('');
  const [density, setDensity] = useState<'3' | '4'>('3');

  // Filter to active candidate stations taking exam
  const activeStations = stations.filter((s) => s.status !== 'Submitted & Done');
  const displayedStations = activeStations.filter((s) => {
    if (selectedLabId !== 'all' && s.labId !== selectedLabId) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (s.student?.name || '').toLowerCase().includes(q) ||
      (s.student?.rollNumber || '').toLowerCase().includes(q) ||
      s.stationNumber.toLowerCase().includes(q) ||
      (s.ipAddress || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* ── TOP CONTROL HEADER ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '14px 18px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'rgba(37, 99, 235, 0.12)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Video size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Live Proctoring Surveillance Wall
              </h2>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: displayedStations.length > 0 ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-surface)',
                  color: displayedStations.length > 0 ? '#22c55e' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: displayedStations.length > 0 ? '#22c55e' : '#71717a'
                  }}
                />
                {displayedStations.length} ACTIVE FEEDS
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Real-time WebRTC audio-visual telemetry & continuous student attention tracking
            </div>
          </div>
        </div>

        {/* View Mode & Grid Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', maxWidth: '100%' }}>
          {/* Stream Type Switcher */}
          <div
            style={{
              display: 'inline-flex',
              padding: '3px',
              background: 'var(--bg-surface)',
              borderRadius: '8px',
              border: '1px solid var(--border)'
            }}
          >
            <button
              type="button"
              onClick={() => {
                playSound('click');
                setStreamMode('camera');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: streamMode === 'camera' ? 'var(--bg-elevated)' : 'transparent',
                color: streamMode === 'camera' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: streamMode === 'camera' ? 600 : 500,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <Video size={13} />
              <span>Webcam Feeds</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playSound('click');
                setStreamMode('screen');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: streamMode === 'screen' ? 'var(--bg-elevated)' : 'transparent',
                color: streamMode === 'screen' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: streamMode === 'screen' ? 600 : 500,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <Monitor size={13} />
              <span>Screen Activity</span>
            </button>
          </div>

          {/* Lab Selector */}
          <select
            value={selectedLabId}
            onChange={(e) => {
              playSound('click');
              setSelectedLabId(e.target.value);
            }}
            style={{
              padding: '7px 12px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '12px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Campus Laboratories</option>
            {allLabs.map((lab) => (
              <option key={lab.labId} value={lab.labId}>
                {lab.labName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── SEARCH & TEST BUTTONS ROW ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: 'min(100%, 200px)', maxWidth: '380px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }}
          />
          <input
            type="text"
            placeholder="Search active candidate, USN, or station..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '12px',
              boxSizing: 'border-box',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onConnectTestStation}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}
          >
            <PlusCircle size={13} />
            <span>Connect Coding Station</span>
          </button>
          <button
            type="button"
            onClick={onConnectTestMcqStation}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}
          >
            <PlusCircle size={13} />
            <span>Connect MCQ Station</span>
          </button>
        </div>
      </div>

      {/* ── LIVE VIDEO/SCREEN SURVEILLANCE GRID ── */}
      {displayedStations.length === 0 ? (
        <div
          style={{
            padding: '56px 24px',
            textAlign: 'center',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px'
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'rgba(113, 113, 122, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)'
            }}
          >
            <Video size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 6px', color: 'var(--text-primary)' }}>
              No Active Live Proctoring Streams
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '440px', margin: 0 }}>
              All candidates have submitted or no examinations are currently in session for this laboratory.
              Connect a test station above or issue candidate exam tickets.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onConnectTestMcqStation}
              className="btn btn-primary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <PlusCircle size={13} />
              <span>Launch Test MCQ Stream</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, 280px), 1fr))`,
            gap: '16px'
          }}
        >
          {displayedStations.map((station) => {
            const isFlagged =
              station.cheatingRisk === 'High' ||
              station.cheatingRisk === 'Critical' ||
              (station.metrics?.pasteRatio || 0) >= 50 ||
              (station.metrics?.tabSwitchViolations || 0) >= 2;

            const attentionScore = Math.max(
              15,
              100 -
                (station.metrics?.tabSwitchViolations || 0) * 20 -
                (station.metrics?.pasteRatio || 0) * 0.5 -
                (station.metrics?.unfocusedTimeSeconds || 0) * 2
            );

            return (
              <div
                key={station.id}
                style={{
                  background: 'var(--bg-elevated)',
                  border: isFlagged ? '1px solid rgba(239, 68, 68, 0.6)' : '1px solid var(--border)',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'border-color 0.15s ease'
                }}
              >
                {/* Station Stream Top Bar */}
                <div
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg-surface)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border)'
                      }}
                    >
                      {station.stationNumber}
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {station.student?.name || 'Unassigned Candidate'}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: isFlagged ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.12)',
                      color: isFlagged ? '#ef4444' : '#22c55e',
                      border: isFlagged ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(34, 197, 94, 0.25)'
                    }}
                  >
                    {isFlagged ? 'FLAGGED RISK' : 'SECURE'}
                  </span>
                </div>

                {/* Video / Screen Stream Canvas Area */}
                <div
                  style={{
                    position: 'relative',
                    aspectRatio: '16 / 9',
                    background: '#09090b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden'
                  }}
                >
                  {streamMode === 'screen' && station.screenImageData ? (
                    <img
                      src={station.screenImageData}
                      alt="Screen Stream"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : station.screenImageData ? (
                    <img
                      src={station.screenImageData}
                      alt="Candidate Feed"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <Video size={28} color="#71717a" />
                      <span style={{ fontSize: '11px', color: '#a1a1aa', fontFamily: 'var(--font-mono)' }}>
                        WEBRTC FEED LIVE · {station.ipAddress || '10.77.210.15'}
                      </span>
                    </div>
                  )}

                  {/* On-stream HUD overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      left: '8px',
                      right: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(9, 9, 11, 0.75)',
                      backdropFilter: 'blur(4px)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />
                      <span style={{ fontSize: '10px', color: '#f4f4f5', fontFamily: 'var(--font-mono)' }}>
                        ATTENTION: {Math.round(attentionScore)}%
                      </span>
                    </div>

                    <span style={{ fontSize: '10px', color: '#a1a1aa', fontFamily: 'var(--font-mono)' }}>
                      TABS: {station.metrics?.tabSwitchViolations || 0}
                    </span>
                  </div>
                </div>

                {/* Telemetry Metrics strip */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '11px',
                    background: 'var(--bg-surface)',
                    textAlign: 'center',
                    gap: '4px'
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '9.5px', textTransform: 'uppercase' }}>
                      Paste %
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        color: (station.metrics?.pasteRatio || 0) >= 50 ? '#ef4444' : 'var(--text-primary)'
                      }}
                    >
                      {station.metrics?.pasteRatio || 0}%
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '9.5px', textTransform: 'uppercase' }}>
                      Keystrokes
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {station.metrics?.keystrokes || 0}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '9.5px', textTransform: 'uppercase' }}>
                      Marks
                    </div>
                    <div style={{ fontWeight: 700, color: '#3b82f6' }}>
                      {station.marks ? station.marks.totalMarks : station.mcqProgress?.score ?? 0} pts
                    </div>
                  </div>
                </div>

                {/* Quick Proctor Actions Toolbar */}
                <div
                  style={{
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSendWarning(station)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '5px 8px',
                      background: 'rgba(234, 179, 8, 0.1)',
                      color: '#eab308',
                      border: '1px solid rgba(234, 179, 8, 0.3)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Send size={11} />
                    <span>Send Warning</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onInspectStation(station)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '5px 8px',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Eye size={11} />
                    <span>Inspect</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}



        </div>
  );
};
