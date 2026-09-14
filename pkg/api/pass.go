package api

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	argonTime    = 2
	argonMemory  = 19 * 1024
	argonThreads = 1
	argonKeyLen  = 32
	argonSaltLen = 16
)

func hashPass(p string) string {
	s := sha256.Sum256([]byte(p))
	return hex.EncodeToString(s[:])
}

func hashPassword(p string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(p), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

func checkPassword(stored, plain string) bool {
	if strings.HasPrefix(stored, "$argon2id$") || strings.HasPrefix(stored, "argon2id$") {
		return checkArgon2(stored, plain)
	}
	if len(stored) == 64 {
		sum := sha256.Sum256([]byte(plain))
		got := hex.EncodeToString(sum[:])
		return subtle.ConstantTimeCompare([]byte(stored), []byte(got)) == 1
	}
	return false
}

func checkArgon2(stored, plain string) bool {
	parts := strings.Split(stored, "$")
	if len(parts) > 0 && parts[0] == "" {
		parts = parts[1:]
	}
	if len(parts) != 5 || parts[0] != "argon2id" {
		return false
	}
	var mem, timeCost, threads uint32
	for _, kv := range strings.Split(parts[2], ",") {
		k, v, ok := strings.Cut(kv, "=")
		if !ok {
			return false
		}
		n, err := strconv.ParseUint(v, 10, 32)
		if err != nil {
			return false
		}
		switch k {
		case "m":
			mem = uint32(n)
		case "t":
			timeCost = uint32(n)
		case "p":
			threads = uint32(n)
		}
	}
	if mem == 0 || timeCost == 0 || threads == 0 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	got := argon2.IDKey([]byte(plain), salt, timeCost, mem, uint8(threads), uint32(len(want)))
	return subtle.ConstantTimeCompare(want, got) == 1
}

func needsRehash(stored string) bool {
	return stored != "" && !strings.HasPrefix(stored, "$argon2id$") && !strings.HasPrefix(stored, "argon2id$")
}
