// ============================================================================
// AXENT SaaS MULTI-TENANT ENGINE & SUBSCRIPTION SERVICE
// Isolated Tenant Context, Quotas, Usage Meters, and Billing Orchestration
// ============================================================================

import {
  Organization,
  OrganizationSettings,
  OrganizationMember,
  SubscriptionPlan,
  Subscription,
  OrgUsage,
  PlanLimitCheck,
  AuditLogEntry,
  PlatformMetrics,
  PlanId,
  BillingCycle,
  OrganizationRole
} from '../types/saas';
import { supabase, isSupabaseConnected } from './supabaseService';

export const DEFAULT_ORG_ID = 'default_org';

export const DEFAULT_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free Community',
    badge: 'Open Access',
    description: 'Perfect for small classrooms, internal trials, and coding clubs.',
    priceInrMonthly: 0,
    priceInrYearly: 0,
    maxStudents: 50,
    maxExams: 2,
    maxAdmins: 1,
    maxEvaluators: 2,
    maxMonthlySubmissions: 200,
    features: [
      'Up to 50 Registered Students',
      '2 Concurrent Examinations',
      'Standard In-Browser Compiler',
      'Basic MCQ Assessment Engine',
      'Community Documentation'
    ],
    isActive: true
  },
  {
    id: 'starter',
    name: 'Starter Campus',
    badge: 'Popular for Departments',
    description: 'Designed for individual college departments and mid-size training institutes.',
    priceInrMonthly: 4999,
    priceInrYearly: 49990,
    maxStudents: 500,
    maxExams: 10,
    maxAdmins: 3,
    maxEvaluators: 15,
    maxMonthlySubmissions: 5000,
    features: [
      'Up to 500 Active Students',
      '10 Simultaneous Examinations',
      '3 Organization Administrators',
      '15 Faculty Evaluators',
      'Multi-Language Cloud Compiler',
      'Standard CCTV Terminal Proctoring',
      'AI Question Generator (100 Qs/mo)',
      'CSV / Excel Report Export'
    ],
    isActive: true
  },
  {
    id: 'professional',
    name: 'Professional Institutional',
    badge: 'Most Popular',
    description: 'Comprehensive evaluation platform for engineering colleges and universities.',
    priceInrMonthly: 14999,
    priceInrYearly: 149990,
    maxStudents: 2500,
    maxExams: 50,
    maxAdmins: 10,
    maxEvaluators: 50,
    maxMonthlySubmissions: 30000,
    features: [
      'Up to 2,500 Active Students',
      '50 Concurrent Examination Halls',
      '10 Organization Admins',
      '50 Faculty Evaluators',
      'High-Def Real-Time CCTV Wall',
      'Emergency Unlock Key Management',
      'Deep AI Keystroke Forensics',
      'WhatsApp Group Result Dispatch',
      'Automated Anti-Cheating Dossiers',
      'Priority Email & Chat Support'
    ],
    isActive: true
  },
  {
    id: 'enterprise',
    name: 'Enterprise University',
    badge: 'Custom Scale',
    description: 'Autonomous multi-campus governance for major universities and accrediting bodies.',
    priceInrMonthly: 39999,
    priceInrYearly: 399990,
    maxStudents: -1,
    maxExams: -1,
    maxAdmins: -1,
    maxEvaluators: -1,
    maxMonthlySubmissions: -1,
    features: [
      'Unlimited Students & Workstations',
      'Unlimited Simultaneous Examinations',
      'Unlimited Admins & Faculty',
      'Dedicated Intranet Judge0 Server Node',
      'Custom Institutional Subdomain',
      'Custom Branding & Institutional Logo',
      'Automated Audit Trail & Ledger',
      '99.95% SLA & Dedicated Account Manager'
    ],
    isActive: true
  }
];

