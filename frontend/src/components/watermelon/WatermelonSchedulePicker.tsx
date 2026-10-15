import React from 'react';
import { Calendar, Clock, Check, X, ArrowRight, Zap } from 'lucide-react';

interface WatermelonSchedulePickerProps {
  startTime?: number;
  endTime?: number;
  durationMinutes: number;
  onChange: (startTime?: number, endTime?: number) => void;
}

export const WatermelonSchedulePicker: React.FC<WatermelonSchedulePickerProps> = ({
  startTime,
  endTime,
  durationMinutes,
  onChange
}) => {
  const isScheduled = !!startTime;

  // Format timestamp into human-readable string (e.g. "Thu, 16 Oct · 10:30 AM")
  const formatHumanDateTime = (ts?: number): string => {
    if (!ts) return 'Not configured';
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Convert timestamp to YYYY-MM-DDTHH:mm for local datetime input
  const toInputValue = (ts?: number): string => {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const parseInputValue = (str: string): number | undefined => {
    if (!str) return undefined;
    const ms = Date.parse(str);
    return isNaN(ms) ? undefined : ms;
  };

  // Quick Preset Actions
  const handleSetPreset = (preset: 'now_plus_10m' | 'plus_1h' | 'tomorrow_10am') => {
    const now = Date.now();
    let start = now;
    let end = now;

    if (preset === 'now_plus_10m') {
      start = now + 10 * 60 * 1000;
      end = start + Math.max(durationMinutes, 30) * 60 * 1000 + 15 * 60 * 1000;
    } else if (preset === 'plus_1h') {
      start = now + 60 * 60 * 1000;
      end = start + Math.max(durationMinutes, 30) * 60 * 1000 + 30 * 60 * 1000;
    } else if (preset === 'tomorrow_10am') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      start = tomorrow.getTime();
      end = start + Math.max(durationMinutes, 30) * 60 * 1000 + 30 * 60 * 1000;
    }

    onChange(start, end);
  };

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}
    >
      {/* Header with Mode Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={13} color="var(--accent)" />
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Exam Availability & Schedule
          </span>
        </div>

        {/* Tactile Watermelon Mode Segment Switch */}
        <div
          style={{
            display: 'inline-flex',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            padding: '2px'
          }}
        >
          <button
            type="button"
            onClick={() => onChange(undefined, undefined)}
            style={{
              padding: '3px 9px',
              fontSize: '11px',
              fontWeight: !isScheduled ? 700 : 500,
              background: !isScheduled ? 'var(--accent)' : 'transparent',
              color: !isScheduled ? 'var(--accent-contrast)' : 'var(--text-muted)',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease'
            }}
          >
            <Zap size={11} />
            <span>Live Immediately</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!isScheduled) handleSetPreset('now_plus_10m');
            }}
            style={{
              padding: '3px 9px',
              fontSize: '11px',
              fontWeight: isScheduled ? 700 : 500,
              background: isScheduled ? 'var(--accent)' : 'transparent',
              color: isScheduled ? 'var(--accent-contrast)' : 'var(--text-muted)',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease'
            }}
          >
            <Clock size={11} />
            <span>Scheduled Window</span>
          </button>
        </div>
      </div>

      {/* Mode 1: Live Immediately (Default - Zero calendar clutter) */}
      {!isScheduled ? (
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--success)'
              }}
            />
            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
              <strong>Unrestricted Access:</strong> Candidates can begin examination immediately once published. No countdown or waiting room lock.
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleSetPreset('now_plus_10m')}
            style={{
              padding: '3px 8px',
              fontSize: '10.5px',
              fontWeight: 600,
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            + Set Schedule
          </button>
        </div>
      ) : (
        /* Mode 2: Synchronized Scheduled Window */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Quick 1-Click Presets */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
              Quick Presets:
            </span>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleSetPreset('now_plus_10m')}
                style={{
                  padding: '2px 8px',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-xs)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                In 10 Mins
              </button>
              <button
                type="button"
                onClick={() => handleSetPreset('plus_1h')}
                style={{
                  padding: '2px 8px',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-xs)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                In 1 Hour
              </button>
              <button
                type="button"
                onClick={() => handleSetPreset('tomorrow_10am')}
                style={{
                  padding: '2px 8px',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-xs)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                Tomorrow 10:00 AM
              </button>
            </div>
          </div>

          {/* Start and End Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {/* Start Slot */}
            <div
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-xs)',
                padding: '8px 10px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Auto-Unlock Start
                </label>
                <span style={{ fontSize: '10px', color: 'var(--warning)', fontWeight: 700 }}>
                  Waiting Room
                </span>
              </div>
              <input
                type="datetime-local"
                value={toInputValue(startTime)}
                onChange={(e) => {
                  const s = parseInputValue(e.target.value);
                  onChange(s, endTime);
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  outline: 'none',
                  padding: '2px 0',
                  colorScheme: 'dark'
                }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', marginTop: '2px' }}>
                {formatHumanDateTime(startTime)}
              </span>
            </div>

            {/* End Slot */}
            <div
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-xs)',
                padding: '8px 10px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Auto-Close Deadline
                </label>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  Min {durationMinutes}m
                </span>
              </div>
              <input
                type="datetime-local"
                value={toInputValue(endTime)}
                onChange={(e) => {
                  const end = parseInputValue(e.target.value);
                  onChange(startTime, end);
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  outline: 'none',
                  padding: '2px 0',
                  colorScheme: 'dark'
                }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', marginTop: '2px' }}>
                {formatHumanDateTime(endTime)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
