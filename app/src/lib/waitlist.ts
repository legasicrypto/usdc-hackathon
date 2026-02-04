import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface WaitlistEntry {
  email: string;
  code: string;
  referredBy: string | null;
  referralCount: number;
  createdAt: string;
  walletAddress?: string;
}

interface WaitlistData {
  entries: WaitlistEntry[];
}

const WAITLIST_FILE = path.join(process.cwd(), 'data', 'waitlist.json');

// Generate a unique 8-character invite code
export function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Read waitlist data from file
async function readWaitlist(): Promise<WaitlistData> {
  try {
    const dir = path.dirname(WAITLIST_FILE);
    await fs.mkdir(dir, { recursive: true });
    const data = await fs.readFile(WAITLIST_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { entries: [] };
  }
}

// Write waitlist data to file
async function writeWaitlist(data: WaitlistData): Promise<void> {
  const dir = path.dirname(WAITLIST_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(WAITLIST_FILE, JSON.stringify(data, null, 2));
}

// Add a new entry to the waitlist
export async function addToWaitlist(
  email: string,
  referralCode?: string,
  walletAddress?: string
): Promise<{ success: boolean; entry?: WaitlistEntry; error?: string }> {
  if (!isValidEmail(email)) {
    return { success: false, error: 'Invalid email address' };
  }

  const waitlist = await readWaitlist();

  // Check if email already exists
  const existingEntry = waitlist.entries.find(
    (e) => e.email.toLowerCase() === email.toLowerCase()
  );
  if (existingEntry) {
    return { success: false, error: 'Email already registered', entry: existingEntry };
  }

  // Validate referral code if provided
  let referrer: WaitlistEntry | undefined;
  if (referralCode) {
    referrer = waitlist.entries.find(
      (e) => e.code.toUpperCase() === referralCode.toUpperCase()
    );
    if (!referrer) {
      return { success: false, error: 'Invalid referral code' };
    }
  }

  // Create new entry
  const newEntry: WaitlistEntry = {
    email: email.toLowerCase(),
    code: generateInviteCode(),
    referredBy: referrer?.code || null,
    referralCount: 0,
    createdAt: new Date().toISOString(),
    walletAddress,
  };

  // Update referrer's count
  if (referrer) {
    referrer.referralCount += 1;
  }

  waitlist.entries.push(newEntry);
  await writeWaitlist(waitlist);

  return { success: true, entry: newEntry };
}

// Get entry by email or code
export async function getWaitlistEntry(
  emailOrCode: string
): Promise<WaitlistEntry | null> {
  const waitlist = await readWaitlist();
  return (
    waitlist.entries.find(
      (e) =>
        e.email.toLowerCase() === emailOrCode.toLowerCase() ||
        e.code.toUpperCase() === emailOrCode.toUpperCase()
    ) || null
  );
}

// Get waitlist stats
export async function getWaitlistStats(): Promise<{
  totalSignups: number;
  totalReferrals: number;
}> {
  const waitlist = await readWaitlist();
  const totalSignups = waitlist.entries.length;
  const totalReferrals = waitlist.entries.reduce(
    (sum, e) => sum + e.referralCount,
    0
  );
  return { totalSignups, totalReferrals };
}

// Get position in waitlist
export async function getWaitlistPosition(email: string): Promise<number> {
  const waitlist = await readWaitlist();
  const index = waitlist.entries.findIndex(
    (e) => e.email.toLowerCase() === email.toLowerCase()
  );
  return index === -1 ? -1 : index + 1;
}

// Get leaderboard (top referrers)
export async function getLeaderboard(
  limit: number = 10
): Promise<{ email: string; referralCount: number; position: number }[]> {
  const waitlist = await readWaitlist();
  return waitlist.entries
    .sort((a, b) => b.referralCount - a.referralCount)
    .slice(0, limit)
    .map((e, i) => ({
      email: maskEmail(e.email),
      referralCount: e.referralCount,
      position: i + 1,
    }));
}

// Mask email for privacy (show first 2 chars + domain)
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}
