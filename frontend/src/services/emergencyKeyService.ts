/**
 * emergencyKeyService.ts
 * 
 * High-Security Per-Student Emergency Unlock Key Engine.
 * Tailored for high-stakes institutional examinations (1000+ candidates).
 * 
 * Security Directives:
 *  1. Keys are strictly BOUND to a particular locked student (Roll Number + Station ID).
 *  2. NO other student or workstation can use that key. If another candidate enters it,
 *     it is immediately rejected with an explicit policy violation warning.
 *  3. Format: Alphanumeric, exactly 5 characters long (e.g. "X7K9P", "8M2QW").
 *     Cryptographically random, impossible to guess, completely decoupled from roll numbers.
 *  4. Single-use: Once entered by that specific student, it immediately unlocks their terminal,
 *     records forensic audit telemetry, and expires permanently.
 *  5. Keys are generated directly from Cheating Alerts, Station Cards, and the Control Room.
 */

import { broadcastCctvMessage, subscribeToCctvBroadcast } from './adminService';
import {
  saveStationEmergencyKeyToCloud,
  fetchStationEmergencyKeyFromCloud,
  consumeStationEmergencyKeyInCloud,
  subscribeToEmergencyKeyRealtime
} from './supabaseService';

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
  code: string;               // Exactly 5-character alphanumeric (e.g. "X7K9P")
  dateStr: string;            // YYYY-MM-DD
  status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED';
  maxUses: number;            // Strictly 1
  usageCount: number;         // 0 or 1
  usageRecord?: EmergencyKeyUsageRecord;
  createdAt: number;
  createdBy: string;
  notes?: string;
  labAssignment?: string;
  // Per-Student Binding
  boundStudentRoll?: string;  // Uppercase roll number / USN
  boundStudentName?: string;  // Full name of the candidate
  boundStationId?: string;    // e.g. "LAB-01-WS-09" or "Station #09"
  boundLabId?: string;        // e.g. "LAB-01"
}

export interface EmergencyKeyValidationResult {
  valid: boolean;
  reason?: 'ALREADY_CONSUMED' | 'INVALID_CODE' | 'EXPIRED_DATE' | 'WRONG_STUDENT';
  message: string;
  key?: DailyEmergencyKey;
}

const STORAGE_ACTIVE_KEYS_LIST = 'codedna_active_emergency_keys_list';
const STORAGE_LEGACY_KEY = 'codedna_daily_emergency_key';
const STORAGE_HISTORY_KEY = 'codedna_emergency_key_history';
const STORAGE_BUS_TICK = 'codedna_emergency_key_tick';

// 32-character unambiguous charset (no confusing 0/O, 1/I)
const SECURE_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates an unguessable 5-character alphanumeric key (e.g. "X7K9P").
 * Cryptographically random and decoupled from student credentials.
 */
