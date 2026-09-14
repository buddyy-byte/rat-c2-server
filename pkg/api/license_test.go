package api

import (
	"os"
	"strings"
	"sync"
	"testing"
)

func TestMintLicenseKeyShape(t *testing.T) {
	k, err := mintLicenseKey()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(k, "UMBRA-") {
		t.Fatalf("prefix: %s", k)
	}
	parts := strings.Split(k, "-")
	if len(parts) != 6 {
		t.Fatalf("parts %d: %s", len(parts), k)
	}
	for i, p := range parts[1:] {
		if len(p) != 4 {
			t.Fatalf("chunk %d len %d", i, len(p))
		}
	}
	k2, _ := mintLicenseKey()
	if k == k2 {
		t.Fatal("mint collided")
	}
}

func TestNormalizeLicense(t *testing.T) {
	got := normalizeLicense("  umbra-abcd-efgh-ijkl-mnop-qrst  ")
	if got != "UMBRA-ABCD-EFGH-IJKL-MNOP-QRST" {
		t.Fatalf("got %s", got)
	}
}

func TestAllowedOrigin(t *testing.T) {
	if !AllowedOrigin("https://chemical-umbra.vercel.app") {
		t.Fatal("console origin")
	}
	if !AllowedOrigin("https://chemical-umbra-landing.vercel.app") {
		t.Fatal("landing origin")
	}
	if AllowedOrigin("https://evil.example") {
		t.Fatal("reflected evil origin")
	}
}

func TestSessionTokenRoundTrip(t *testing.T) {
	os.Setenv("RATC2_SECURITY_JWT_SECRET", "unit-test-secret-not-for-prod")
	tokenKey = nil
	tokenOnce = sync.Once{}
	tok := issueToken("chemical")
	if !strings.HasPrefix(tok, "u1.") {
		t.Fatalf("prefix %s", tok)
	}
	u, ok := lookupToken(tok)
	if !ok || u != "chemical" {
		t.Fatalf("lookup %v %q", ok, u)
	}
	if _, ok := lookupToken("dead"); ok {
		t.Fatal("junk token")
	}
	revokeToken(tok)
	if _, ok := lookupToken(tok); ok {
		t.Fatal("revoked still valid")
	}
}

func TestArgon2RoundTrip(t *testing.T) {
	h, err := hashPassword("correct-horse-battery")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "$argon2id$") {
		t.Fatalf("prefix %s", h)
	}
	if !checkPassword(h, "correct-horse-battery") {
		t.Fatal("argon2 verify")
	}
	if checkPassword(h, "wrong") {
		t.Fatal("argon2 accepted wrong")
	}
	legacy := hashPass("legacy-pass")
	if !checkPassword(legacy, "legacy-pass") {
		t.Fatal("sha256 legacy")
	}
	if !needsRehash(legacy) {
		t.Fatal("legacy should rehash")
	}
	if needsRehash(h) {
		t.Fatal("argon2 should not rehash")
	}
}
