const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomCode(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function tokenDigest(token: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

export async function tokenHash(token: string): Promise<string> {
  return Array.from(await tokenDigest(token), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function tokenMatchesHash(token: string, expectedHash: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(expectedHash)) return false;
  const actual = await tokenDigest(token);
  const expected = Uint8Array.from(expectedHash.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean };
  return actual.byteLength === expected.byteLength && subtle.timingSafeEqual(actual, expected);
}

export function originAllowed(origin: string | null, configured: string): boolean {
  if (!origin) return false;
  return configured.split(",").map((value) => value.trim()).filter(Boolean).some((value) => value === origin);
}
