import { randomBytes, scrypt } from 'node:crypto';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );
  });
  return `scrypt$32768$8$3$${salt}$${key.toString('hex')}`;
}