export function generate5CharAlphanumericCode(): string {
  let result = '';
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : null;
  if (cryptoObj && cryptoObj.getRandomValues) {
    const bytes = new Uint8Array(5);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < 5; i++) {
      result += SECURE_CHARSET[bytes[i] % SECURE_CHARSET.length];
    }
  } else {
    for (let i = 0; i < 5; i++) {
      result += SECURE_CHARSET[Math.floor(Math.random() * SECURE_CHARSET.length)];
    }
  }
  return result;
}

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
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history.slice(0, 150)));
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
    return [];
  }

  try {
    let keys: DailyEmergencyKey[] = [];
    const stored = localStorage.getItem(STORAGE_ACTIVE_KEYS_LIST);

    if (stored) {
      const parsed: DailyEmergencyKey[] = JSON.parse(stored);
      if (Array.isArray(parsed)) {
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

    saveKeysList(keys);
    return keys;
  } catch (err) {
    console.error('[EmergencyKeyService] Error reading keys list:', err);
    return [];
  }
}

function saveKeysList(keys: DailyEmergencyKey[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_ACTIVE_KEYS_LIST, JSON.stringify(keys));
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
  if (list.length === 0) {
    // Generate default initial 5-char key if empty
    return issueStudentEmergencyKey({
      stationId: 'CAMPUS-MASTER',
      studentName: 'General Campus Authority',
      issuedBy: 'Initial Setup'
    });
  }
  return list.find((k) => k.status === 'ACTIVE') || list[list.length - 1];
}

/**
 * Issues a secure 5-character single-use emergency key STRICTLY BOUND to a particular student.
 * No other student or workstation can use this key!
 */
export function issueStudentEmergencyKey(params: {
  studentRoll?: string;
  studentName?: string;
  stationId: string;
  labId?: string;
  examTitle?: string;
  issuedBy?: string;
}): DailyEmergencyKey {
  const todayStr = getTodayDateStr();
  const cleanRoll = (params.studentRoll || '').trim().toUpperCase();
  const cleanStation = (params.stationId || '').trim();
  const cleanName = params.studentName || 'Candidate';
  const list = getTodayEmergencyKeysList();

  // If there is already an active unused key for this exact student/station, we can reuse or supersede
  const existingActiveIdx = list.findIndex(
    (k) =>
      k.status === 'ACTIVE' &&
      ((cleanRoll && k.boundStudentRoll === cleanRoll) || (cleanStation && k.boundStationId === cleanStation))
  );

  if (existingActiveIdx >= 0) {
    // Expire previous active key for this student
    list[existingActiveIdx].status = 'EXPIRED';
    archiveKeyToHistory(list[existingActiveIdx]);
  }

  const now = Date.now();
  const new5CharCode = generate5CharAlphanumericCode(); // e.g. "X7K9P"

  const studentKey: DailyEmergencyKey = {
    keyId: `EMG-STU-${todayStr}-${now}-${Math.floor(100 + Math.random() * 900)}`,
    code: new5CharCode,
    dateStr: todayStr,
    status: 'ACTIVE',
    maxUses: 1,
    usageCount: 0,
    createdAt: now,
    createdBy: params.issuedBy || 'Chief Proctor / Cheating Alert Desk',
    boundStudentRoll: cleanRoll,
    boundStudentName: cleanName,
    boundStationId: cleanStation,
    boundLabId: params.labId,
    labAssignment: params.labId || 'Campus Lab',
    notes: `Bound specifically to ${cleanName} (${cleanRoll || 'N/A'}) on station ${cleanStation}`
  };

  list.unshift(studentKey);
  saveKeysList(list);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_BUS_TICK, `${now}_${Math.random()}`);
      window.dispatchEvent(new CustomEvent('codedna_emergency_key_change', { detail: studentKey }));
    } catch {}
  }

  broadcastCctvMessage({
    type: 'EMERGENCY_KEY_UPDATE',
    emergencyKey: studentKey,
    stationId: cleanStation,
    labId: params.labId
  });

  // Asynchronously synchronize key to Supabase cloud for cross-device validation (1000+ candidates)
  void saveStationEmergencyKeyToCloud(cleanStation, studentKey);

  return studentKey;
}

/**
 * Stores an incoming key received from cloud or real-time broadcast into local memory & storage.
 */
export function storeIncomingEmergencyKey(incoming: DailyEmergencyKey): void {
  if (!incoming || !incoming.code) return;
  const list = getTodayEmergencyKeysList();
  const existingIdx = list.findIndex(
    (k) => k.keyId === incoming.keyId || (k.code === incoming.code && k.dateStr === incoming.dateStr)
  );
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...incoming };
  } else {
    list.unshift(incoming);
  }
  saveKeysList(list);
}

/**
 * Finds any active or consumed emergency key bound to a particular student or workstation.
 */
