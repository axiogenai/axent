import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  X,
  Zap,
  TrendingUp,
  ShieldCheck,
  Check,
  ArrowRight,
  ExternalLink,
  Layers
} from 'lucide-react';
import {
  getActiveOrgId,
  getOrganizationById,
  getSubscription,
  getSubscriptionPlans,
  upgradeSubscriptionPlan,
  createRazorpaySubscriptionOrder,
  verifyRazorpayPayment
} from '../../services/saasService';
import { Organization, Subscription, SubscriptionPlan, PlanId, BillingCycle } from '../../types/saas';
import { playSound } from '../../utils/sounds';

interface SubscriptionBillingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SubscriptionBillingModal: React.FC<SubscriptionBillingModalProps> = ({ isOpen, onClose }) => {
  const [org, setOrg] = useState<Organization | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [upgradingPlan, setUpgradingPlan] = useState<PlanId | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const orgId = getActiveOrgId();

  const reload = async () => {
    const [currentOrg, sub, allPlans] = await Promise.all([
      getOrganizationById(orgId),
      getSubscription(orgId),
      Promise.resolve(getSubscriptionPlans())
    ]);
    setOrg(currentOrg);
    setSubscription(sub);
    setPlans(allPlans);
  };

  useEffect(() => {
    if (isOpen) {
      reload();
      setSuccessMessage(null);
      setErrorMessage(null);
    }
  }, [isOpen, orgId]);

  if (!isOpen) return null;

  const currentPlan = plans.find((p) => p.id === (org?.planId || 'starter')) || plans[1];
  const usage = subscription?.usage || {
    studentsCount: 0,
    examsCount: 0,
    adminsCount: 1,
    evaluatorsCount: 0,
    monthlySubmissionsCount: 0
  };

  const handleUpgrade = async (targetPlanId: PlanId) => {
    if (targetPlanId === org?.planId) return;
    setLoading(true);
    setErrorMessage(null);
    setUpgradingPlan(targetPlanId);

    try {
      // 1. Create order
      const { order, error } = await createRazorpaySubscriptionOrder(orgId, targetPlanId, cycle);
      if (error) {
        setErrorMessage(error);
        setLoading(false);
        return;
      }

      // If free plan, upgraded immediately
      if (!order) {
        await reload();
        playSound('success');
        setSuccessMessage(`Successfully switched to ${targetPlanId.toUpperCase()} tier!`);
        setLoading(false);
        return;
      }

      // 2. Mock / Real Razorpay Checkout flow
      const mockPaymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const verified = await verifyRazorpayPayment(orgId, targetPlanId, cycle, {
        razorpay_payment_id: mockPaymentId,
        razorpay_order_id: order.orderId
      });

      if (verified) {
        await reload();
        playSound('success');
        setSuccessMessage(`Payment confirmed! Organization upgraded to ${targetPlanId.toUpperCase()} tier.`);
      } else {
        setErrorMessage('Payment verification failed.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to complete plan upgrade.');
    } finally {
      setLoading(false);
      setUpgradingPlan(null);
    }
  };

  const calcPercentage = (current: number, max: number) => {
    if (max === -1) return 0;
    return Math.min(100, Math.round((current / max) * 100));
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '860px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
          padding: '28px'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 8px',
                background: 'var(--bg-elevated)',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--text-secondary)',
                marginBottom: '6px'
              }}
            >
              <CreditCard size={11} color="var(--accent)" />
              <span>Subscription & Platform Quotas</span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>
              {org?.name} — Tier & Usage
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              borderRadius: 'var(--radius-sm)',
              color: '#22c55e',
              fontSize: '13px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 'var(--radius-sm)',
              color: '#ef4444',
              fontSize: '13px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <AlertTriangle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Active Tier Summary Card */}
        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '20px',
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px'
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
              Current Active Tier
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '2px' }}>
              {currentPlan.name}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Status: <strong style={{ color: '#22c55e' }}>{org?.subscriptionStatus?.toUpperCase()}</strong>
              {org?.trialEndsAt && org.subscriptionStatus === 'trialing' && (
                <span> (Trial ends {new Date(org.trialEndsAt).toLocaleDateString()})</span>
              )}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: 800 }}>
              ₹{currentPlan.priceInrMonthly.toLocaleString('en-IN')}{' '}
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>/mo</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Integrated Razorpay Billing
            </div>
          </div>
        </div>

        {/* Real-Time Quota Usage Meters */}
        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 14px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Current Resource Consumption & Limits
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '28px' }}>
          {[
            {
              label: 'Students / Workstations',
              current: usage.studentsCount,
              max: currentPlan.maxStudents
            },
            {
              label: 'Concurrent Exam Halls',
              current: usage.examsCount,
              max: currentPlan.maxExams
            },
            {
              label: 'Monthly Submissions',
              current: usage.monthlySubmissionsCount,
              max: currentPlan.maxMonthlySubmissions
            },
            {
              label: 'Faculty Evaluators',
              current: usage.evaluatorsCount,
              max: currentPlan.maxEvaluators
            }
          ].map((item, idx) => {
            const pct = calcPercentage(item.current, item.max);
            const isUnlimited = item.max === -1;
            return (
              <div
                key={idx}
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '14px'
                }}
              >
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>
                  {item.current}{' '}
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    / {isUnlimited ? 'Unlimited' : item.max.toLocaleString('en-IN')}
                  </span>
                </div>
                {!isUnlimited && (
                  <div style={{ width: '100%', height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: pct > 85 ? '#ef4444' : 'var(--accent)'
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Plan Upgrade Selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Available Tiers & Upgrades
          </h3>
          <div style={{ display: 'inline-flex', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '999px', padding: '2px' }}>
            <button
              type="button"
              onClick={() => setCycle('monthly')}
              style={{
                padding: '4px 12px',
                border: 'none',
                background: cycle === 'monthly' ? 'var(--accent)' : 'transparent',
                color: cycle === 'monthly' ? '#ffffff' : 'var(--text-secondary)',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setCycle('yearly')}
              style={{
                padding: '4px 12px',
                border: 'none',
                background: cycle === 'yearly' ? 'var(--accent)' : 'transparent',
                color: cycle === 'yearly' ? '#ffffff' : 'var(--text-secondary)',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Yearly (-20%)
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          {plans.map((p) => {
            const isCurrent = org?.planId === p.id;
            const price = cycle === 'yearly' ? p.priceInrYearly : p.priceInrMonthly;
            return (
              <div
                key={p.id}
                style={{
                  background: 'var(--bg-primary)',
                  border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '14px', marginBottom: '4px' }}>{p.name}</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '10px' }}>
                    ₹{price.toLocaleString('en-IN')}{' '}
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>/{cycle === 'yearly' ? 'yr' : 'mo'}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    {p.maxStudents === -1 ? 'Unlimited' : p.maxStudents} Students, {p.maxExams === -1 ? 'Unlimited' : p.maxExams} Halls
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isCurrent || loading}
                  onClick={() => handleUpgrade(p.id)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: isCurrent ? 'var(--bg-elevated)' : 'var(--accent)',
                    color: isCurrent ? 'var(--text-secondary)' : '#ffffff',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: isCurrent ? 'default' : 'pointer'
                  }}
                >
                  {isCurrent ? 'Active Tier' : upgradingPlan === p.id ? 'Processing...' : 'Switch to Tier'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SubscriptionBillingModal;
