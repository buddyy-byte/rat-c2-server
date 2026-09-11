import * as React from 'react'
import { motion } from 'framer-motion'
import { GradientText } from '@/components/ui/GradientText'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Loader2, Users, Shield, Mail, Clock, Globe, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

type Operator = {
  id: string
  username: string
  email: string
  role: string
  created_at: string
  last_login?: string
  last_ip?: string
}

export function RegisteredUsersPage() {
  const { user } = useAuthStore()
  const isOwner = (user?.role === 'owner') || (user?.username || '').toLowerCase() === 'chemical'
  const [rows, setRows] = React.useState<Operator[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const navigate = useNavigate()
  const { id } = useParams()

  React.useEffect(() => {
    if (!isOwner) return
    setLoading(true)
    api.listOperators()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [isOwner])

  if (!isOwner) return <Navigate to="/" replace />

  const selected = id ? rows.find(r => r.id === id || r.username === id) : null
  const filtered = rows.filter(r =>
    r.username.toLowerCase().includes(search.toLowerCase()) ||
    (r.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.last_ip || '').includes(search)
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <GradientText className="text-3xl font-bold" colors={['#fff', '#d946ef', '#a855f7']}>
            Registered Users
          </GradientText>
          <p className="text-dark-400 mt-1">Owner view — operators created via Register</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          setLoading(true)
          api.listOperators().then(setRows).finally(() => setLoading(false))
        }} disabled={loading}>
          <Loader2 className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-3">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="search username / email / ip" />
            {loading && <p className="text-sm text-dark-500">loading…</p>}
            {!loading && filtered.length === 0 && <p className="text-sm text-dark-500">no operators yet</p>}
            <div className="space-y-1">
              {filtered.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate(`/users/${r.id}`)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg border transition-colors',
                    selected?.id === r.id
                      ? 'border-accent-500/40 bg-accent-500/10 text-accent-300'
                      : 'border-dark-700 hover:border-dark-500 text-dark-200'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.username}</span>
                    <span className="text-[10px] uppercase tracking-wider text-dark-500">{r.role}</span>
                  </div>
                  <p className="text-xs text-dark-500 truncate">{r.email || 'no email'}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardContent className="p-6">
            {!selected && (
              <div className="text-dark-500 text-sm flex items-center gap-2">
                <Users className="w-4 h-4" />
                click a user to review their record
              </div>
            )}
            {selected && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-dark-100">{selected.username}</h2>
                    <p className="text-sm text-dark-500">{selected.role === 'owner' ? 'owner account' : 'registered operator'}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/users')}>
                    <ArrowLeft className="w-4 h-4" />
                    list
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Info icon={<Shield className="w-4 h-4" />} label="role" value={selected.role} />
                  <Info icon={<Mail className="w-4 h-4" />} label="email" value={selected.email || '—'} />
                  <Info icon={<Clock className="w-4 h-4" />} label="created" value={selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'} />
                  <Info icon={<Clock className="w-4 h-4" />} label="last login" value={selected.last_login ? new Date(selected.last_login).toLocaleString() : '—'} />
                  <Info icon={<Globe className="w-4 h-4" />} label="last ip" value={selected.last_ip || '—'} />
                  <Info icon={<Users className="w-4 h-4" />} label="id" value={selected.id} />
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg border border-dark-700 bg-dark-900">
      <div className="flex items-center gap-2 text-dark-500 text-xs uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>
      <p className="font-mono text-sm text-dark-100 break-all">{value}</p>
    </div>
  )
}
