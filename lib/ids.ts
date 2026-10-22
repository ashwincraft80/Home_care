import { randomBytes, randomUUID } from "node:crypto";

// No 0/O/1/I/L to keep references easy to read out over the phone.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function shortCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const bookingReference = () => `HC-${shortCode(6)}`;
export const complaintReference = () => `CM-${shortCode(6)}`;
export const newId = () => randomUUID();
