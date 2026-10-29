import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Agent } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeAgent(raw: any): Agent {
  if (!raw || typeof raw !== "object") {
    return {
      ID: "",
      Hostname: "",
      Username: "",
      OS: "",
      Arch: "",
      IP: "",
      FirstSeen: "",
      LastSeen: "",
      Status: "offline",
      Version: "",
      PID: 0,
      IsAdmin: false,
      AV: "",
      Country: "",
      City: "",
    }
  }
  const status = (raw.Status || raw.status || "offline") as Agent["Status"]
  return {
    ID: String(raw.ID ?? raw.id ?? ""),
    id: raw.id ?? raw.ID,
    Hostname: String(raw.Hostname ?? raw.hostname ?? ""),
    hostname: raw.hostname ?? raw.Hostname,
    Username: String(raw.Username ?? raw.username ?? ""),
    username: raw.username ?? raw.Username,
    OS: String(raw.OS ?? raw.os ?? raw.OSVersion ?? raw.os_version ?? ""),
    os: raw.os ?? raw.OS,
    OSVersion: raw.OSVersion ?? raw.os_version,
    os_version: raw.os_version ?? raw.OSVersion,
    Arch: String(raw.Arch ?? raw.arch ?? ""),
    arch: raw.arch ?? raw.Arch,
    IP: String(raw.IP ?? raw.ip ?? raw.ip_address ?? raw.IPAddress ?? ""),
    ip: raw.ip ?? raw.IP,
    ip_address: raw.ip_address ?? raw.IPAddress,
    FirstSeen: String(raw.FirstSeen ?? raw.first_seen ?? ""),
    first_seen: raw.first_seen ?? raw.FirstSeen,
    LastSeen: String(raw.LastSeen ?? raw.last_seen ?? ""),
    last_seen: raw.last_seen ?? raw.LastSeen,
    Status: status === "active" || status === "idle" ? status : "offline",
    status,
    Version: String(raw.Version ?? raw.version ?? raw.build_version ?? ""),
    PID: Number(raw.PID ?? raw.pid ?? 0),
    pid: raw.pid ?? raw.PID,
    IsAdmin: Boolean(raw.IsAdmin ?? ((raw.privileges ?? 0) > 0)),
    AV: String(raw.AV ?? raw.av ?? ""),
    Country: String(raw.Country ?? raw.country ?? ""),
    country: raw.country ?? raw.Country,
    City: String(raw.City ?? raw.city ?? ""),
  }
}

export function normalizeAgents(raw: any): Agent[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeAgent)
}

// The file-transfer wire format is snake_case while the React types are
// PascalCase, so every row rendered straight from the API showed undefined for
// id/path/status/size — the download link pointed at "undefined".
export function normalizeTransfer(raw: any): any {
  if (!raw || typeof raw !== "object") return raw
  return {
    ...raw,
    ID: String(raw.ID ?? raw.id ?? ""),
    AgentID: String(raw.AgentID ?? raw.agent_id ?? ""),
    Filename: String(raw.Filename ?? raw.filename ?? ""),
    Path: String(raw.Path ?? raw.path ?? ""),
    Size: Number(raw.Size ?? raw.size ?? 0),
    Checksum: String(raw.Checksum ?? raw.checksum ?? ""),
    Operation: String(raw.Operation ?? raw.operation ?? ""),
    Status: String(raw.Status ?? raw.status ?? ""),
    Progress: Number(raw.Progress ?? raw.progress ?? 0),
    CreatedAt: String(raw.CreatedAt ?? raw.created_at ?? ""),
  }
}

export function normalizeTransfers(raw: any): any[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeTransfer)
}
