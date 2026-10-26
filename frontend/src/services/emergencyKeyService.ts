/**
 * emergencyKeyService.ts
 * 
 * High-Security One-Time Usable Emergency Unlock Key Engine.
 * Designed for institutional scale (1000+ candidates across multiple laboratories).
 * 
 * Rules:
 *  1. Keys are strictly SINGLE-USE: Once entered on ANY terminal (MCQ or Coding),
 *     that specific key is IMMEDIATELY marked CONSUMED & EXPIRED.
 *  2. Any attempt to re-use an expired key is permanently rejected with forensic details
 *     (workstation ID, candidate name, roll number, exact timestamp).
 *  3. Faculty can easily generate a new key with 1 click, or generate multiple single-use
 *     vouchers for different lab invigilators.
 *  4. Instant real-time replication across all 1,000+ terminals via CCTV broadcast bus,
 *     DOM events, and localStorage synchronization.
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
  code: string;               // e.g. "CSE-3508" or "AXENT-7193"
  dateStr: string;            // YYYY-MM-DD
  status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED';
  maxUses: number;            // Strictly 1
  usageCount: number;         // 0 or 1
  usageRecord?: EmergencyKeyUsageRecord;
  createdAt: number;
  createdBy: string;
  notes?: string;
  labAssignment?: string;     // e.g. "Lab 01" or "General Campus"
}

export interface EmergencyKeyValidationResult {
  valid: boolean;
  reason?: 'ALREADY_CONSUMED' | 'INVALID_CODE' | 'EXPIRED_DATE';
  message: string;
  key?: DailyEmergencyKey;
}

const STORAGE_ACTIVE_KEYS_LIST = 'codedna_active_emergency_keys_list';
const STORAGE_LEGACY_KEY = 'codedna_daily_emergency_key';
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
 * Generates an unambiguous institutional voucher code.
 * Format: "CSE-XXXX" (e.g. "CSE-3508")
 */
