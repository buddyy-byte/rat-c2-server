import * as React from 'react'
import { Wifi, WifiOff, RefreshCw, CloudOff, Pause } from 'lucide-react'
import { useAgentStore } from '@/stores/agentStore'
import { cn } from '@/lib/utils'

// The old console showed a red "Disconnected" pill on every page because it read
// the operator WebSocket, which cannot survive a serverless freeze — the fleet
// could be beaconing happily while the UI claimed it was offline. This shows the
// truth: whether the poll is landing, how fresh the snapshot is, and whether the
// agent registry is actually being persisted anywhere.
export function LiveIndicator({ className }: { className?: string }) {
  const { liveState, lastSync, durable, storeKind, pollMs, refreshLive, agents } = useAgentStore()
  const [, force] = React.useState(0)

  React.useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const ageS = lastSync ? Math.max(0, Math.round((Date.now() - lastSync) / 1000)) : null
  const active = agents.filter((a) => a.Status === 'active').length

  const tone =
    liveState === 'live'
      ? { dot: 'bg-emerald-400 animate-pulse', text: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Live' }
      : liveState === 'paused'
        ? { dot: 'bg-amber-400', text: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Paused' }
        : liveState === 'error'
          ? { dot: 'bg-red-400', text: 'text-red-400', bg: 'bg-red-500/10', label: 'Reconnecting' }
          : { dot: 'bg-dark-500', text: 'text-dark-400', bg: 'bg-dark-700/40', label: 'Idle' }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => void refreshLive()}
        title={
          liveState === 'error'
            ? `Last error: not reachable`
            : `Snapshot ${ageS === null ? 'pending' : `${ageS}s old`} · polling every ${(pollMs / 1000).toFixed(1)}s`
        }
        className={cn(
          'flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors',
          tone.bg,
          tone.text,
          'hover:brightness-125'
        )}
      >
        <span className={cn('w-2 h-2 rounded-full', tone.dot)} />
        {liveState === 'live' ? (
          <Wifi className="w-3 h-3" />
        ) : liveState === 'paused' ? (
          <Pause className="w-3 h-3" />
        ) : liveState === 'error' ? (
          <WifiOff className="w-3 h-3" />
        ) : (
          <RefreshCw className="w-3 h-3" />
        )}
        {tone.label}
        {ageS !== null && <span className="tabular-nums opacity-70">{ageS}s</span>}
      </button>

      {!durable && liveState !== 'idle' && (
        <span
          className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400"
          title="Agent records are held in /tmp only. Add KV_REST_API_URL + KV_REST_API_TOKEN (Upstash) to keep the fleet across cold starts."
        >
          <CloudOff className="w-3 h-3" />
          not persisted
        </span>
      )}

      {durable && (
        <span
          className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-dark-700/40 text-dark-400"
          title={`Agent registry persisted via ${storeKind}`}
        >
          {active} live · {storeKind}
        </span>
      )}
    </div>
  )
}