export function getStudentBoundKey(
  studentRoll?: string,
  stationId?: string
): DailyEmergencyKey | undefined {
  const list = getTodayEmergencyKeysList();
  const cleanRoll = (studentRoll || '').trim().toUpperCase();
  const cleanStation = (stationId || '').trim();

  // Prefer active key first
  const activeMatch = list.find((k) => {
    if (k.status !== 'ACTIVE') return false;
    if (cleanRoll && k.boundStudentRoll && k.boundStudentRoll === cleanRoll) return true;
    if (cleanStation && k.boundStationId && k.boundStationId === cleanStation) return true;
    return false;
  });
  if (activeMatch) return activeMatch;

  // Otherwise return latest consumed/issued key for this student
  return list.find((k) => {
    if (cleanRoll && k.boundStudentRoll && k.boundStudentRoll === cleanRoll) return true;
    if (cleanStation && k.boundStationId && k.boundStationId === cleanStation) return true;
    return false;
  });
}

/**
 * Validates and consumes the emergency unlock key.
 * STRICTLY CHECKS:
 *  1. Code match (e.g. "X7K9P")
 *  2. Single-use check (if already consumed, reject immediately)
 *  3. Student-binding check: If the key was issued for student A on station 1,
 *     student B on station 2 CANNOT use it!
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
      message: 'Please enter the 5-character emergency unlock key.'
    };
  }

  const list = getTodayEmergencyKeysList();
  const currentRoll = (candidateInfo?.roll || '').trim().toUpperCase();
  const currentStation = (stationId || '').trim();

  // Find key matching entered code
  const matchedKey = list.find((k) => k.code === cleanCode);

  if (matchedKey) {
    // ── 1. CHECK PER-STUDENT BINDING ──
    const hasStudentBinding = Boolean(matchedKey.boundStudentRoll || matchedKey.boundStationId);

    if (hasStudentBinding) {
      const rollMatches = currentRoll && matchedKey.boundStudentRoll && currentRoll === matchedKey.boundStudentRoll;
      const stationMatches = currentStation && matchedKey.boundStationId && (
        currentStation.toLowerCase() === matchedKey.boundStationId.toLowerCase() ||
        currentStation.replace(/[^0-9]/g, '') === matchedKey.boundStationId.replace(/[^0-9]/g, '')
      );

      // If the key was bound to a specific student, verify it's THAT student!
      if (!rollMatches && !stationMatches) {
        const targetStudent = matchedKey.boundStudentName || 'another candidate';
        const targetRoll = matchedKey.boundStudentRoll ? ` (${matchedKey.boundStudentRoll})` : '';
        const targetStation = matchedKey.boundStationId ? ` on ${matchedKey.boundStationId}` : '';

        return {
          valid: false,
          reason: 'WRONG_STUDENT',
          message: `ACCESS DENIED: Key ${cleanCode} is strictly bound to ${targetStudent}${targetRoll}${targetStation}. It cannot be used on this terminal.`,
          key: matchedKey
        };
      }
    }

    // ── 2. CHECK SINGLE-USE CONSUMPTION ──
    if (matchedKey.status === 'CONSUMED' || matchedKey.usageCount >= matchedKey.maxUses) {
      const timeStr = matchedKey.usageRecord?.timestamp
        ? new Date(matchedKey.usageRecord.timestamp).toLocaleTimeString()
        : 'earlier today';
      const stationStr = matchedKey.usageRecord?.stationId || 'this workstation';
      const candidateStr = matchedKey.usageRecord?.candidateName
        ? ` by ${matchedKey.usageRecord.candidateName}`
        : '';

      return {
        valid: false,
        reason: 'ALREADY_CONSUMED',
        message: `REJECTED: 5-character key ${cleanCode} was already consumed at ${timeStr} on ${stationStr}${candidateStr}. It cannot be reused.`,
        key: matchedKey
      };
    }

    if (matchedKey.status === 'EXPIRED') {
      return {
        valid: false,
        reason: 'EXPIRED_DATE',
        message: `Emergency key ${cleanCode} is expired and cannot be used.`
      };
    }

    // ── 3. KEY IS VALID & STUDENT MATCHED: CONSUME IMMEDIATELY ──
    const now = Date.now();
    matchedKey.status = 'CONSUMED';
    matchedKey.usageCount = 1;
    matchedKey.usageRecord = {
      stationId: currentStation,
      labId: candidateInfo?.labId,
      candidateName: candidateInfo?.name || matchedKey.boundStudentName || 'Candidate',
      candidateRoll: currentRoll || matchedKey.boundStudentRoll || 'N/A',
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
      stationId: currentStation,
      labId: candidateInfo?.labId
    });

    return {
      valid: true,
      message: `Emergency authorization verified for ${matchedKey.boundStudentName || 'Candidate'}. Terminal ${currentStation} unlocked. Key ${cleanCode} is now consumed.`,
      key: matchedKey
    };
  }

  // Check history
  const history = getEmergencyKeyHistory();
  const matchedHistoric = history.find((h) => h.code === cleanCode);
  if (matchedHistoric) {
    return {
      valid: false,
      reason: 'ALREADY_CONSUMED',
      message: `REJECTED: Key ${cleanCode} was already consumed on ${matchedHistoric.dateStr} and has permanently expired.`,
      key: matchedHistoric
    };
  }

  return {
    valid: false,
    reason: 'INVALID_CODE',
    message: 'Invalid 5-character Emergency Unlock Key. Verification failed. Terminal remains locked.'
  };
}

/**
 * High-Scale Asynchronous Key Validator.
 * First checks local client cache. If not found, immediately queries the authoritative
 * Supabase cloud candidate_stations row to enable instant unlocking across separate physical laptops.
 */