export const DEFAULT_ORGANIZATION: Organization = {
  id: DEFAULT_ORG_ID,
  name: 'AXENT Campus Hub',
  slug: 'default',
  domain: 'axent.edu',
  logoUrl: '',
  planId: 'professional',
  subscriptionStatus: 'active',
  settings: {
    campusName: 'AXENT Autonomous Institute',
    proctoringStrictness: 'standard',
    defaultResultDeclarationMode: 'IMMEDIATE',
    enableDualScreenDetection: true
  },
  createdAt: 1735689600000, // Jan 1, 2026
  updatedAt: 1735689600000
};

// ── Storage Keys ─────────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  ACTIVE_ORG_ID: 'axent_active_org_id',
  ORGANIZATIONS: 'axent_organizations_cache',
  SUBSCRIPTIONS: 'axent_subscriptions_cache',
  MEMBERS: 'axent_org_members_cache',
  AUDIT_LOGS: 'axent_audit_logs',
  EVENT_ORG_CHANGED: 'axent_org_changed'
};

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, val: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (err) {
    console.warn('[saasService] localStorage write error:', err);
  }
}

// ── Active Organization Context ──────────────────────────────────────────────

export function getActiveOrgId(): string {
  if (typeof window === 'undefined') return DEFAULT_ORG_ID;
  const stored = localStorage.getItem(STORAGE_KEYS.ACTIVE_ORG_ID) || sessionStorage.getItem(STORAGE_KEYS.ACTIVE_ORG_ID);
  if (stored && stored.trim()) return stored.trim();
  return DEFAULT_ORG_ID;
}

export function setActiveOrgId(orgId: string): void {
  const clean = (orgId || '').trim() || DEFAULT_ORG_ID;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ORG_ID, clean);
    sessionStorage.setItem(STORAGE_KEYS.ACTIVE_ORG_ID, clean);
    window.dispatchEvent(new CustomEvent(STORAGE_KEYS.EVENT_ORG_CHANGED, { detail: clean }));
    window.dispatchEvent(new Event('storage'));
  }
}

export function onActiveOrgChanged(callback: (orgId: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: any) => {
    callback(e.detail || getActiveOrgId());
  };
  window.addEventListener(STORAGE_KEYS.EVENT_ORG_CHANGED, handler);
  return () => window.removeEventListener(STORAGE_KEYS.EVENT_ORG_CHANGED, handler);
}

// ── Organization CRUD & Directory ────────────────────────────────────────────

export async function getAllOrganizations(): Promise<Organization[]> {
  const local = safeGet<Organization[]>(STORAGE_KEYS.ORGANIZATIONS, [DEFAULT_ORGANIZATION]);
  
  if (!isSupabaseConnected()) {
    return local;
  }

  try {
    const { data, error } = await supabase.from('organizations').select('*').order('created_at', { ascending: false });
    if (error || !data) {
      return local;
    }

    const cloudOrgs: Organization[] = data.map((row: any) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      domain: row.domain || '',
      logoUrl: row.logo_url || '',
      planId: row.plan_id || 'starter',
      subscriptionStatus: row.subscription_status || 'active',
      trialEndsAt: row.trial_ends_at ? Number(row.trial_ends_at) : undefined,
      settings: row.settings || {},
      createdAt: Number(row.created_at) || Date.now(),
      updatedAt: Number(row.updated_at) || Date.now()
    }));

    // Ensure default organization is always present
    if (!cloudOrgs.some((o) => o.id === DEFAULT_ORG_ID)) {
      cloudOrgs.unshift(DEFAULT_ORGANIZATION);
    }

    safeSet(STORAGE_KEYS.ORGANIZATIONS, cloudOrgs);
    return cloudOrgs;
  } catch {
    return local;
  }
}

export async function getOrganizationById(orgId: string): Promise<Organization | null> {
  const all = await getAllOrganizations();
  return all.find((o) => o.id === orgId) || (orgId === DEFAULT_ORG_ID ? DEFAULT_ORGANIZATION : null);
}

