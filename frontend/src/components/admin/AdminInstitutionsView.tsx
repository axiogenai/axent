import React from 'react';
import {
  Building,
  PlusCircle,
  Lock,
  Unlock,
  Users,
  Monitor,
  CheckCircle2,
  Trash2,
  Settings,
  MapPin,
  ShieldCheck,
  Edit2
} from 'lucide-react';
import { CandidateStation, CollegeLabInfo } from '../../types/dna';
import { playSound } from '../../utils/sounds';

interface AdminInstitutionsViewProps {
  allLabs: CollegeLabInfo[];
  stations: CandidateStation[];
  isLabLocked: (labId: string) => boolean;
  onOpenLabManager: () => void;
  onLockLab: (labId: string) => void;
  onUnlockLab: (labId: string) => void;
  onClearSubmitted: () => void;
}

export const AdminInstitutionsView: React.FC<AdminInstitutionsViewProps> = ({
  allLabs,
  stations,
  isLabLocked,
  onOpenLabManager,
  onLockLab,
  onUnlockLab,
  onClearSubmitted
}) => {
  const totalCapacity = allLabs.reduce((acc, l) => acc + (l.totalStations || 40), 0);
  const lockedLabsCount = allLabs.filter((l) => isLabLocked(l.labId)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* ── HEADER SUMMARY CARDS ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
          gap: '12px',
          width: '100%'
        }}
      >
        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Building size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Campus Laboratories
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{allLabs.length}</div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'rgba(34, 197, 94, 0.12)',
              color: '#22c55e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Monitor size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Workstation Capacity
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{totalCapacity} Seats</div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Lock size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Locked Laboratories
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{lockedLabsCount}</div>
          </div>
        </div>
      </div>

      {/* ── TOOLBAR WITH ADD LAB ACTION ── */}
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
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 2px', color: 'var(--text-primary)' }}>
            Institution & Campus Laboratories Directory
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Configure examination venues, workstation capacity, and invigilator assignments
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenLabManager}
          className="btn btn-primary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <PlusCircle size={13} />
          <span>Add / Manage Laboratories</span>
        </button>
      </div>

      {/* ── LABORATORIES GRID CARDS ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
          gap: '16px'
        }}
      >
        {allLabs.map((lab) => {
          const labStations = stations.filter((s) => s.labId === lab.labId);
          const activeInLab = labStations.filter((s) => s.status !== 'Submitted & Done').length;
          const locked = isLabLocked(lab.labId);

          return (
            <div
              key={lab.labId}
              style={{
                background: 'var(--bg-elevated)',
                border: locked ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)',
                borderRadius: '10px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    {lab.labCode || lab.labId}
                  </span>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '6px 0 2px', color: 'var(--text-primary)' }}>
                    {lab.labName}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <MapPin size={11} />
                    <span>{lab.block || 'Academic Block'} · {lab.department || 'Computer Science'}</span>
                  </div>
                </div>

                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: locked ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                    color: locked ? '#ef4444' : '#22c55e',
                    border: locked ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(34, 197, 94, 0.25)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {locked ? <Lock size={10} /> : <Unlock size={10} />}
                  <span>{locked ? 'LOCKED' : 'UNLOCKED'}</span>
                </span>
              </div>

              {/* Lab Stats */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  padding: '10px 12px',
                  background: 'var(--bg-surface)',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontSize: '11px',
                  textAlign: 'center'
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '9.5px', textTransform: 'uppercase' }}>
                    Capacity
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{lab.totalStations || 40} Seats</div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '9.5px', textTransform: 'uppercase' }}>
                    Active
                  </div>
                  <div style={{ fontWeight: 700, color: activeInLab > 0 ? '#22c55e' : 'var(--text-muted)' }}>
                    {activeInLab}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '9.5px', textTransform: 'uppercase' }}>
                    Invigilator
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {lab.invigilatorName || 'Assigned'}
                  </div>
                </div>
              </div>

              {/* Lab Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click');
                    if (locked) {
                      onUnlockLab(lab.labId);
                    } else {
                      onLockLab(lab.labId);
                    }
                  }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: locked ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                    background: locked ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    color: locked ? '#22c55e' : '#ef4444',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {locked ? <Unlock size={11} /> : <Lock size={11} />}
                  <span>{locked ? 'Unlock Lab' : 'Lock Lab'}</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenLabManager}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Edit2 size={11} />
                  <span>Configure</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