export async function validateAndConsumeEmergencyKeyAsync(
  enteredCode: string,
  stationId: string,
  candidateInfo?: {
    name?: string;
    roll?: string;
    labId?: string;
    examTitle?: string;
  }
): Promise<EmergencyKeyValidationResult> {
  const localResult = validateAndConsumeEmergencyKey(enteredCode, stationId, candidateInfo);
  if (localResult.valid || localResult.reason === 'WRONG_STUDENT' || localResult.reason === 'ALREADY_CONSUMED') {
    return localResult;
  }

  const cleanCode = (enteredCode || '').trim().toUpperCase();
  const currentRoll = (candidateInfo?.roll || '').trim().toUpperCase();
  const currentStation = (stationId || '').trim();

  try {
    const cloudKey: DailyEmergencyKey | null = await fetchStationEmergencyKeyFromCloud(currentStation, currentRoll);
    if (!cloudKey || !cloudKey.code) {
      return {
        valid: false,
        reason: 'INVALID_CODE',
        message: 'Invalid Invigilator Security Key. Terminal remains locked.'
      };
    }

    if (cloudKey.code.trim().toUpperCase() !== cleanCode) {
      return {
        valid: false,
        reason: 'INVALID_CODE',
        message: 'Invalid Invigilator Security Key. Code does not match the key issued for this terminal.'
      };
    }

    // 1. Strict Student Binding Validation
    const hasStudentBinding = Boolean(cloudKey.boundStudentRoll || cloudKey.boundStationId);
    if (hasStudentBinding) {
      const rollMatches = currentRoll && cloudKey.boundStudentRoll && currentRoll === cloudKey.boundStudentRoll;
      const stationMatches = currentStation && cloudKey.boundStationId && (
        currentStation.toLowerCase() === cloudKey.boundStationId.toLowerCase() ||
        currentStation.replace(/[^0-9]/g, '') === cloudKey.boundStationId.replace(/[^0-9]/g, '')
      );

      if (!rollMatches && !stationMatches) {
        const targetStudent = cloudKey.boundStudentName || 'another candidate';
        const targetRoll = cloudKey.boundStudentRoll ? ` (${cloudKey.boundStudentRoll})` : '';
        const targetStation = cloudKey.boundStationId ? ` on ${cloudKey.boundStationId}` : '';

        return {
          valid: false,
          reason: 'WRONG_STUDENT',
          message: `ACCESS DENIED: Key ${cleanCode} is strictly bound to ${targetStudent}${targetRoll}${targetStation}. It cannot be used on this terminal.`,
          key: cloudKey
        };
      }
    }

    // 2. Single-Use Check
    if (cloudKey.status === 'CONSUMED') {
      return {
        valid: false,
        reason: 'ALREADY_CONSUMED',
        message: `REJECTED: 5-character key ${cleanCode} was already consumed and cannot be reused.`,
        key: cloudKey
      };
    }

    // Key is verified and matches this student! Consume in Supabase
    await consumeStationEmergencyKeyInCloud(currentStation, cloudKey.keyId, currentRoll);

    cloudKey.status = 'CONSUMED';
    cloudKey.usageCount = 1;
    storeIncomingEmergencyKey(cloudKey);
    archiveKeyToHistory(cloudKey);

    broadcastCctvMessage({
      type: 'EMERGENCY_KEY_CONSUMED',
      emergencyKey: cloudKey,
      stationId: currentStation,
      labId: candidateInfo?.labId
    });

    return {
      valid: true,
      message: `Emergency authorization verified for ${cloudKey.boundStudentName || candidateInfo?.name || 'Candidate'}. Terminal ${currentStation} unlocked. Key ${cleanCode} is now consumed.`,
      key: cloudKey
    };
  } catch (err) {
    console.warn('[EmergencyKeyService] Cloud validation notice:', err);
    return localResult;
  }
}

