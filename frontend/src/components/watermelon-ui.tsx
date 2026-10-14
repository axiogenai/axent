import React, { useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';

// ============================================================================
// 1. WatermelonBentoCard — Crisp Static Bento Card (Zero Hover Shine / Spotlights)
// ============================================================================
export interface WatermelonBentoCardProps {
  children: React.ReactNode;
  accentColor?: string;
  padding?: string;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
}

export const WatermelonBentoCard: React.FC<WatermelonBentoCardProps> = ({
  children,
  padding = '16px',
  style,
  className = '',
  onClick
}) => {
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding,
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.15s ease, background-color 0.15s ease',
        ...style
      }}
    >
      {children}
    </div>
  );
};

// ============================================================================
// 1b. WatermelonStatCard — Statistics Metric Card (Watermelon Stats-1 / Stats-2 Pattern)
// ============================================================================
export interface WatermelonStatCardProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  icon: React.ReactNode;
  iconColor?: string;
  badgeBg?: string;
  subtext?: string;
  footerDotColor?: string;
  onClick?: () => void;
}

export const WatermelonStatCard: React.FC<WatermelonStatCardProps> = ({
  label,
  value,
  unit,
  icon,
  iconColor = 'var(--accent)',
  badgeBg = 'var(--bg-surface)',
  subtext,
  footerDotColor,
  onClick
}) => {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: 'var(--shadow-sm)',
        transition: 'border-color 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 8px',
            borderRadius: '6px',
            background: badgeBg,
            border: '1px solid var(--border)',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text-secondary)'
          }}
        >
          <span style={{ color: iconColor, display: 'inline-flex' }}>{icon}</span>
          <span>{label}</span>
        </div>
      </div>

      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'baseline', gap: '5px' }}>
        <span
          style={{
            fontSize: '30px',
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            lineHeight: 1
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>
            {unit}
          </span>
        )}
      </div>

      {subtext && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '12px',
            fontSize: '11px',
            color: 'var(--text-muted)'
          }}
        >
          <span>{subtext}</span>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. ContinuousTabs — Watermelon UI Pill Tabs
// ============================================================================
export interface ContinuousTabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  badgeTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}

export interface ContinuousTabsProps {
  tabs: ContinuousTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  layoutId?: string;
  size?: 'sm' | 'md';
}

export const ContinuousTabs: React.FC<ContinuousTabsProps> = ({
  tabs,
  activeId,
  onChange,
  size = 'md'
}) => {
  const getBadgeColors = (tone: ContinuousTabItem['badgeTone'] = 'neutral') => {
    switch (tone) {
      case 'danger':
        return { bg: 'var(--danger-bg)', color: 'var(--danger)', border: 'var(--danger-border)' };
      case 'warning':
        return { bg: 'var(--warning-bg)', color: 'var(--warning)', border: 'var(--warning-border)' };
      case 'success':
        return { bg: 'var(--success-bg)', color: 'var(--success)', border: 'var(--success-border)' };
      case 'accent':
        return { bg: 'var(--accent-subtle)', color: 'var(--accent)', border: 'var(--border-strong)' };
      default:
        return { bg: 'var(--bg-surface)', color: 'var(--text-secondary)', border: 'var(--border)' };
    }
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: '3px',
        borderRadius: '9px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)'
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const badgeStyle = getBadgeColors(tab.badgeTone);

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: size === 'sm' ? '4px 10px' : '6px 12px',
              height: size === 'sm' ? '28px' : '32px',
              borderRadius: '6px',
              border: isActive ? '1px solid var(--border-strong)' : '1px solid transparent',
              background: isActive ? 'var(--bg-elevated)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: size === 'sm' ? '11.5px' : '12px',
              fontWeight: isActive ? 700 : 500,
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.18s cubic-bezier(0.22, 1, 0.36, 1)'
            }}
          >
            {tab.icon && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: isActive ? 'var(--accent)' : 'inherit'
                }}
              >
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 5px',
                  height: '16px',
                  borderRadius: '999px',
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  background: badgeStyle.bg,
                  color: badgeStyle.color,
                  border: `1px solid ${badgeStyle.border}`
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// ============================================================================
// 3. SegmentedUsageBar — Watermelon UI Block-by-Block Telemetry Bar
// ============================================================================
export interface SegmentedUsageItem {
  label: string;
  value: number;
  color: string;
}

export interface SegmentedUsageBarProps {
  title: string;
  subtitle?: string;
  items: SegmentedUsageItem[];
  totalBlocks?: number;
}