export function generateRandomVoucherCode(prefix = 'CSE'): string {
  const cleanPrefix = prefix.replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'CSE';
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${cleanPrefix}-${digits}`;
}

/**
 * Retrieves the historical log of emergency keys from prior sessions.
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

function archiveKeyToHistory(key: DailyEmergencyKey): void {
  if (typeof window === 'undefined') return;
  try {
    const history = getEmergencyKeyHistory();
    const exists = history.some((h) => h.keyId === key.keyId);
    if (!exists) {
      history.unshift(key);
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
    }
  } catch (e) {
    console.warn('[EmergencyKeyService] Failed to archive key:', e);
  }
}

/**
 * Retrieves all keys valid for today (both ACTIVE and CONSUMED today).
 */
export function getTodayEmergencyKeysList(): DailyEmergencyKey[] {
  const todayStr = getTodayDateStr();

  if (typeof window === 'undefined') {
    return [{
      keyId: `EMG-${todayStr}-INIT`,
      code: 'CSE-PROCTOR-2026',
      dateStr: todayStr,
      status: 'ACTIVE',
      maxUses: 1,
      usageCount: 0,
      createdAt: Date.now(),
      createdBy: 'Examination Control Room'
    }];
  }

  try {
    let keys: DailyEmergencyKey[] = [];
    const stored = localStorage.getItem(STORAGE_ACTIVE_KEYS_LIST);

    if (stored) {
      const parsed: DailyEmergencyKey[] = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // Filter out keys from previous days and archive them
        parsed.forEach((k) => {
          if (k.dateStr === todayStr) {
            keys.push(k);
          } else {
            if (k.status === 'ACTIVE') k.status = 'EXPIRED';
            archiveKeyToHistory(k);
          }
        });
      }
    }

    // Check legacy single-key migration
    if (keys.length === 0) {
      const legacyRaw = localStorage.getItem(STORAGE_LEGACY_KEY);
      if (legacyRaw) {
        try {
          const leg: DailyEmergencyKey = JSON.parse(legacyRaw);
          if (leg && leg.dateStr === todayStr) {
            keys.push(leg);
          }
        } catch {}
      }
    }

    // If still empty, create initial key for today
    if (keys.length === 0) {
      const legacyPin = localStorage.getItem('codedna_proctor_security_pin');
      const initialCode = legacyPin && legacyPin.trim()
        ? legacyPin.trim().toUpperCase()
        : generateRandomVoucherCode('CSE');

      const initialKey: DailyEmergencyKey = {
        keyId: `EMG-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`,
        code: initialCode,
        dateStr: todayStr,
        status: 'ACTIVE',
        maxUses: 1,
        usageCount: 0,
        createdAt: Date.now(),
        createdBy: 'University Examination Board',
        notes: 'Primary 1-time emergency unlock voucher'
      };
      keys.push(initialKey);
    }

    // Save consolidated list
    saveKeysList(keys);
    return keys;
  } catch (err) {
    console.error('[EmergencyKeyService] Error reading keys list:', err);
    return [{
      keyId: `EMG-${todayStr}-FALLBACK`,
      code: 'CSE-PROCTOR-2026',
      dateStr: todayStr,
      status: 'ACTIVE',
      maxUses: 1,
      usageCount: 0,
      createdAt: Date.now(),
      createdBy: 'Fallback Controller'
    }];
  }
}

function saveKeysList(keys: DailyEmergencyKey[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_ACTIVE_KEYS_LIST, JSON.stringify(keys));
    // Keep legacy single key synced with the first available or latest key
    const primary = keys.find((k) => k.status === 'ACTIVE') || keys[keys.length - 1];
    if (primary) {
      localStorage.setItem(STORAGE_LEGACY_KEY, JSON.stringify(primary));
      localStorage.setItem('codedna_proctor_security_pin', primary.code);
    }
  } catch (err) {
    console.warn('[EmergencyKeyService] Failed saving keys list:', err);
  }
}

/**
 * Returns the primary active emergency key for display.
 */
export function getTodayEmergencyKey(): DailyEmergencyKey {
  const list = getTodayEmergencyKeysList();
  // Return first unconsumed active key, or the latest key
  return list.find((k) => k.status === 'ACTIVE') || list[list.length - 1];
}

/**
 * Generates a brand new single-use emergency key.
 * Can either replace the current key or add to the active pool.
 */
export function generateReplacementEmergencyKey(
  createdBy = 'Chief Examination Officer',
  customCode?: string,
  notes?: string,
  addToPool = false
): DailyEmergencyKey {
  const todayStr = getTodayDateStr();
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
    notes: notes || 'Faculty-authorized 1-time emergency voucher'
  };

  const list = getTodayEmergencyKeysList();

  if (addToPool) {
    // Add to pool without replacing
    list.unshift(newKey);
  } else {
    // If replacing, archive existing active keys and put new key at the top
    list.forEach((k) => {
      if (k.status === 'ACTIVE') {
        k.status = 'EXPIRED';
        archiveKeyToHistory(k);
      }
    });
    list.unshift(newKey);
  }

  saveKeysList(list);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_BUS_TICK, `${now}_${Math.random()}`);
      window.dispatchEvent(new CustomEvent('codedna_emergency_key_change', { detail: newKey }));
    } catch {}
  }

  broadcastCctvMessage({
    type: 'EMERGENCY_KEY_UPDATE',
    emergencyKey: newKey
  });

  return newKey;
}

/**
 * Generates a batch of multiple single-use keys (e.g. 5 keys for 5 different lab invigilators).
 */
export function generateBatchEmergencyKeys(
  count = 5,
  prefix = 'CSE',
  createdBy = 'Chief Examination Officer'
): DailyEmergencyKey[] {
  const list = getTodayEmergencyKeysList();
  const todayStr = getTodayDateStr();
  const now = Date.now();
  const newKeys: DailyEmergencyKey[] = [];

  for (let i = 1; i <= count; i++) {
    const key: DailyEmergencyKey = {
      keyId: `EMG-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}-${i}`,
      code: generateRandomVoucherCode(prefix),
      dateStr: todayStr,
      status: 'ACTIVE',
      maxUses: 1,
      usageCount: 0,
      createdAt: now,
      createdBy,
      labAssignment: `Lab ${i}`,
      notes: `Batch voucher #${i} for invigilator desk`
    };
    newKeys.push(key);
    list.push(key);
  }

  saveKeysList(list);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_BUS_TICK, `${now}_${Math.random()}`);
      window.dispatchEvent(new CustomEvent('codedna_emergency_key_change', { detail: newKeys[0] }));
    } catch {}
  }

  broadcastCctvMessage({
    type: 'EMERGENCY_KEY_UPDATE',
    emergencyKey: newKeys[0]
  });

  return newKeys;
}

/**
 * Sets a custom key code directly.
 */
export function updateActiveEmergencyKeyCode(
  newCode: string,
  authorizedBy = 'Chief Proctor'
): DailyEmergencyKey {
  const cleanCode = newCode.trim().toUpperCase();
  const list = getTodayEmergencyKeysList();
  const activeKey = list.find((k) => k.status === 'ACTIVE');

  if (activeKey) {
    activeKey.code = cleanCode;
    activeKey.createdBy = authorizedBy;
    activeKey.notes = `Updated code by ${authorizedBy}`;
    saveKeysList(list);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_BUS_TICK, `${Date.now()}_${Math.random()}`);
        window.dispatchEvent(new CustomEvent('codedna_emergency_key_change', { detail: activeKey }));
      } catch {}
    }

    broadcastCctvMessage({
      type: 'EMERGENCY_KEY_UPDATE',
      emergencyKey: activeKey
    });

    return activeKey;
  }

  // If no active key exists, generate one with this code
  return generateReplacementEmergencyKey(authorizedBy, cleanCode, 'Custom code voucher', true);
}