export async function createOrganization(params: {
  name: string;
  slug: string;
  domain?: string;
  adminEmail: string;
  adminName: string;
  planId?: PlanId;
  settings?: OrganizationSettings;
}): Promise<{ org: Organization; error: string | null }> {
  const cleanName = params.name.trim();
  const cleanSlug = params.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  
  if (!cleanName) return { org: null as any, error: 'Organization name is required.' };
  if (!cleanSlug) return { org: null as any, error: 'Organization slug URL identifier is required.' };

  const all = await getAllOrganizations();
  if (all.some((o) => o.slug === cleanSlug)) {
    return { org: null as any, error: 'An organization with this URL identifier already exists.' };
  }

  const newId = `org_${cleanSlug.replace(/-/g, '_')}_${Date.now().toString(36)}`;
  const planId = params.planId || 'starter';
  const now = Date.now();
  const trialEnds = now + 14 * 24 * 60 * 60 * 1000; // 14-day free trial

  const newOrg: Organization = {
    id: newId,
    name: cleanName,
    slug: cleanSlug,
    domain: params.domain?.trim().toLowerCase() || '',
    logoUrl: '',
    planId,
    subscriptionStatus: planId === 'free' ? 'active' : 'trialing',
    trialEndsAt: trialEnds,
    settings: params.settings || {
      proctoringStrictness: 'standard',
      defaultResultDeclarationMode: 'IMMEDIATE',
      enableDualScreenDetection: true
    },
    createdAt: now,
    updatedAt: now
  };

  // 1. Persist to Supabase if table exists
  if (isSupabaseConnected()) {
    try {
      await supabase.from('organizations').upsert({
        id: newOrg.id,
        name: newOrg.name,
        slug: newOrg.slug,
        domain: newOrg.domain,
        logo_url: newOrg.logoUrl,
        plan_id: newOrg.planId,
        subscription_status: newOrg.subscriptionStatus,
        trial_ends_at: newOrg.trialEndsAt,
        settings: newOrg.settings,
        created_at: newOrg.createdAt,
        updated_at: newOrg.updatedAt
      });

      // Create admin membership
      await supabase.from('organization_members').upsert({
        id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        org_id: newOrg.id,
        user_id: params.adminEmail.toLowerCase(),
        email: params.adminEmail.toLowerCase(),
        role: 'org_admin',
        status: 'active',
        created_at: now
      });

      // Create initial subscription
      await supabase.from('subscriptions').upsert({
        id: `sub_${newOrg.id}`,
        org_id: newOrg.id,
        plan_id: planId,
        status: newOrg.subscriptionStatus,
        billing_cycle: 'monthly',
        current_period_start: now,
        current_period_end: trialEnds,
        usage: { studentsCount: 0, examsCount: 0, adminsCount: 1, evaluatorsCount: 0, monthlySubmissionsCount: 0 },
        updated_at: now
      });
    } catch (err) {
      console.warn('[saasService] Supabase organization sync fallback:', err);
    }
  }

  // 2. Persist to local cache
  const updatedAll = [newOrg, ...all];
  safeSet(STORAGE_KEYS.ORGANIZATIONS, updatedAll);

  // Switch to new organization automatically
  setActiveOrgId(newOrg.id);

  // Log audit trail
  logAuditEvent(newOrg.id, 'ORGANIZATION_CREATED', 'Organization', {
    name: newOrg.name,
    plan: newOrg.planId,
    adminEmail: params.adminEmail
  });

  return { org: newOrg, error: null };
}

export async function updateOrganization(orgId: string, updates: Partial<Organization>): Promise<boolean> {
  const all = await getAllOrganizations();
  const idx = all.findIndex((o) => o.id === orgId);
  if (idx === -1) return false;

  const now = Date.now();
  const updated: Organization = {
    ...all[idx],
    ...updates,
    updatedAt: now
  };
  all[idx] = updated;
  safeSet(STORAGE_KEYS.ORGANIZATIONS, all);

  if (isSupabaseConnected()) {
    try {
      await supabase.from('organizations').update({
        name: updated.name,
        domain: updated.domain,
        logo_url: updated.logoUrl,
        plan_id: updated.planId,
        subscription_status: updated.subscriptionStatus,
        settings: updated.settings,
        updated_at: now
      }).eq('id', orgId);
    } catch {}
  }

  logAuditEvent(orgId, 'ORGANIZATION_UPDATED', 'Organization', updates as any);
  return true;
}

