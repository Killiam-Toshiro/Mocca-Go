import { scrypt, timingSafeEqual } from 'node:crypto';

const dummyHash = `scrypt$32768$8$3$${'0'.repeat(32)}$${'0'.repeat(128)}`;

export async function verifyPassword(
  password: string,
  stored = dummyHash,
): Promise<boolean> {
  const match = /^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(
    stored,
  );
  if (!match) return false;
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      match[1],
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );
  });
  return timingSafeEqual(derived, Buffer.from(match[2], 'hex'));
}
