let fallbackCounter = 0;

function bytesToUuid(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === "function") return bytesToUuid(cryptoApi.getRandomValues(new Uint8Array(16)));
  fallbackCounter += 1;
  const timestamp = Date.now().toString(16).padStart(12, "0").slice(-12);
  const counter = fallbackCounter.toString(16).padStart(8, "0");
  const suffix = Math.random().toString(16).slice(2).padEnd(12, "0").slice(0, 12);
  return `${counter.slice(0, 8)}-${counter.slice(0, 4)}-4${counter.slice(1, 4)}-8${counter.slice(1, 4)}-${timestamp.slice(0, 6)}${suffix.slice(0, 6)}`;
}