export async function deleteOrganization(orgId: string): Promise<boolean> {
  if (orgId === DEFAULT_ORG_ID) {
    console.warn('Cannot delete the root default organization.');
    return false;
  }
  const all = await getAllOrganizations();
  const filtered = all.filter((o) => o.id !== orgId);
  safeSet(STORAGE_KEYS.ORGANIZATIONS, filtered);

  if (isSupabaseConnected()) {
    try {
      await supabase.from('organizations').delete().eq('id', orgId);
      await supabase.from('subscriptions').delete().eq('org_id', orgId);
      await supabase.from('organization_members').delete().eq('org_id', orgId);
    } catch {}
  }

  if (getActiveOrgId() === orgId) {
    setActiveOrgId(DEFAULT_ORG_ID);
  }

  logAuditEvent(orgId, 'ORGANIZATION_DELETED', 'Organization', { orgId });
  return true;
}

// ── Subscription Plans & Quotas ──────────────────────────────────────────────

export function getSubscriptionPlans(): SubscriptionPlan[] {
  return DEFAULT_PLANS;
}

export function getPlanById(planId: PlanId): SubscriptionPlan {
  return DEFAULT_PLANS.find((p) => p.id === planId) || DEFAULT_PLANS[1]; // Fallback to starter
}

export async function getSubscription(orgId: string): Promise<Subscription> {
  const org = await getOrganizationById(orgId);
  const planId = org?.planId || 'starter';
  const now = Date.now();
  const fallback: Subscription = {
    id: `sub_${orgId}`,
    orgId,
    planId,
    status: org?.subscriptionStatus || 'active',
    billingCycle: 'monthly',
    currentPeriodStart: now - 15 * 86400000,
    currentPeriodEnd: now + 15 * 86400000,
    usage: await getOrgUsageMetrics(orgId),
    updatedAt: now
  };

  if (!isSupabaseConnected()) {
    return fallback;
  }

  try {
    const { data } = await supabase.from('subscriptions').select('*').eq('org_id', orgId).maybeSingle();
    if (!data) return fallback;

    return {
      id: data.id,
      orgId: data.org_id,
      planId: data.plan_id as PlanId,
      status: data.status,
      billingCycle: data.billing_cycle as BillingCycle,
      currentPeriodStart: Number(data.current_period_start),
      currentPeriodEnd: Number(data.current_period_end),
      razorpayCustomerId: data.razorpay_customer_id,
      razorpaySubscriptionId: data.razorpay_subscription_id,
      usage: data.usage || fallback.usage,
      updatedAt: Number(data.updated_at)
    };
  } catch {
    return fallback;
  }
}

export async function getOrgUsageMetrics(orgId: string): Promise<OrgUsage> {
  let studentsCount = 0;
  let examsCount = 0;
  let adminsCount = 1;
  let evaluatorsCount = 1;
  let monthlySubmissionsCount = 0;

  if (isSupabaseConnected()) {
    try {
      const [exRes, attRes, stRes, memRes] = await Promise.all([
        supabase.from('mcq_exams').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
        supabase.from('mcq_attempts').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
        supabase.from('candidate_stations').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
        supabase.from('organization_members').select('id, role').eq('org_id', orgId)
      ]);

      examsCount = exRes.count || 0;
      monthlySubmissionsCount = attRes.count || 0;
      studentsCount = stRes.count || 0;

      if (memRes.data) {
        adminsCount = memRes.data.filter((m: any) => m.role === 'org_admin' || m.role === 'super_admin').length || 1;
        evaluatorsCount = memRes.data.filter((m: any) => m.role === 'evaluator').length || 1;
      }
    } catch {}
  }

  return {
    studentsCount,
    examsCount,
    adminsCount,
    evaluatorsCount,
    monthlySubmissionsCount
  };
}

