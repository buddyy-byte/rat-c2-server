import { createContext, useContext, useState, ReactNode } from 'react'
import clsx from 'clsx'

interface TabsContextType {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = createContext<TabsContextType | null>(null)

export function Tabs({ children, value, onValueChange, className }: { children: ReactNode; value: string; onValueChange: (value: string) => void; className?: string }) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={clsx('space-y-4', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('flex gap-1 bg-dark-800/50 p-1 rounded-lg border border-dark-700', className)}>{children}</div>
}

export function TabTrigger({ value, children, className, disabled }: { value: string; children: ReactNode; className?: string; disabled?: boolean }) {
  const context = useContext(TabsContext)
  if (!context) throw new Error('TabTrigger must be used within Tabs')
  
  const isActive = context.value === value
  return (
    <button
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => !disabled && context.onValueChange(value)}
      className={clsx(
        'px-4 py-2 rounded-md text-sm font-medium transition-all duration-200',
        isActive ? 'bg-accent-600 text-white shadow-lg shadow-accent-600/25' : 'text-dark-400 hover:text-dark-100 hover:bg-dark-700/50',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {children}
    </button>
  )
}

export function TabContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const context = useContext(TabsContext)
  if (!context) throw new Error('TabContent must be used within Tabs')
  
  if (context.value !== value) return null
  return <div className={clsx('animate-fade-in', className)}>{children}</div>
}

export { Tabs as Tab }