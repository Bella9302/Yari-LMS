import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended Argon2id parameters (19 MiB, t=2, p=1).
const OPTIONS = { algorithm: 2 /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Used to keep login timing similar whether or not the account exists.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("timing-equaliser-not-a-real-password");
  await verifyPassword(await dummyHash, password);
}

export const PASSWORD_MIN_LENGTH = 12;

export function passwordProblems(password: string, context: string[] = []): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (password.length > 256) problems.push("Use at most 256 characters.");
  if (/^(.)\1+$/.test(password)) problems.push("Avoid repeating a single character.");
  const lower = password.toLowerCase();
  if (context.some((c) => c.length >= 4 && lower.includes(c.toLowerCase())))
    problems.push("Don't include your name or email in your password.");
  return problems;
}