export async function checkPlanLimit(
  orgId: string,
  metric: 'maxStudents' | 'maxExams' | 'maxAdmins' | 'maxEvaluators' | 'maxMonthlySubmissions',
  increment: number = 1
): Promise<PlanLimitCheck> {
  const org = await getOrganizationById(orgId);
  const plan = getPlanById(org?.planId || 'starter');
  const usage = await getOrgUsageMetrics(orgId);

  const metricToUsageKey: Record<string, keyof OrgUsage> = {
    maxStudents: 'studentsCount',
    maxExams: 'examsCount',
    maxAdmins: 'adminsCount',
    maxEvaluators: 'evaluatorsCount',
    maxMonthlySubmissions: 'monthlySubmissionsCount'
  };

  const usageKey = metricToUsageKey[metric];
  const current = usage[usageKey] || 0;
  const max = plan[metric];

  // -1 indicates unlimited capacity
  if (max === -1) {
    return {
      allowed: true,
      metric: usageKey,
      current,
      max: Infinity,
      percentageUsed: 0
    };
  }

  const allowed = current + increment <= max;
  const percentageUsed = Math.min(100, Math.round((current / max) * 100));

  return {
    allowed,
    metric: usageKey,
    current,
    max,
    percentageUsed,
    reason: allowed ? undefined : `Organization has reached its plan limit of ${max} for this metric on the ${plan.name} plan.`
  };
}

// ── Razorpay Payment Gateway Integration (India SaaS Billing) ────────────────

export interface RazorpayOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  planName: string;
  billingCycle: BillingCycle;
}

export async function createRazorpaySubscriptionOrder(
  orgId: string,
  targetPlanId: PlanId,
  cycle: BillingCycle
): Promise<{ order: RazorpayOrderResponse | null; error: string | null }> {
  const plan = getPlanById(targetPlanId);
  const amount = cycle === 'yearly' ? plan.priceInrYearly : plan.priceInrMonthly;
  
  if (amount === 0) {
    // Free plan instant activation
    await upgradeSubscriptionPlan(orgId, 'free', 'monthly');
    return { order: null, error: null };
  }

  const orderId = `order_${orgId.substring(0, 8)}_${Date.now()}`;
  const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_axent_platform_demo';

  return {
    order: {
      orderId,
      amount: amount * 100, // In Paise (INR)
      currency: 'INR',
      keyId,
      planName: plan.name,
      billingCycle: cycle
    },
    error: null
  };
}

export async function verifyRazorpayPayment(
  orgId: string,
  targetPlanId: PlanId,
  cycle: BillingCycle,
  paymentDetails: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature?: string }
): Promise<boolean> {
  if (!paymentDetails.razorpay_payment_id) return false;

  await upgradeSubscriptionPlan(orgId, targetPlanId, cycle, paymentDetails.razorpay_payment_id);
  logAuditEvent(orgId, 'PAYMENT_RECEIVED', 'Subscription', {
    planId: targetPlanId,
    billingCycle: cycle,
    paymentId: paymentDetails.razorpay_payment_id,
    orderId: paymentDetails.razorpay_order_id
  });
  return true;
}

export async function upgradeSubscriptionPlan(
  orgId: string,
  newPlanId: PlanId,
  cycle: BillingCycle = 'monthly',
  paymentId?: string
): Promise<boolean> {
  const now = Date.now();
  const periodDuration = cycle === 'yearly' ? 365 * 86400000 : 30 * 86400000;
  const periodEnd = now + periodDuration;

  await updateOrganization(orgId, {
    planId: newPlanId,
    subscriptionStatus: 'active'
  });

  if (isSupabaseConnected()) {
    try {
      await supabase.from('subscriptions').upsert({
        id: `sub_${orgId}`,
        org_id: orgId,
        plan_id: newPlanId,
        status: 'active',
        billing_cycle: cycle,
        current_period_start: now,
        current_period_end: periodEnd,
        razorpay_customer_id: paymentId ? `cust_${paymentId}` : undefined,
        updated_at: now
      });
    } catch {}
  }

  logAuditEvent(orgId, 'PLAN_UPGRADED', 'Subscription', {
    newPlanId,
    billingCycle: cycle,
    paymentId
  });

  return true;
}

