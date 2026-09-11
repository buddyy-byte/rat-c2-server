package web

import "embed"

// DistFS is the production dashboard (Vite output under dist/).
//
//go:embed all:dist
var DistFS embed.FS
