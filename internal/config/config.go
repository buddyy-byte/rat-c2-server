package config

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Server      ServerConfig
	Database    DatabaseConfig
	FileStorage FileStorageConfig
	Security    SecurityConfig
	Lateral     LateralConfig
}

type ServerConfig struct {
	APIAddr      string
	WSAddr       string
	TLSEnabled   bool
	TLSCert      string
	TLSKey       string
	ClientCA     string
	DomainFront  DomainFrontConfig
	Debug        bool
}

type DomainFrontConfig struct {
	Enabled       bool
	FrontDomain   string
	FrontHost     string
	CustomHeaders map[string]string
}

type DatabaseConfig struct {
	Path string
}

type FileStorageConfig struct {
	Path           string
	MaxFileSize    int64
	ChunkSize      int
	RetentionHours int
}

type SecurityConfig struct {
	APIKey         string
	JWTSecret      string
	TokenExpiry    int
	RateLimit      int
	AllowedIPs     []string
	RequireAuth    bool
	EncryptionKey  string
}

type LateralConfig struct {
	DefaultTimeout int
	MaxConcurrent  int
	ToolsPath      string
}

func Load() *Config {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath("./configs")
	viper.AddConfigPath(".")
	viper.AddConfigPath("$HOME/.rat-c2")

	// Environment variable overrides
	viper.SetEnvPrefix("RATC2")
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	viper.AutomaticEnv()

	setDefaults()

	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			panic("Config read error: " + err.Error())
		}
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		panic("Config unmarshal error: " + err.Error())
	}

	// Resolve relative paths
	cfg.Database.Path = resolvePath(cfg.Database.Path)
	cfg.FileStorage.Path = resolvePath(cfg.FileStorage.Path)
	cfg.Server.TLSCert = resolvePath(cfg.Server.TLSCert)
	cfg.Server.TLSKey = resolvePath(cfg.Server.TLSKey)
	cfg.Server.ClientCA = resolvePath(cfg.Server.ClientCA)
	cfg.Lateral.ToolsPath = resolvePath(cfg.Lateral.ToolsPath)

	return &cfg
}

func setDefaults() {
	viper.SetDefault("server.api_addr", ":8080")
	viper.SetDefault("server.ws_addr", ":8081")
	viper.SetDefault("server.tls_enabled", false)
	viper.SetDefault("server.tls_cert", "./certs/server.crt")
	viper.SetDefault("server.tls_key", "./certs/server.key")
	viper.SetDefault("server.client_ca", "")
	viper.SetDefault("server.debug", true)

	viper.SetDefault("database.path", "./data/ratc2.db")

	viper.SetDefault("file_storage.path", "./data/files")
	viper.SetDefault("file_storage.max_file_size", 100*1024*1024) // 100MB
	viper.SetDefault("file_storage.chunk_size", 64*1024)         // 64KB
	viper.SetDefault("file_storage.retention_hours", 168)         // 7 days

	viper.SetDefault("security.api_key", "")
	viper.SetDefault("security.jwt_secret", "change-me-in-production")
	viper.SetDefault("security.token_expiry", 3600)
	viper.SetDefault("security.rate_limit", 100)
	viper.SetDefault("security.allowed_ips", []string{})
	viper.SetDefault("security.require_auth", true)
	viper.SetDefault("security.encryption_key", "")

	viper.SetDefault("lateral.default_timeout", 30)
	viper.SetDefault("lateral.max_concurrent", 10)
	viper.SetDefault("lateral.tools_path", "./tools")

	viper.SetDefault("server.domain_front.enabled", false)
	viper.SetDefault("server.domain_front.front_domain", "")
	viper.SetDefault("server.domain_front.front_host", "")
	viper.SetDefault("server.domain_front.custom_headers", map[string]string{})
}

func resolvePath(path string) string {
	if path == "" {
		return ""
	}
	if filepath.IsAbs(path) {
		return path
	}
	// Try relative to executable
	exe, err := os.Executable()
	if err == nil {
		base := filepath.Dir(exe)
		return filepath.Join(base, path)
	}
	return path
}