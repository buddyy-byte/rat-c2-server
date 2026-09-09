import * as React from "react"
import { cn } from "@/lib/utils"

interface GradientTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  colors?: string[]
  className?: string
}

export function GradientText({ children, colors = ['#f8fafc', '#d946ef', '#a855f7'], className, ...props }: GradientTextProps) {
  const gradientId = React.useId()
  
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          {colors.map((color, index) => (
            <stop key={index} offset={`${(index / (colors.length - 1)) * 100}%`} stopColor={color} />
          ))}
        </linearGradient>
      </defs>
      <span
        className={cn("bg-gradient-to-r bg-clip-text text-transparent", className)}
        style={{ backgroundImage: `url(#${gradientId})` } as React.CSSProperties}
        {...props}
      >
        {children}
      </span>
    </>
  )
}