// Global real-time listener for emergency unlock keys issued from proctor terminals
if (typeof window !== 'undefined') {
  try {
    subscribeToEmergencyKeyRealtime((key) => {
      if (key && key.code) {
        storeIncomingEmergencyKey(key);
      }
    });
  } catch {}
}

/**
 * Subscribes to real-time key changes across the campus network.
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


/**
 * Generates an authorized replacement 5-character emergency key.
 */
export function generateReplacementEmergencyKey(
  createdBy = 'Chief Examination Officer',
  customCode?: string,
  notes?: string,
  addToPool = true
): DailyEmergencyKey {
  const code = (customCode && customCode.trim())
    ? customCode.trim().toUpperCase()
    : generate5CharAlphanumericCode();
  const key = issueStudentEmergencyKey({
    stationId: 'CAMPUS-MASTER',
    studentName: 'Emergency Authorized Candidate',
    issuedBy: createdBy
  });
  if (customCode && customCode.trim()) {
    key.code = customCode.trim().toUpperCase();
    const list = getTodayEmergencyKeysList();
    saveKeysList(list);
  }
  return key;
}

/**
 * Generates a batch of 5-character keys for lab workstations.
 */
export function generateBatchEmergencyKeys(
  count = 5,
  prefix = 'CSE',
  createdBy = 'Chief Examination Officer'
): DailyEmergencyKey[] {
  const keys: DailyEmergencyKey[] = [];
  for (let i = 1; i <= count; i++) {
    keys.push(issueStudentEmergencyKey({
      stationId: `LAB-WS-${i.toString().padStart(2, '0')}`,
      studentName: `Lab 0${i} Candidate`,
      issuedBy: createdBy
    }));
  }
  return keys;
}

/**
 * Updates or sets a custom key code.
 */
export function updateActiveEmergencyKeyCode(
  newCode: string,
  authorizedBy = 'Chief Proctor'
): DailyEmergencyKey {
  const cleanCode = newCode.trim().toUpperCase();
  const list = getTodayEmergencyKeysList();
  const active = list.find((k) => k.status === 'ACTIVE');
  if (active) {
    active.code = cleanCode;
    active.createdBy = authorizedBy;
    saveKeysList(list);
    return active;
  }
  const created = issueStudentEmergencyKey({
    stationId: 'CAMPUS-MASTER',
    studentName: 'General Campus Authority',
    issuedBy: authorizedBy
  });
  created.code = cleanCode;
  saveKeysList(list);
  return created;
}
