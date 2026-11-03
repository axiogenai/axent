import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Building2,
  Shield,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Mail,
  Lock,
  User,
  Check,
  Zap,
  Layers,
  HelpCircle
} from 'lucide-react';
import { createOrganization, getSubscriptionPlans, DEFAULT_PLANS } from '../../services/saasService';
import { PlanId, BillingCycle } from '../../types/saas';
import { playSound } from '../../utils/sounds';

export const OrganizationRegistration: React.FC = () => {
  const navigate = useNavigate();

  // Wizard state: 1 = Org Info, 2 = Admin Profile, 3 = Plan Selection, 4 = Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form data
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [orgDomain, setOrgDomain] = useState('');
  const [campusCity, setCampusCity] = useState('');

  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminDept, setAdminDept] = useState('Computer Science & Engineering');

  const [selectedPlan, setSelectedPlan] = useState<PlanId>('starter');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plans = getSubscriptionPlans();

  const handleNameChange = (val: string) => {
    setOrgName(val);
    if (!orgSlug || orgSlug === orgName.toLowerCase().replace(/[^a-z0-9]/g, '-')) {
      setOrgSlug(val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 32));
    }
  };

  const handleNextToAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!orgName.trim()) {
      setError('Institution / Organization name is required.');
      return;
    }
    if (!orgSlug.trim()) {
      setError('Organization URL identifier (slug) is required.');
      return;
    }
    playSound('click');
    setStep(2);
  };

  const handleNextToPlan = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!adminName.trim()) {
      setError('Administrator full name is required.');
      return;
    }
    if (!adminEmail.trim() || !adminEmail.includes('@')) {
      setError('A valid institutional email is required.');
      return;
    }
    if (adminPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    playSound('click');
    setStep(3);
  };

  const handleCompleteRegistration = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await createOrganization({
        name: orgName.trim(),
        slug: orgSlug.trim(),
        domain: orgDomain.trim(),
        adminEmail: adminEmail.trim(),
        adminName: adminName.trim(),
        planId: selectedPlan,
        settings: {
          campusName: orgName.trim(),
          proctoringStrictness: 'standard',
          defaultResultDeclarationMode: 'IMMEDIATE',
          enableDualScreenDetection: true
        }
      });

      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }

      playSound('success');
      setStep(4);
    } catch (err: any) {
      setError(err?.message || 'Failed to complete registration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 20px',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            padding: '6px 14px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            marginBottom: '16px'
          }}
        >
          <Building2 size={13} color="var(--accent)" />
          AXENT SaaS Multi-Tenant Platform
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px 0' }}>
          Onboard Your Institution
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, maxWidth: '480px' }}>
          Set up an isolated, high-concurrency evaluation environment for your college, university, or examination department.
        </p>
      </div>

      {/* Progress Steps */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '32px',
          width: '100%',
          maxWidth: '560px',
          justifyContent: 'center'
        }}
      >
        {[
          { num: 1, label: 'Institution' },
          { num: 2, label: 'Administrator' },
          { num: 3, label: 'Plan & Quotas' },
          { num: 4, label: 'Activation' }
        ].map((s, idx) => (
          <React.Fragment key={s.num}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: step >= s.num ? 'var(--accent)' : 'var(--bg-surface)',
                  color: step >= s.num ? '#ffffff' : 'var(--text-secondary)',
                  border: `1px solid ${step >= s.num ? 'var(--accent)' : 'var(--border)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700
                }}
              >
                {step > s.num ? <Check size={14} /> : s.num}
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: step === s.num ? 700 : 500,
                  color: step === s.num ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                {s.label}
              </span>
            </div>
            {idx < 3 && (
              <div
                style={{
                  width: '32px',
                  height: '1px',
                  background: step > s.num ? 'var(--accent)' : 'var(--border)'
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Error Alert */}
      {error && (
        <div
          style={{
            maxWidth: '560px',
            width: '100%',
            marginBottom: '20px',
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            color: '#ef4444'
          }}
        >
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Institution Profile */}
      {step === 1 && (
        <form
          onSubmit={handleNextToAdmin}
          style={{
            maxWidth: '560px',
            width: '100%',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '28px'
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px 0' }}>
            Institution Profile
          </h2>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Institution / College Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Vishwakarma Institute of Technology"
              value={orgName}
              onChange={(e) => handleNameChange(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Subdomain URL Identifier (Slug) *
            </label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                required
                placeholder="vit-pune"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  color: 'var(--text-primary)',
                  fontSize: '14px'
                }}
              />
              <span
                style={{
                  padding: '10px 14px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderLeft: 'none',
                  borderTopRightRadius: 'var(--radius-sm)',
                  borderBottomRightRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)'
                }}
              >
                .axent.in
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
              Candidates and faculty can access examinations directly at this address.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Primary Web Domain
              </label>
              <input
                type="text"
                placeholder="vit.edu"
                value={orgDomain}
                onChange={(e) => setOrgDomain(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '13px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Campus City / Location
              </label>
              <input
                type="text"
                placeholder="Pune, Maharashtra"
                value={campusCity}
                onChange={(e) => setCampusCity(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--accent)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span>Continue to Administrator Profile</span>
            <ArrowRight size={16} />
          </button>
        </form>
      )}

      {/* Step 2: Administrator Profile */}
      {step === 2 && (
        <form
          onSubmit={handleNextToPlan}
          style={{
            maxWidth: '560px',
            width: '100%',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '28px'
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px 0' }}>
            Primary Administrator Account
          </h2>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="Dr. Rajesh Sharma"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Institutional Email *
            </label>
            <input
              type="email"
              required
              placeholder="dean.academics@vit.edu"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Password (min. 8 characters) *
            </label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="••••••••••••"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Department / Office
            </label>
            <input
              type="text"
              placeholder="Office of the Dean / Examination Cell"
              value={adminDept}
              onChange={(e) => setAdminDept(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                flex: 1,
                padding: '12px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Back
            </button>
            <button
              type="submit"
              style={{
                flex: 2,
                padding: '12px',
                background: 'var(--accent)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span>Select Plan & Quota</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}

      {/* Step 3: Plan Selection */}
      {step === 3 && (
        <div style={{ maxWidth: '860px', width: '100%' }}>
          {/* Billing Cycle Switch */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <div
              style={{
                display: 'inline-flex',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '999px',
                padding: '4px'
              }}
            >
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                style={{
                  padding: '6px 18px',
                  borderRadius: '999px',
                  border: 'none',
                  background: billingCycle === 'monthly' ? 'var(--accent)' : 'transparent',
                  color: billingCycle === 'monthly' ? '#ffffff' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Monthly Billing
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('yearly')}
                style={{
                  padding: '6px 18px',
                  borderRadius: '999px',
                  border: 'none',
                  background: billingCycle === 'yearly' ? 'var(--accent)' : 'transparent',
                  color: billingCycle === 'yearly' ? '#ffffff' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Yearly</span>
                <span style={{ fontSize: '10px', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', padding: '2px 6px', borderRadius: '4px' }}>
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          {/* Plan Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            {plans.map((p) => {
              const isSelected = selectedPlan === p.id;
              const price = billingCycle === 'yearly' ? p.priceInrYearly : p.priceInrMonthly;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlan(p.id)}
                  style={{
                    background: 'var(--bg-surface)',
                    border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '22px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    transition: 'border-color 0.15s ease'
                  }}
                >
                  <div>
                    {p.badge && (
                      <div
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                          marginBottom: '8px'
                        }}
                      >
                        {p.badge}
                      </div>
                    )}
                    <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px 0' }}>{p.name}</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                      {p.description}
                    </p>

                    <div style={{ marginBottom: '18px' }}>
                      <span style={{ fontSize: '26px', fontWeight: 800 }}>
                        ₹{price.toLocaleString('en-IN')}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
                        /{billingCycle === 'yearly' ? 'year' : 'month'}
                      </span>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        Platform Quota
                      </div>
                      <div style={{ fontSize: '12px', marginBottom: '4px' }}>
                        <strong>{p.maxStudents === -1 ? 'Unlimited' : p.maxStudents.toLocaleString('en-IN')}</strong> Students
                      </div>
                      <div style={{ fontSize: '12px', marginBottom: '4px' }}>
                        <strong>{p.maxExams === -1 ? 'Unlimited' : p.maxExams}</strong> Concurrent Exam Halls
                      </div>
                      <div style={{ fontSize: '12px', marginBottom: '12px' }}>
                        <strong>{p.maxMonthlySubmissions === -1 ? 'Unlimited' : p.maxMonthlySubmissions.toLocaleString('en-IN')}</strong> Submissions/mo
                      </div>

                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        Included Features
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {p.features.slice(0, 5).map((f, i) => (
                          <li key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Check size={12} color="var(--accent)" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '8px',
                      textAlign: 'center',
                      background: isSelected ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: isSelected ? '#ffffff' : 'var(--text-primary)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      fontWeight: 700
                    }}
                  >
                    {isSelected ? 'Selected Tier' : 'Choose Tier'}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '12px', maxWidth: '560px', margin: '0 auto' }}>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleCompleteRegistration}
              disabled={loading}
              style={{
                flex: 2,
                padding: '12px',
                background: 'var(--accent)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span>{loading ? 'Setting Up Tenant Environment...' : 'Activate Institution Account'}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Success & Launch Confirmation */}
      {step === 4 && (
        <div
          style={{
            maxWidth: '520px',
            width: '100%',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '36px',
            textAlign: 'center'
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto'
            }}
          >
            <CheckCircle2 size={32} color="#22c55e" />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 10px 0' }}>
            Institution Activated
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 24px 0' }}>
            <strong>{orgName}</strong> is now live on the AXENT SaaS platform on the <strong>{selectedPlan.toUpperCase()}</strong> tier. Your isolated examination hall and question repository are ready.
          </p>

          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '14px',
              textAlign: 'left',
              marginBottom: '24px',
              fontSize: '12px'
            }}
          >
            <div style={{ marginBottom: '6px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Dedicated Subdomain: </span>
              <strong>{orgSlug}.axent.in</strong>
            </div>
            <div style={{ marginBottom: '6px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Administrator Email: </span>
              <strong>{adminEmail}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Subscription Tier: </span>
              <strong>{selectedPlan.toUpperCase()} (14-Day Full Trial Active)</strong>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/admin')}
            style={{
              width: '100%',
              padding: '14px',
              background: 'var(--accent)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Launch Organization Admin Dashboard
          </button>
        </div>
      )}
    </div>
  );
};

export default OrganizationRegistration;
