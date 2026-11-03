// ============================================================================
// AXENT SaaS MULTI-TENANT TYPE DEFINITIONS
// Production Multi-Tenant SaaS Architecture for Colleges, Universities & Orgs
// ============================================================================

export type OrganizationRole = 'super_admin' | 'org_admin' | 'evaluator' | 'candidate';
export type MemberStatus = 'invited' | 'active' | 'suspended';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';
export type PlanId = 'free' | 'starter' | 'professional' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

export interface OrganizationSettings {
  primaryColor?: string;
  campusName?: string;
  allowedEmailDomains?: string[]; // e.g. ["vitu.edu.in", "college.edu"]
  requireInstitutionalEmail?: boolean;
  proctoringStrictness?: 'standard' | 'strict' | 'maximum';
  enableLiveAudioMonitoring?: boolean;
  enableDualScreenDetection?: boolean;
  defaultResultDeclarationMode?: 'IMMEDIATE' | 'WHATSAPP_GROUP';
  whatsappGroupNotification?: boolean;
  customJudge0Url?: string;
  emergencyKeyPrefix?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  logoUrl?: string;
  planId: PlanId;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt?: number;
  settings: OrganizationSettings;
  createdAt: number;
  updatedAt: number;
}

export interface OrganizationMember {
  id: string;
  orgId: string;
  userId: string;
  email: string;
  role: OrganizationRole;
  fullName?: string;
  department?: string;
  status: MemberStatus;
  createdAt: number;
  lastActiveAt?: number;
}

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  badge?: string;
  description: string;
  priceInrMonthly: number;
  priceInrYearly: number;
  maxStudents: number;        // -1 for unlimited
  maxExams: number;           // -1 for unlimited
  maxAdmins: number;          // -1 for unlimited
  maxEvaluators: number;      // -1 for unlimited
  maxMonthlySubmissions: number; // -1 for unlimited
  features: string[];
  isActive: boolean;
}

export interface OrgUsage {
  studentsCount: number;
  examsCount: number;
  adminsCount: number;
  evaluatorsCount: number;
  monthlySubmissionsCount: number;
  storageMb?: number;
}

export interface Subscription {
  id: string;
  orgId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  razorpayCustomerId?: string;
  razorpaySubscriptionId?: string;
  usage: OrgUsage;
  updatedAt: number;
}

export interface PlanLimitCheck {
  allowed: boolean;
  metric: keyof OrgUsage;
  current: number;
  max: number;
  percentageUsed: number;
  reason?: string;
}

export interface AuditLogEntry {
  id: string;
  orgId: string;
  userId?: string;
  userEmail?: string;
  action: string;
  resource: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: number;
}

export interface PlatformMetrics {
  totalOrganizations: number;
  activeOrganizations: number;
  totalStudents: number;
  totalExaminations: number;
  totalSubmissions: number;
  monthlyRecurringRevenueInr: number;
  planDistribution: Record<PlanId, number>;
  activeProctoredSessions: number;
}
