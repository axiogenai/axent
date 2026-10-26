/**
 * emergencyKeyService.ts
 * 
 * High-Security One-Time Usable Daily Emergency Unlock Key Service.
 * Designed for large-scale institutional examinations (1000+ candidates).
 * 
 * Rules:
 *  1. One key is active per day (single-use voucher).
 *  2. Usable strictly ONCE in a day across the entire campus.
 *  3. Once consumed on ANY terminal (MCQ or Coding Exam), it is IMMEDIATELY marked
 *     CONSUMED & EXPIRED for the rest of the day.
 *  4. Any subsequent attempt to reuse the key is permanently rejected with forensic details.
 *  5. Replicates in real-time across all terminals via CCTV broadcast bus, storage events, and cloud sync.
 *  6. Faculty can inspect key status, view consumption audit dossiers, or issue an authorized replacement voucher.
 */

import { broadcastCctvMessage, subscribeToCctvBroadcast } from './adminService';

export interface EmergencyKeyUsageRecord {
  stationId: string;
  labId?: string;
  candidateName?: string;
  candidateRoll?: string;
  examTitle?: string;
  timestamp: number;
}

export interface DailyEmergencyKey {
  keyId: string;
  code: string;               // e.g. "CSE-8421" or "AXENT-7193"
  dateStr: string;            // YYYY-MM-DD
  status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED';
  maxUses: number;            // Strictly 1
  usageCount: number;         // 0 or 1
  usageRecord?: EmergencyKeyUsageRecord;
  createdAt: number;
  createdBy: string;
  notes?: string;
}

export interface EmergencyKeyValidationResult {
  valid: boolean;
  reason?: 'ALREADY_CONSUMED' | 'INVALID_CODE' | 'EXPIRED_DATE';
  message: string;
  key?: DailyEmergencyKey;
}

const STORAGE_ACTIVE_KEY = 'codedna_daily_emergency_key';
const STORAGE_HISTORY_KEY = 'codedna_emergency_key_history';
const STORAGE_BUS_TICK = 'codedna_emergency_key_tick';

/**
 * Returns today's date formatted as YYYY-MM-DD in local system time.
 */
export function getTodayDateStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generates a clean, unambiguous 6-to-8 character institutional voucher code.
 * Format: "CSE-XXXX" (e.g. "CSE-7429")
 */