// ── Platform-Level Super Admin Metrics & Telemetry ───────────────────────────

export async function getPlatformSuperAdminMetrics(): Promise<PlatformMetrics> {
  const orgs = await getAllOrganizations();
  const activeOrgs = orgs.filter((o) => o.subscriptionStatus === 'active' || o.subscriptionStatus === 'trialing');

  let totalStudents = 0;
  let totalExaminations = 0;
  let totalSubmissions = 0;
  let mrr = 0;

  const planDistribution: Record<PlanId, number> = {
    free: 0,
    starter: 0,
    professional: 0,
    enterprise: 0
  };

  orgs.forEach((o) => {
    planDistribution[o.planId] = (planDistribution[o.planId] || 0) + 1;
    const plan = getPlanById(o.planId);
    if (o.subscriptionStatus === 'active') {
      mrr += plan.priceInrMonthly;
    }
  });

  if (isSupabaseConnected()) {
    try {
      const [attRes, exRes, stRes] = await Promise.all([
        supabase.from('mcq_attempts').select('id', { count: 'exact', head: true }),
        supabase.from('mcq_exams').select('id', { count: 'exact', head: true }),
        supabase.from('candidate_stations').select('id', { count: 'exact', head: true })
      ]);
      totalSubmissions = attRes.count || 0;
      totalExaminations = exRes.count || 0;
      totalStudents = stRes.count || 0;
    } catch {}
  }

  return {
    totalOrganizations: orgs.length,
    activeOrganizations: activeOrgs.length,
    totalStudents,
    totalExaminations,
    totalSubmissions,
    monthlyRecurringRevenueInr: mrr,
    planDistribution,
    activeProctoredSessions: totalStudents
  };
}

// ── Forensic Audit Logging Engine ────────────────────────────────────────────

export function logAuditEvent(
  orgId: string,
  action: string,
  resource: string,
  details: Record<string, unknown> = {}
): void {
  const entry: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    orgId: orgId || DEFAULT_ORG_ID,
    userId: typeof window !== 'undefined' ? localStorage.getItem('axent_authority_email') || 'system' : 'system',
    userEmail: typeof window !== 'undefined' ? localStorage.getItem('axent_authority_email') || 'system@axent.edu' : 'system@axent.edu',
    action,
    resource,
    details,
    ipAddress: 'Client Telemetry Bus',
    createdAt: Date.now()
  };

  const logs = safeGet<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOGS, []);
  logs.unshift(entry);
  safeSet(STORAGE_KEYS.AUDIT_LOGS, logs.slice(0, 300)); // Keep latest 300 logs

  if (isSupabaseConnected()) {
    try {
      void supabase.from('audit_logs').insert({
        id: entry.id,
        org_id: entry.orgId,
        user_id: entry.userId,
        user_email: entry.userEmail,
        action: entry.action,
        resource: entry.resource,
        details: entry.details,
        ip_address: entry.ipAddress,
        created_at: entry.createdAt
      });
    } catch {}
  }
}

export async function getAuditLogs(orgId?: string): Promise<AuditLogEntry[]> {
  const local = safeGet<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOGS, []);
  if (!isSupabaseConnected()) {
    return orgId ? local.filter((l) => l.orgId === orgId) : local;
  }

  try {
    let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
    if (orgId && orgId !== 'all') {
      query = query.eq('org_id', orgId);
    }
    const { data } = await query;
    if (data && data.length > 0) {
      return data.map((r: any) => ({
        id: r.id,
        orgId: r.org_id,
        userId: r.user_id,
        userEmail: r.user_email,
        action: r.action,
        resource: r.resource,
        details: r.details,
        ipAddress: r.ip_address,
        createdAt: Number(r.created_at)
      }));
    }
    return orgId ? local.filter((l) => l.orgId === orgId) : local;
  } catch {
    return orgId ? local.filter((l) => l.orgId === orgId) : local;
  }
}
