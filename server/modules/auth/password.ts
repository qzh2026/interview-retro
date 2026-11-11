import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * 密码哈希：Node 内建 scrypt（内存硬化 KDF），零第三方依赖、无原生模块。
 *
 * 存储格式：`scrypt$N$r$p$saltBase64$hashBase64` —— 参数随哈希一起存，
 * 以后调参不影响既有用户登录。
 */
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/** OWASP 对 scrypt 的建议参数：N=2^15, r=8, p=1（约 32MB 内存 / ~50ms） */
const N = 2 ** 15
const R = 8
const P = 1
const KEYLEN = 64
// 128 * N * r = 32MB，给 Node 默认 maxmem(32MB) 留出余量
const MAXMEM = 64 * 1024 * 1024

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, nStr, rStr, pStr, saltB64, hashB64] = stored.split('$')
    if (scheme !== 'scrypt') return false
    const salt = Buffer.from(saltB64 ?? '', 'base64')
    const expected = Buffer.from(hashB64 ?? '', 'base64')
    if (salt.length === 0 || expected.length === 0) return false
    const actual = await scrypt(password, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
      maxmem: MAXMEM,
    })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