export function generateRandomVoucherCode(prefix = 'CSE'): string {
  const cleanPrefix = prefix.replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'CSE';
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${cleanPrefix}-${digits}`;
}

/**
 * Retrieves the full audit history of emergency keys.
 */
export function getEmergencyKeyHistory(): DailyEmergencyKey[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Saves a key to the history ledger.
 */
function archiveKeyToHistory(key: DailyEmergencyKey): void {
  if (typeof window === 'undefined') return;
  try {
    const history = getEmergencyKeyHistory();
    // Prevent duplicate entries
    const exists = history.some((h) => h.keyId === key.keyId);
    if (!exists) {
      history.unshift(key);
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
    }
  } catch (e) {
    console.warn('[EmergencyKeyService] Failed to archive key:', e);
  }
}

/**
 * Gets or creates today's active single-use emergency unlock key.
 * Automatically archives previous days' keys.
 */
export function getTodayEmergencyKey(): DailyEmergencyKey {
  const todayStr = getTodayDateStr();

  if (typeof window === 'undefined') {
    return {
      keyId: `EMG-${todayStr}-INIT`,
      code: 'CSE-PROCTOR-2026',
      dateStr: todayStr,
      status: 'ACTIVE',
      maxUses: 1,
      usageCount: 0,
      createdAt: Date.now(),
      createdBy: 'Examination Control Room'
    };
  }

  try {
    const stored = localStorage.getItem(STORAGE_ACTIVE_KEY);
    if (stored) {
      const parsed: DailyEmergencyKey = JSON.parse(stored);
      // If it's valid for today, return it directly
      if (parsed && parsed.dateStr === todayStr) {
        return parsed;
      }
      // If it belongs to an earlier day, mark EXPIRED and archive
      if (parsed && parsed.dateStr !== todayStr) {
        if (parsed.status === 'ACTIVE') {
          parsed.status = 'EXPIRED';
        }
        archiveKeyToHistory(parsed);
      }
    }

    // Check if legacy PIN was configured by user in settings
    const legacyPin = localStorage.getItem('codedna_proctor_security_pin');
    const initialCode = legacyPin && legacyPin.trim() ? legacyPin.trim().toUpperCase() : generateRandomVoucherCode('CSE');

    const newKey: DailyEmergencyKey = {
      keyId: `EMG-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`,
      code: initialCode,
      dateStr: todayStr,
      status: 'ACTIVE',
      maxUses: 1,
      usageCount: 0,
      createdAt: Date.now(),
      createdBy: 'University Examination Board',
      notes: 'Initial single-use daily emergency unlock voucher'
    };

    localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify(newKey));
    return newKey;
  } catch (err) {
    console.error('[EmergencyKeyService] Error loading active key:', err);
    return {
      keyId: `EMG-${todayStr}-FALLBACK`,
      code: 'CSE-PROCTOR-2026',
      dateStr: todayStr,
      status: 'ACTIVE',
      maxUses: 1,
      usageCount: 0,
      createdAt: Date.now(),
      createdBy: 'Fallback Controller'
    };
  }
}

/**
 * Validates and consumes the emergency unlock key.
 * Strictly single use: Once consumed, it is permanently locked out for the remainder of today.
 */
export function validateAndConsumeEmergencyKey(
  enteredCode: string,
  stationId: string,
  candidateInfo?: {
    name?: string;
    roll?: string;
    labId?: string;
    examTitle?: string;
  }
): EmergencyKeyValidationResult {
  const cleanCode = (enteredCode || '').trim().toUpperCase();
  if (!cleanCode) {
    return {
      valid: false,
      reason: 'INVALID_CODE',
      message: 'Please enter the invigilator emergency authorization key.'
    };
  }

  const currentKey = getTodayEmergencyKey();
  const todayStr = getTodayDateStr();

  // Check against historical consumed keys first to provide clear diagnostics
  const history = getEmergencyKeyHistory();
  const matchedHistoric = history.find((h) => h.code === cleanCode);
  if (matchedHistoric && matchedHistoric.keyId !== currentKey.keyId) {
    return {
      valid: false,
      reason: 'ALREADY_CONSUMED',
      message: `REJECTED: This emergency key was already used on ${matchedHistoric.dateStr} and has permanently expired. Each key is single-use only.`,
      key: matchedHistoric
    };
  }

  // Check code match
  if (cleanCode !== currentKey.code) {
    return {
      valid: false,
      reason: 'INVALID_CODE',
      message: 'Invalid Emergency Unlock Key. Verification failed. Terminal remains locked.'
    };
  }

  // Check date validity
  if (currentKey.dateStr !== todayStr) {
    return {
      valid: false,
      reason: 'EXPIRED_DATE',
      message: `This emergency key is for date ${currentKey.dateStr} and is expired for today.`
    };
  }

  // Check single-use consumption rule
  if (currentKey.status === 'CONSUMED' || currentKey.usageCount >= currentKey.maxUses) {
    const timeStr = currentKey.usageRecord?.timestamp
      ? new Date(currentKey.usageRecord.timestamp).toLocaleTimeString()
      : 'earlier today';
    const stationStr = currentKey.usageRecord?.stationId || 'another workstation';
    const candidateStr = currentKey.usageRecord?.candidateName
      ? ` by ${currentKey.usageRecord.candidateName}`
      : '';

    return {
      valid: false,
      reason: 'ALREADY_CONSUMED',
      message: `REJECTED: Today's single-use emergency key has already been consumed at ${timeStr} on ${stationStr}${candidateStr}. It cannot be reused. Contact the Chief Proctor.`,
      key: currentKey
    };
  }

  if (currentKey.status === 'EXPIRED') {
    return {
      valid: false,
      reason: 'EXPIRED_DATE',
      message: 'This emergency key is expired and cannot be used.'
    };
  }

  // ── KEY IS VALID AND UNCONSUMED: CONSUME IT IMMEDIATELY ──
  const now = Date.now();
  const usageRecord: EmergencyKeyUsageRecord = {
    stationId,
    labId: candidateInfo?.labId,
    candidateName: candidateInfo?.name || 'Candidate',
    candidateRoll: candidateInfo?.roll || 'N/A',
    examTitle: candidateInfo?.examTitle || 'Live Examination',
    timestamp: now
  };

  const consumedKey: DailyEmergencyKey = {
    ...currentKey,
    status: 'CONSUMED',
    usageCount: 1,
    usageRecord
  };

  // 1. Write to local storage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify(consumedKey));
      localStorage.setItem(STORAGE_BUS_TICK, `${now}_${Math.random()}`);
    } catch (err) {
      console.warn('[EmergencyKeyService] Failed saving consumed state:', err);
    }
  }

  // 2. Archive consumed key in history
  archiveKeyToHistory(consumedKey);

  // 3. Broadcast across CCTV bus and local event listeners so ALL screens in campus sync
  broadcastCctvMessage({
    type: 'EMERGENCY_KEY_CONSUMED',
    emergencyKey: consumedKey,
    stationId,
    labId: candidateInfo?.labId
  });

  // 4. Custom DOM Event
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('codedna_emergency_key_change', { detail: consumedKey }));
    } catch {
      // Ignore
    }
  }

  return {
    valid: true,
    message: `Emergency authorization successful. Terminal ${stationId} unlocked. Key is now consumed and expired.`,
    key: consumedKey
  };
}

