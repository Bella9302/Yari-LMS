// Shared (client + server) helpers for identity documents.

/** Validates a 13-digit South African ID number: date of birth, citizenship digit and Luhn checksum. */
export function isValidSaId(raw: string): boolean {
  const id = raw.replace(/\s/g, "");
  if (!/^\d{13}$/.test(id)) return false;

  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1) return false;
  // Any century works for validation; 2000 is a leap year so 29 Feb is allowed for "00".
  const year = 2000 + yy;
  const daysInMonth = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  if (dd > daysInMonth) return false;
  if (!["0", "1"].includes(id[10]!)) return false;

  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = Number(id[12 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function isValidPassportNumber(raw: string): boolean {
  return /^[A-Z0-9]{5,20}$/i.test(raw.replace(/[\s-]/g, ""));
}

/** "8001015009087" -> "*********9087" */
export function maskIdNumber(value: string, visible = 4): string {
  const clean = value.replace(/\s/g, "");
  if (clean.length <= visible) return "*".repeat(clean.length);
  return "*".repeat(clean.length - visible) + clean.slice(-visible);
}
