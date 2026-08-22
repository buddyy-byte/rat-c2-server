import clsx from 'clsx'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'destructive' | 'outline' | 'warning' | 'info'
  size?: 'sm' | 'md'
}

export function Badge({ className, variant = 'default', size = 'md', children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-accent-600/20 text-accent-400 border border-accent-600/30',
    success: 'bg-green-600/20 text-green-400 border border-green-600/30',
    destructive: 'bg-red-600/20 text-red-400 border border-red-600/30',
    warning: 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/30',
    info: 'bg-blue-600/20 text-blue-400 border border-blue-600/30',
    outline: 'bg-transparent text-dark-300 border border-dark-600',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full border',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}