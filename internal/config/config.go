package config

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Server      ServerConfig      `mapstructure:"server"`
	Database    DatabaseConfig    `mapstructure:"database"`
	FileStorage FileStorageConfig `mapstructure:"file_storage"`
	Security    SecurityConfig    `mapstructure:"security"`
	Lateral     LateralConfig     `mapstructure:"lateral"`
}

type ServerConfig struct {
	APIAddr      string             `mapstructure:"api_addr"`
	WSAddr       string             `mapstructure:"ws_addr"`
	TLSEnabled   bool               `mapstructure:"tls_enabled"`
	TLSCert      string             `mapstructure:"tls_cert"`
	TLSKey       string             `mapstructure:"tls_key"`
	ClientCA     string             `mapstructure:"client_ca"`
	DomainFront  DomainFrontConfig  `mapstructure:"domain_front"`
	Debug        bool               `mapstructure:"debug"`
}

type DomainFrontConfig struct {
	Enabled       bool              `mapstructure:"enabled"`
	FrontDomain   string            `mapstructure:"front_domain"`
	FrontHost     string            `mapstructure:"front_host"`
	CustomHeaders map[string]string `mapstructure:"custom_headers"`
}

type DatabaseConfig struct {
	Path string `mapstructure:"path"`
}

type FileStorageConfig struct {
	Path           string `mapstructure:"path"`
	MaxFileSize    int64  `mapstructure:"max_file_size"`
	ChunkSize      int    `mapstructure:"chunk_size"`
	RetentionHours int    `mapstructure:"retention_hours"`
}

type SecurityConfig struct {
	APIKey         string   `mapstructure:"api_key"`
	JWTSecret      string   `mapstructure:"jwt_secret"`
	TokenExpiry    int      `mapstructure:"token_expiry"`
	RateLimit      int      `mapstructure:"rate_limit"`
	AllowedIPs     []string `mapstructure:"allowed_ips"`
	RequireAuth    bool     `mapstructure:"require_auth"`
	EncryptionKey  string   `mapstructure:"encryption_key"`
}

type LateralConfig struct {
	DefaultTimeout int    `mapstructure:"default_timeout"`
	MaxConcurrent  int    `mapstructure:"max_concurrent"`
	ToolsPath      string `mapstructure:"tools_path"`
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

	// Railway/Render/Fly inject PORT and only expose that one public port.
	// Bind the API (dashboard + HTTP agent beacon) to it so healthchecks work.
	if p := os.Getenv("PORT"); p != "" {
		cfg.Server.APIAddr = "0.0.0.0:" + p
		log.Printf("[config] PORT=%s -> api_addr=%s", p, cfg.Server.APIAddr)
	}
	if p := os.Getenv("RATC2_SERVER_API_ADDR"); p != "" {
		cfg.Server.APIAddr = p
	}
	if p := os.Getenv("RATC2_SERVER_WS_ADDR"); p != "" {
		cfg.Server.WSAddr = p
	}
	if p := os.Getenv("RATC2_DATABASE_PATH"); p != "" {
		cfg.Database.Path = p
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
	viper.SetDefault("file_storage.max_file_size", 300*1024*1024) // 300MB
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
		resolved := filepath.Join(base, path)
		log.Printf("[resolvePath] path=%s exe=%s base=%s resolved=%s", path, exe, base, resolved)
		if _, err := os.Stat(resolved); err == nil {
			return resolved
		}
		// Fallback: try relative to working directory
		cwd, _ := os.Getwd()
		resolved2 := filepath.Join(cwd, path)
		log.Printf("[resolvePath] fallback cwd=%s resolved2=%s", cwd, resolved2)
		return resolved2
	}
	// Fallback: try relative to working directory
	cwd, _ := os.Getwd()
	resolved := filepath.Join(cwd, path)
	log.Printf("[resolvePath] no exe cwd=%s resolved=%s", cwd, resolved)
	return resolved
}