/**
 * Generates an authorized replacement emergency key for today.
 * Strictly requires faculty authorization. Archives current consumed key to history.
 */
export function generateReplacementEmergencyKey(
  createdBy = 'Chief Examination Officer',
  customCode?: string,
  notes?: string
): DailyEmergencyKey {
  const todayStr = getTodayDateStr();
  const currentKey = getTodayEmergencyKey();

  // Archive old key
  archiveKeyToHistory(currentKey);

  const cleanCode = (customCode && customCode.trim())
    ? customCode.trim().toUpperCase()
    : generateRandomVoucherCode('CSE');

  const now = Date.now();
  const newKey: DailyEmergencyKey = {
    keyId: `EMG-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`,
    code: cleanCode,
    dateStr: todayStr,
    status: 'ACTIVE',
    maxUses: 1,
    usageCount: 0,
    createdAt: now,
    createdBy,
    notes: notes || 'Faculty-authorized replacement emergency voucher'
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify(newKey));
      localStorage.setItem('codedna_proctor_security_pin', cleanCode);
      localStorage.setItem(STORAGE_BUS_TICK, `${now}_${Math.random()}`);
    } catch (e) {
      console.warn('[EmergencyKeyService] Storage save error:', e);
    }
  }

  // Broadcast update
  broadcastCctvMessage({
    type: 'EMERGENCY_KEY_UPDATE',
    emergencyKey: newKey
  });

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('codedna_emergency_key_change', { detail: newKey }));
    } catch {
      // Ignore
    }
  }

  return newKey;
}

/**
 * Allows faculty to set/customize today's key code directly.
 */
export function updateActiveEmergencyKeyCode(
  newCode: string,
  authorizedBy = 'Chief Proctor'
): DailyEmergencyKey {
  const currentKey = getTodayEmergencyKey();
  const cleanCode = newCode.trim().toUpperCase();

  const updated: DailyEmergencyKey = {
    ...currentKey,
    code: cleanCode,
    createdBy: authorizedBy,
    notes: `Manually updated code by ${authorizedBy}`
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify(updated));
      localStorage.setItem('codedna_proctor_security_pin', cleanCode);
      localStorage.setItem(STORAGE_BUS_TICK, `${Date.now()}_${Math.random()}`);
      window.dispatchEvent(new CustomEvent('codedna_emergency_key_change', { detail: updated }));
    } catch {
      // Ignore
    }
  }

  broadcastCctvMessage({
    type: 'EMERGENCY_KEY_UPDATE',
    emergencyKey: updated
  });

  return updated;
}

/**
 * Subscribes to real-time changes to the emergency key state.
 * Returns an unsubscription function.
 */
export function subscribeToEmergencyKeyChanges(
  callback: (key: DailyEmergencyKey) => void
): () => void {
  // 1. CCTV Bus subscription
  const unsubscribeCctv = subscribeToCctvBroadcast((msg) => {
    if ((msg.type === 'EMERGENCY_KEY_CONSUMED' || msg.type === 'EMERGENCY_KEY_UPDATE') && msg.emergencyKey) {
      callback(msg.emergencyKey);
    }
  });

  // 2. Custom DOM event subscription
  const handleCustomEvent = (e: Event) => {
    const custom = e as CustomEvent<DailyEmergencyKey>;
    if (custom?.detail) {
      callback(custom.detail);
    }
  };

  // 3. Storage event listener (cross-tab / cross-window sync)
  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === STORAGE_ACTIVE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        callback(parsed);
      } catch {
        // Ignore
      }
    } else if (e.key === STORAGE_BUS_TICK) {
      callback(getTodayEmergencyKey());
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('codedna_emergency_key_change', handleCustomEvent);
    window.addEventListener('storage', handleStorageEvent);
  }

  return () => {
    unsubscribeCctv();
    if (typeof window !== 'undefined') {
      window.removeEventListener('codedna_emergency_key_change', handleCustomEvent);
      window.removeEventListener('storage', handleStorageEvent);
    }
  };
}
