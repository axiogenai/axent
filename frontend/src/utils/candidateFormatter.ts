/**
 * Candidate Name and Roll Number Formatter Utility
 * Eliminates duplicate names, hyphenated concatenations, and username pollution.
 */

export function cleanCandidateNameAndRoll(rawName?: string | null, rawRoll?: string | null): { name: string; roll: string } {
  let name = String(rawName || '').trim();
  let roll = String(rawRoll || '').trim();

  // 1. If roll has "Name - Roll" format (e.g., "ADITYA MINCHEKAR - ADIMINCHEKAR")
  if (roll.includes(' - ')) {
    const parts = roll.split(' - ').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const candidateNamePart = parts[0];
      const rollPart = parts.slice(1).join(' - ');
      if (!name || name.toLowerCase().includes(candidateNamePart.toLowerCase()) || name.toLowerCase() === 'candidate') {
        name = candidateNamePart;
      }
      roll = rollPart;
    }
  }

  // 2. If name has the roll number / username appended at the end
  // e.g., name = "Aditya minchekar adiminchekar" where roll is "adiminchekar"
  if (roll) {
    const cleanRollLower = roll.toLowerCase();
    const nameLower = name.toLowerCase();
    if (nameLower.endsWith(cleanRollLower)) {
      const trimmed = name.slice(0, name.length - cleanRollLower.length).trim();
      if (trimmed.length >= 2) {
        name = trimmed;
      }
    }
    // Also if name has multiple words and last word matches roll
    const words = name.split(/\s+/);
    if (words.length > 1 && words[words.length - 1].toLowerCase() === cleanRollLower) {
      name = words.slice(0, words.length - 1).join(' ');
    }
  }

  // 3. If roll is identical to name (e.g. name = "Aditya Minchekar", roll = "Aditya Minchekar")
  if (name && roll && name.toLowerCase() === roll.toLowerCase()) {
    // If it looks like a person's name with spaces, keep name and set roll to clean username
    if (name.includes(' ')) {
      roll = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    }
  }

  // 4. Clean trailing / duplicate words in name
  // e.g. "Aditya Minchekar Aditya" -> "Aditya Minchekar"
  const nameTokens = name.split(/\s+/).filter(Boolean);
  if (nameTokens.length >= 3) {
    const lowerTokens = nameTokens.map((t) => t.toLowerCase());
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (let i = 0; i < nameTokens.length; i++) {
      const tok = lowerTokens[i];
      if (seen.has(tok) && i === nameTokens.length - 1) {
        // Drop duplicate trailing token
        continue;
      }
      seen.add(tok);
      deduped.push(nameTokens[i]);
    }
    if (deduped.length >= 1) {
      name = deduped.join(' ');
    }
  }

  // 5. Title-case name
  if (name && name !== 'Candidate') {
    name = name
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  // 6. Upper-case roll
  if (roll) {
    roll = roll.toUpperCase();
  }

  return {
    name: name || 'Candidate',
    roll: roll || ''
  };
}
