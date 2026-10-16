import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileEdit,
  BookOpen,
  BarChart2,
  GraduationCap,
  ShieldAlert
} from 'lucide-react';
import { MCQQuestionBank } from './MCQQuestionBank';
import { MCQCreateExam } from './MCQCreateExam';
import { MCQResults } from './MCQResults';
import { ContinuousTabs } from './watermelon-ui';
import { isAuthorityAdmin } from '../services/authService';

type PaperSetterTab = 'exams' | 'bank' | 'results';

const tabs = [
  { id: 'exams' as PaperSetterTab, label: 'Manage & Schedule Exams', icon: <FileEdit size={13} /> },
  { id: 'bank' as PaperSetterTab, label: 'Question Bank', icon: <BookOpen size={13} /> },
  { id: 'results' as PaperSetterTab, label: 'Results & Ledger', icon: <BarChart2 size={13} /> },
];

export const PaperSetterPortal: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<PaperSetterTab>('exams');
  const isAdmin = isAuthorityAdmin();

  return (
    <div style={{ minHeight: 'calc(100vh - 52px)', background: 'var(--bg-main)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ── */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
          padding: '12px clamp(12px, 3vw, 24px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)'
            }}
          >
            <GraduationCap size={16} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Paper Setter Portal
            </h1>
            <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)' }}>
              Author questions, configure exam papers, and schedule examination sittings.
            </p>
          </div>
        </div>

        {/* 1-Click Back to Chief Proctor CCTV Control Room (Only visible for Admins) */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="btn btn-secondary btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              background: 'rgba(239, 68, 68, 0.08)',
              color: '#ef4444',
              cursor: 'pointer'
            }}
            title="Return to Chief Proctor CCTV Live Surveillance"
          >
            <ShieldAlert size={14} color="#ef4444" />
            <span>Chief Proctor CCTV</span>
          </button>
        )}
      </div>

      {/* ── Tab Navigation ── */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
          padding: '0 clamp(12px, 3vw, 24px)',
          display: 'flex',
          alignItems: 'center',
          height: '46px',
          overflowX: 'auto',
          scrollbarWidth: 'none'
        }}
      >
        <ContinuousTabs
          layoutId="paper-setter-tabs"
          size="sm"
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as PaperSetterTab)}
          tabs={tabs}
        />
      </div>

      {/* ── Content Area (full width) ── */}
      <div style={{ flex: 1, padding: 'clamp(12px, 3vw, 24px)', width: '100%', boxSizing: 'border-box' }}>
        {activeTab === 'exams' && <MCQCreateExam />}
        {activeTab === 'bank' && <MCQQuestionBank />}
        {activeTab === 'results' && <MCQResults />}
      </div>
    </div>
  );
};

export default PaperSetterPortal;
