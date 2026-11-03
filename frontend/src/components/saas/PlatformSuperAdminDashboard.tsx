import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Users,
  FileText,
  CreditCard,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Search,
  ExternalLink,
  Plus,
  RefreshCw,
  Sliders,
  DollarSign,
  TrendingUp,
  Server,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  ArrowUpRight,
  LogOut
} from 'lucide-react';
import {
  getAllOrganizations,
  getPlatformSuperAdminMetrics,
  getSubscriptionPlans,
  updateOrganization,
  setActiveOrgId,
  getAuditLogs,
  DEFAULT_ORG_ID
} from '../../services/saasService';
import { Organization, PlatformMetrics, SubscriptionPlan, AuditLogEntry, PlanId } from '../../types/saas';
import { playSound } from '../../utils/sounds';

export const PlatformSuperAdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'tenants' | 'plans' | 'audit'>('tenants');
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [m, orgs, p, logs] = await Promise.all([
        getPlatformSuperAdminMetrics(),
        getAllOrganizations(),
        Promise.resolve(getSubscriptionPlans()),
        getAuditLogs()
      ]);
      setMetrics(m);
      setOrganizations(orgs);
      setPlans(p);
      setAuditLogs(logs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleOrgStatus = async (org: Organization) => {
    const nextStatus = org.subscriptionStatus === 'active' || org.subscriptionStatus === 'trialing' ? 'canceled' : 'active';
    await updateOrganization(org.id, { subscriptionStatus: nextStatus });
    playSound('click');
    loadData();
  };

  const handleSwitchTenantContext = (orgId: string) => {
    setActiveOrgId(orgId);
    playSound('click');
    navigate('/admin');
  };

  const filteredOrgs = organizations.filter(
    (o) =>
      o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.domain && o.domain.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        padding: '24px 32px',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '20px',
          marginBottom: '28px'
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-secondary)',
              marginBottom: '8px'
            }}
          >
            <Server size={12} color="var(--accent)" />
            <span>Platform Governance Console</span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            AXENT Super Administrator
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={loadData}
            style={{
              padding: '8px 14px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={14} className={loading ? 'spinner-icon' : ''} />
            <span>Sync Live</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/register-org')}
            style={{
              padding: '8px 16px',
              background: 'var(--accent)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Plus size={14} />
            <span>Onboard New Tenant</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/admin')}
            style={{
              padding: '8px 14px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Exit to Campus View
          </button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      {metrics && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '32px'
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '18px'
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Total Organizations
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800 }}>{metrics.totalOrganizations}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {metrics.activeOrganizations} active / trialing
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '18px'
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Monthly Recurring Revenue
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
              ₹{metrics.monthlyRecurringRevenueInr.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '11px', color: '#22c55e', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingUp size={11} />
              <span>Paid Subscriptions Active</span>
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '18px'
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Platform Submissions
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800 }}>{metrics.totalSubmissions.toLocaleString('en-IN')}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Evaluated across all institutes
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '18px'
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Hosted Examinations
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800 }}>{metrics.totalExaminations}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {metrics.totalStudents} concurrent students
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border)',
          marginBottom: '20px'
        }}
      >
        {[
          { id: 'tenants', label: 'Tenant Organizations' },
          { id: 'plans', label: 'Subscription Tiers' },
          { id: 'audit', label: 'Platform Audit Ledger' }
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as any)}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: activeTab === t.id ? 700 : 500,
              cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Tenants Directory */}
      {activeTab === 'tenants' && (
        <div>
          {/* Search Bar */}
          <div style={{ marginBottom: '16px', display: 'flex', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                flex: 1,
                maxWidth: '400px'
              }}
            >
              <Search size={14} color="var(--text-secondary)" />
              <input
                type="text"
                placeholder="Search organizations by name or slug..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  width: '100%'
                }}
              />
            </div>
          </div>

          {/* Organizations Table */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden'
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Institution Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Subdomain Slug</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Plan</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Onboarded</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrgs.map((org) => {
                  const isActive = org.subscriptionStatus === 'active' || org.subscriptionStatus === 'trialing';
                  return (
                    <tr key={org.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700 }}>{org.name}</div>
                        {org.domain && (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{org.domain}</div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: '12px' }}>
                        {org.slug}.axent.in
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase'
                          }}
                        >
                          {org.planId}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: isActive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: isActive ? '#22c55e' : '#ef4444'
                          }}
                        >
                          {org.subscriptionStatus}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                        {new Date(org.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleSwitchTenantContext(org.id)}
                            style={{
                              padding: '6px 12px',
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-primary)',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <span>Manage Org</span>
                            <ArrowUpRight size={12} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleOrgStatus(org)}
                            style={{
                              padding: '6px 10px',
                              background: 'transparent',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              color: isActive ? '#ef4444' : '#22c55e',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            {isActive ? 'Suspend' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Subscription Plans Manager */}
      {activeTab === 'plans' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {plans.map((p) => {
            const orgCount = organizations.filter((o) => o.planId === p.id).length;
            return (
              <div
                key={p.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '24px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>{p.name}</h3>
                  <span
                    style={{
                      padding: '3px 8px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700
                    }}
                  >
                    {orgCount} Active Tenants
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>{p.description}</p>
                
                <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '16px' }}>
                  ₹{p.priceInrMonthly.toLocaleString('en-IN')}{' '}
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>/ month</span>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', fontSize: '12px' }}>
                  <div style={{ marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Max Students: </span>
                    <strong>{p.maxStudents === -1 ? 'Unlimited' : p.maxStudents.toLocaleString('en-IN')}</strong>
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Concurrent Halls: </span>
                    <strong>{p.maxExams === -1 ? 'Unlimited' : p.maxExams}</strong>
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Monthly Submissions: </span>
                    <strong>{p.maxMonthlySubmissions === -1 ? 'Unlimited' : p.maxMonthlySubmissions.toLocaleString('en-IN')}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 3: Forensic Audit Ledger */}
      {activeTab === 'audit' && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden'
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Timestamp</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Tenant Org</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Action</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Resource</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No audit records recorded yet. All administrative actions will be logged here.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>{log.orgId}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          padding: '2px 6px',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 700
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>{log.resource}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                      {JSON.stringify(log.details || {})}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PlatformSuperAdminDashboard;