export const SegmentedUsageBar: React.FC<SegmentedUsageBarProps> = ({
  title,
  subtitle,
  items,
  totalBlocks = 24
}) => {
  const totalValue = Math.max(
    1,
    items.reduce((acc, item) => acc + Math.max(0, item.value), 0)
  );

  const blocks: { color: string; label: string }[] = [];
  items.forEach((item) => {
    const count = Math.round((Math.max(0, item.value) / totalValue) * totalBlocks);
    for (let i = 0; i < count && blocks.length < totalBlocks; i++) {
      blocks.push({ color: item.color, label: item.label });
    }
  });
  while (blocks.length < totalBlocks && items.length > 0) {
    blocks.push({ color: items[0].color, label: items[0].label });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: 'var(--text-secondary)'
          }}
        >
          {title}
        </span>
        {subtitle && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)'
            }}
          >
            {subtitle}
          </span>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${totalBlocks}, 1fr)`,
          gap: '3px',
          height: '12px'
        }}
      >
        {blocks.map((block, idx) => (
          <div
            key={idx}
            title={block.label}
            style={{
              background: block.color,
              borderRadius: '2px',
              height: '100%',
              transition: 'background-color 0.2s ease'
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '2px',
                background: item.color,
                display: 'inline-block'
              }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>{item.label}:</span>
            <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {item.value}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 4. MicroSegmentedBar — Compact Segmented Spark Bar for KPI Cards
// ============================================================================
export interface MicroSegmentedBarProps {
  value: number; // 0 to 100
  segments?: number;
  color?: string;
}

export const MicroSegmentedBar: React.FC<MicroSegmentedBarProps> = ({
  value,
  color = 'var(--accent)'
}) => {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      style={{
        height: '4px',
        width: '100%',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '999px',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${clamped}%`,
          background: color,
          borderRadius: '999px',
          transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      />
    </div>
  );
};

// ============================================================================
// 5. MetricTag — Structured Telemetry Chip
// ============================================================================
export interface MetricTagProps {
  icon?: React.ReactNode;
  label?: string;
  value: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}

export const MetricTag: React.FC<MetricTagProps> = ({
  icon,
  label,
  value,
  tone = 'neutral'
}) => {
  const getToneStyles = () => {
    switch (tone) {
      case 'danger':
        return {
          bg: 'var(--danger-bg)',
          border: 'var(--danger-border)',
          color: 'var(--danger)'
        };
      case 'warning':
        return {
          bg: 'var(--warning-bg)',
          border: 'var(--warning-border)',
          color: 'var(--warning)'
        };
      case 'success':
        return {
          bg: 'var(--success-bg)',
          border: 'var(--success-border)',
          color: 'var(--success)'
        };
      case 'accent':
        return {
          bg: 'var(--accent-subtle)',
          border: 'var(--border-strong)',
          color: 'var(--accent)'
        };
      default:
        return {
          bg: 'var(--bg-elevated)',
          border: 'var(--border)',
          color: 'var(--text-primary)'
        };
    }
  };

  const s = getToneStyles();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 8px',
        borderRadius: '6px',
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        lineHeight: 1.2,
        whiteSpace: 'nowrap'
      }}
    >
      {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
      {label && (
        <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontFamily: 'var(--font-sans)' }}>
          {label}:
        </span>
      )}
      <strong>{value}</strong>
    </span>
  );
};

// ============================================================================
// 6. CopyConfirmButton — Watermelon UI Copy Button
// ============================================================================
export interface CopyConfirmButtonProps {
  text: string;
  label?: string;
}

export const CopyConfirmButton: React.FC<CopyConfirmButtonProps> = ({
  text,
  label = 'Copy'
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="btn btn-secondary btn-sm"
      style={{
        height: '24px',
        padding: '0 8px',
        fontSize: '11px',
        gap: '5px'
      }}
    >
      {copied ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--success)' }}>
          <Check size={11} />
          <span>Copied</span>
        </span>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Copy size={11} />
          <span>{label}</span>
        </span>
      )}
    </button>
  );
};

// ============================================================================
// 7. BklitSemiGauge — Bklit UI Semi-Circle SVG Telemetry Gauge
// ============================================================================
export interface BklitSemiGaugeProps {
  value: number; // 0 to 100
  label: string;
  color?: string;
  size?: number;
}

export const BklitSemiGauge: React.FC<BklitSemiGaugeProps> = ({
  value,
  label,
  color = 'var(--accent)',
  size = 100
}) => {
  const clamped = Math.max(0, Math.min(100, value));
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
        <text
          x="50%"
          y={size / 2 - 4}
          textAnchor="middle"
          fill="var(--text-primary)"
          style={{
            fontSize: '14px',
            fontWeight: 800,
            fontFamily: 'var(--font-mono)'
          }}
        >
          {clamped}%
        </text>
      </svg>
      <span
        style={{
          fontSize: '9.5px',
          fontWeight: 700,
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          marginTop: '-4px'
        }}
      >
        {label}
      </span>
    </div>
  );
};

// ============================================================================
// 8. WatermelonRunButton — Multi-State Action Button
// ============================================================================
export interface WatermelonRunButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  idleLabel?: string;
  loadingLabel?: string;
  icon?: React.ReactNode;
}

export const WatermelonRunButton: React.FC<WatermelonRunButtonProps> = ({
  onClick,
  isLoading = false,
  disabled = false,
  idleLabel = 'Compile & Run',
  loadingLabel = 'Compiling...',
  icon
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className="btn btn-primary btn-sm"
      style={{
        position: 'relative',
        overflow: 'hidden',
        minWidth: '128px',
        justifyContent: 'center',
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer'
      }}
    >
      {isLoading ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Loader2 size={13} className="spin" />
          <span>{loadingLabel}</span>
        </span>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {icon}
          <span>{idleLabel}</span>
        </span>
      )}
    </button>
  );
};

// ============================================================================
// 9. SimpleSelect — Unified Custom Selection Component (Zero Native OS Blue)
// ============================================================================
export { SimpleSelect } from './watermelon/Select';
export type { SimpleSelectProps, SelectOption } from './watermelon/Select';

