import React, { useState } from 'react';
import {
  X,
  Key,
  SlidersHorizontal,
  Layers,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Wifi
} from 'lucide-react';
import {
  getStoredApiKey,
  setStoredApiKey,
  getStoredModel,
  setStoredModel
} from '../services/groqService';
import { SimpleSelect } from './watermelon-ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged: () => void;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Section divider helper
// ---------------------------------------------------------------------------
const SectionDivider: React.FC = () => (
  <div
    style={{
      height: '1px',
      background: 'var(--border)',
      margin: '2px 0'
    }}
  />
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged
}) => {
  const [apiKey, setApiKey] = useState<string>(getStoredApiKey());
  const [selectedModel, setSelectedModel] = useState<string>(getStoredModel());
  const [showKey, setShowKey] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  if (!isOpen) return null;

  const handleSave = () => {
    setStoredApiKey(apiKey.trim());
    setStoredModel(selectedModel);
    onConfigChanged();
    onClose();
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('Verifying connection with Reasoning Engine API...');

    try {
      const payload: Record<string, unknown> = {
        model: selectedModel,
        messages: [{ role: 'user', content: 'Say "connected" in JSON format {"status":"ok"}' }],
        temperature: 0.1
      };
      if (selectedModel !== 'openai/gpt-oss-20b') {
        payload.response_format = { type: 'json_object' };
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Status ${res.status}: ${text}`);
      }

      const data = await res.json();
      setTestStatus('success');
      setTestMessage(
        `Connection verified! Model responded in ${data.usage?.total_time || '0.2'}s.`
      );
    } catch (err: unknown) {
      setTestStatus('error');
      const msg = err instanceof Error ? err.message : String(err);
      setTestMessage(`Connection failed: ${msg}`);
    }
  };

  // Test banner config
  const bannerConfig: Record<
    Exclude<TestStatus, 'idle'>,
    { bg: string; border: string; color: string; icon: React.ReactNode }
  > = {
    testing: {
      bg: 'var(--bg-surface)',
      border: 'var(--border)',
      color: 'var(--text-secondary)',
      icon: <RefreshCw size={14} className="spinner-icon" color="var(--accent)" />
    },
    success: {
      bg: 'var(--success-bg)',
      border: 'var(--success-border)',
      color: 'var(--success)',
      icon: <CheckCircle2 size={14} color="var(--success)" />
    },
    error: {
      bg: 'var(--danger-bg)',
      border: 'var(--danger-border)',
      color: 'var(--danger)',
      icon: <AlertCircle size={14} color="var(--danger)" />
    }
  };

  return (
    /* Backdrop */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.70)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '16px'
      }}
      onClick={onClose}
    >
      {/* Modal card */}
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* ---- Header ---- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-subtle)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <SlidersHorizontal size={15} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
                Autonomous Engine Settings
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                Configure your API key and inference model
              </div>
            </div>
          </div>

          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            style={{ padding: '5px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ---- Body ---- */}
        <div
          style={{
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}
        >
          {/* API Key field */}
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                marginBottom: '8px'
              }}
            >
              <Key size={11} color="var(--text-muted)" />
              Reasoning Engine API Key
            </label>

            <div style={{ position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                placeholder="key_..."
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12.5px',
                  outline: 'none',
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
                  e.currentTarget.style.borderColor = 'var(--border-strong)';
                }}
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              />
              {/* Show/hide toggle */}
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-muted)',
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                title={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
              Stored securely in local environment. Used for live code execution and forensic analysis.
            </p>
          </div>

          <SectionDivider />

          {/* Model selection */}
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                marginBottom: '8px'
              }}
            >
              <Layers size={11} color="var(--text-muted)" />
              Inference Model
            </label>

            <SimpleSelect<string>
              value={selectedModel}
              onChange={(newModel) => setSelectedModel(newModel)}
              options={[
                {
                  value: 'openai/gpt-oss-120b',
                  label: 'openai/gpt-oss-120b — Flagship Reasoning & Accuracy (Recommended)',
                  badge: 'FLAGSHIP'
                },
                {
                  value: 'openai/gpt-oss-20b',
                  label: 'openai/gpt-oss-20b — Fast Generation, Low Latency',
                  badge: 'FAST'
                },
                {
                  value: 'qwen/qwen3.8-27b',
                  label: 'qwen/qwen3.8-27b — Multi-Lingual Reasoning'
                }
              ]}
              size="md"
            />

            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
              The model is used for all analysis, viva questions, and grading responses.
            </p>
          </div>

          {/* Connection test banner */}
          {testStatus !== 'idle' && (
            <>
              <SectionDivider />
              <div
                style={{
                  padding: '11px 14px',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  fontSize: '12px',
                  lineHeight: 1.5,
                  background: bannerConfig[testStatus].bg,
                  border: `1px solid ${bannerConfig[testStatus].border}`,
                  color: bannerConfig[testStatus].color,
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                <div style={{ flexShrink: 0, paddingTop: '1px' }}>
                  {bannerConfig[testStatus].icon}
                </div>
                <span>{testMessage}</span>
              </div>
            </>
          )}
        </div>

        {/* ---- Footer actions ---- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            gap: '8px'
          }}
        >
          {/* Test connection button */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleTestConnection}
            disabled={testStatus === 'testing' || !apiKey.trim()}
            style={{ gap: '6px', opacity: !apiKey.trim() ? 0.5 : 1 }}
          >
            {testStatus === 'testing' ? (
              <>
                <RefreshCw size={12} className="spinner-icon" />
                Testing...
              </>
            ) : (
              <>
                <Wifi size={12} />
                Test Ping
              </>
            )}
          </button>

          {/* Cancel / Save */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={!apiKey.trim()}
              style={{ opacity: !apiKey.trim() ? 0.5 : 1 }}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
