'use client'

import { useEffect, useRef } from 'react'

interface GradientBackgroundProps {
  colors?: string[]
  speed?: number
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

export function GradientBackground({
  colors = ['#0f172a', '#1e1b4b', '#312e81', '#1e1b4b', '#0f172a'],
  speed = 0.1,
  className = '',
  style = {},
  children,
}: GradientBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>()
  const [position, setPosition] = useState(0)

  useEffect(() => {
    let pos = 0
    const animate = () => {
      pos += speed * 0.001
      if (pos > 1) pos = 0
      setPosition(pos)
      animationRef.current = requestAnimationFrame(animate)
    }
    animationRef.current = requestAnimationFrame(animate)
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current) }
  }, [speed])

  const gradientStops = colors.map((c, i) => `${c} ${(i / (colors.length - 1)) * 100}%`).join(', ')

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{
        ...style,
        background: `linear-gradient(${position * 360}deg, ${gradientStops})`,
        backgroundSize: '400% 400%',
      }}
    >
      {children}
      {/* Overlay noise texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          opacity: 0.03,
          mixBlendMode: 'overlay',
        }}
        aria-hidden="true"
      />
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 50%, ${colors[2]}40 0%, transparent 70%)`,
          mixBlendMode: 'screen',
        }}
        aria-hidden="true"
      />
    </div>
  )
}

import { useState } from 'react'