/**
 * Validates and consumes the emergency unlock key.
 * Strictly single-use: Once entered, that specific voucher is consumed and cannot be reused.
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

  const list = getTodayEmergencyKeysList();
  const todayStr = getTodayDateStr();

  // Find matching key in today's active/consumed list
  const matchedKey = list.find((k) => k.code === cleanCode);

  if (matchedKey) {
    // 1. Check if it was already consumed
    if (matchedKey.status === 'CONSUMED' || matchedKey.usageCount >= matchedKey.maxUses) {
      const timeStr = matchedKey.usageRecord?.timestamp
        ? new Date(matchedKey.usageRecord.timestamp).toLocaleTimeString()
        : 'earlier today';
      const stationStr = matchedKey.usageRecord?.stationId || 'another workstation';
      const candidateStr = matchedKey.usageRecord?.candidateName
        ? ` by ${matchedKey.usageRecord.candidateName}`
        : '';

      return {
        valid: false,
        reason: 'ALREADY_CONSUMED',
        message: `REJECTED: Emergency key ${cleanCode} has already been consumed at ${timeStr} on ${stationStr}${candidateStr}. Each key is strictly single-use.`,
        key: matchedKey
      };
    }

    // 2. Check if expired
    if (matchedKey.status === 'EXPIRED') {
      return {
        valid: false,
        reason: 'EXPIRED_DATE',
        message: `Emergency key ${cleanCode} is expired and cannot be used.`
      };
    }

    // 3. KEY IS ACTIVE: CONSUME IT IMMEDIATELY
    const now = Date.now();
    matchedKey.status = 'CONSUMED';
    matchedKey.usageCount = 1;
    matchedKey.usageRecord = {
      stationId,
      labId: candidateInfo?.labId,
      candidateName: candidateInfo?.name || 'Candidate',
      candidateRoll: candidateInfo?.roll || 'N/A',
      examTitle: candidateInfo?.examTitle || 'Live Examination',
      timestamp: now
    };

    saveKeysList(list);
    archiveKeyToHistory(matchedKey);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_BUS_TICK, `${now}_${Math.random()}`);
        window.dispatchEvent(new CustomEvent('codedna_emergency_key_change', { detail: matchedKey }));
      } catch {}
    }

    broadcastCctvMessage({
      type: 'EMERGENCY_KEY_CONSUMED',
      emergencyKey: matchedKey,
      stationId,
      labId: candidateInfo?.labId
    });

    return {
      valid: true,
      message: `Emergency authorization successful. Terminal ${stationId} unlocked. Key ${cleanCode} is now consumed and expired.`,
      key: matchedKey
    };
  }

  // Also check history for already-expired keys
  const history = getEmergencyKeyHistory();
  const matchedHistoric = history.find((h) => h.code === cleanCode);
  if (matchedHistoric) {
    return {
      valid: false,
      reason: 'ALREADY_CONSUMED',
      message: `REJECTED: Emergency key ${cleanCode} was already used on ${matchedHistoric.dateStr} and has permanently expired.`,
      key: matchedHistoric
    };
  }

  // No match
  return {
    valid: false,
    reason: 'INVALID_CODE',
    message: 'Invalid Emergency Unlock Key. Verification failed. Terminal remains locked.'
  };
}

/**
 * Subscribes to real-time changes across the campus network.
 */
export function subscribeToEmergencyKeyChanges(
  callback: (key: DailyEmergencyKey) => void
): () => void {
  const unsubscribeCctv = subscribeToCctvBroadcast((msg) => {
    if ((msg.type === 'EMERGENCY_KEY_CONSUMED' || msg.type === 'EMERGENCY_KEY_UPDATE') && msg.emergencyKey) {
      callback(msg.emergencyKey);
    }
  });

  const handleCustomEvent = (e: Event) => {
    const custom = e as CustomEvent<DailyEmergencyKey>;
    if (custom?.detail) {
      callback(custom.detail);
    }
  };

  const handleStorageEvent = (e: StorageEvent) => {
    if ((e.key === STORAGE_ACTIVE_KEYS_LIST || e.key === STORAGE_LEGACY_KEY) && e.newValue) {
      try {
        callback(getTodayEmergencyKey());
      } catch {}
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
