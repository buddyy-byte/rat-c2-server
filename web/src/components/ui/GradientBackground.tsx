import * as React from "react"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

interface GradientBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

export function GradientBackground({ children, className, ...props }: GradientBackgroundProps) {
  return (
    <div className={cn("relative min-h-screen bg-dark-950", className)} {...props}>
      {/* Mesh gradient background */}
      <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <motion.div
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-accent-500/10 blur-3xl"
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-purple-500/10 blur-3xl"
          animate={{ scale: [1, 1.05, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 w-[400px] h-[400px] rounded-full bg-accent-500/5 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        />
      </div>
      
      {/* Grid pattern overlay */}
      <div className="absolute inset-0 -z-10 opacity-20" aria-hidden="true">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#grid)" />
        </svg>
      </div>

      {/* Subtle vignette */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-transparent to-dark-950/50 pointer-events-none" />

      <div className="relative z-0">{children}</div>
    </div>
  )
}