// node:crypto for the browser demo: what the server and bcryptjs use.
import { Buffer } from 'buffer';

export function randomBytes(n: number) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  const b = Buffer.from(bytes);
  // The browser Buffer knows no «base64url» (used for the check-in tokens).
  const toString = b.toString.bind(b);
  (b as any).toString = (enc?: string, ...rest: number[]) =>
    enc === 'base64url' ? toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : toString(enc as BufferEncoding, ...rest);
  return b;
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export default { randomBytes, timingSafeEqual };
