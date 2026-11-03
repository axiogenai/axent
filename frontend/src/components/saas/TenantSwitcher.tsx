import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  ChevronDown,
  Check,
  Plus,
  ShieldAlert,
  Server,
  Layers,
  ExternalLink
} from 'lucide-react';
import {
  getActiveOrgId,
  setActiveOrgId,
  getAllOrganizations,
  getOrganizationById,
  onActiveOrgChanged,
  DEFAULT_ORG_ID
} from '../../services/saasService';
import { isSuperAdmin } from '../../services/authService';
import { Organization } from '../../types/saas';
import { playSound } from '../../utils/sounds';

export const TenantSwitcher: React.FC = () => {
  const navigate = useNavigate();
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isSuper = isSuperAdmin();

  const reload = async () => {
    const curId = getActiveOrgId();
    const [all, current] = await Promise.all([
      getAllOrganizations(),
      getOrganizationById(curId)
    ]);
    setOrganizations(all);
    setActiveOrg(current);
  };

  useEffect(() => {
    reload();
    const unsub = onActiveOrgChanged(() => {
      reload();
    });
    return unsub;
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (orgId: string) => {
    setActiveOrgId(orgId);
    setIsOpen(false);
    playSound('click');
    window.location.reload(); // Refresh state cleanly across views
  };

  if (!activeOrg) return null;

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'border-color 0.15s ease'
        }}
      >
        <Building2 size={13} color="var(--accent)" />
        <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeOrg.name}
        </span>
        <span
          style={{
            fontSize: '9px',
            padding: '2px 5px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--text-secondary)'
          }}
        >
          {activeOrg.planId}
        </span>
        <ChevronDown size={12} color="var(--text-secondary)" />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 9999,
            minWidth: '240px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
            padding: '6px',
            fontSize: '12px'
          }}
        >
          <div
            style={{
              padding: '6px 8px',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-secondary)',
              borderBottom: '1px solid var(--border)',
              marginBottom: '4px'
            }}
          >
            Switch Institution Tenant
          </div>

          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {organizations.map((org) => {
              const isSelected = org.id === activeOrg.id;
              return (
                <div
                  key={org.id}
                  onClick={() => handleSelect(org.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: isSelected ? 'var(--bg-elevated)' : 'transparent',
                    cursor: 'pointer',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: isSelected ? 700 : 500, color: 'var(--text-primary)' }}>
                      {org.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {org.slug}.axent.in
                    </div>
                  </div>
                  {isSelected && <Check size={13} color="var(--accent)" />}
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '4px' }}>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/register-org');
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <Plus size={13} />
              <span>Register New Campus</span>
            </button>

            {isSuper && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  navigate('/super-admin');
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent)',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <Server size={13} />
                <span>Super Admin Console</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantSwitcher;
