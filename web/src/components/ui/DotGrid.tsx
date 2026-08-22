'use client'

import { useEffect, useRef, useState } from 'react'

interface DotGridProps {
  dotSize?: number
  gap?: number
  baseColor?: string
  activeColor?: string
  proximity?: number
  speedTrigger?: number
  shockRadius?: number
  shockStrength?: number
  maxSpeed?: number
  resistance?: number
  returnDuration?: number
  className?: string
  style?: React.CSSProperties
}

interface Dot {
  x: number
  y: number
  baseX: number
  baseY: number
  vx: number
  vy: number
  size: number
  color: string
  active: boolean
}

export function DotGrid({
  dotSize = 4,
  gap = 20,
  baseColor = '#1e293b',
  activeColor = '#d946ef',
  proximity = 100,
  speedTrigger = 100,
  shockRadius = 200,
  shockStrength = 3,
  maxSpeed = 3000,
  resistance = 500,
  returnDuration = 1.5,
  className = '',
  style = {},
}: DotGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const dotsRef = useRef<Dot[]>([])
  const mouseRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, lastX: 0, lastY: 0, lastTime: 0 })
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (rect) {
        canvas.width = rect.width * window.devicePixelRatio
        canvas.height = rect.height * window.devicePixelRatio
        canvas.style.width = `${rect.width}px`
        canvas.style.height = `${rect.height}px`
        setDimensions({ width: rect.width, height: rect.height })
        initDots()
      }
    }

    const initDots = () => {
      const { width, height } = dimensions
      if (!width || !height) return

      const cols = Math.ceil(width / gap) + 1
      const rows = Math.ceil(height / gap) + 1
      const dots: Dot[] = []

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * gap
          const y = row * gap
          dots.push({
            x,
            y,
            baseX: x,
            baseY: y,
            vx: 0,
            vy: 0,
            size: dotSize,
            color: baseColor,
            active: false,
          })
        }
      }
      dotsRef.current = dots
    }

    const animate = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const { width, height } = dimensions
      if (!width || !height) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const now = performance.now()
      const dt = Math.min((now - (mouseRef.current.lastTime || now)) / 1000, 0.1)
      mouseRef.current.lastTime = now

      // Calculate mouse velocity
      const dx = mouseRef.current.x - mouseRef.current.lastX
      const dy = mouseRef.current.y - mouseRef.current.lastY
      mouseRef.current.vx = dx / dt
      mouseRef.current.vy = dy / dt
      mouseRef.current.lastX = mouseRef.current.x
      mouseRef.current.lastY = mouseRef.current.y

      const mouseSpeed = Math.sqrt(mouseRef.current.vx ** 2 + mouseRef.current.vy ** 2)

      dotsRef.current.forEach((dot) => {
        const dx = mouseRef.current.x - dot.x
        const dy = mouseRef.current.y - dot.y
        const dist = Math.sqrt(dx ** 2 + dy ** 2)

        // Proximity effect
        if (dist < proximity) {
          const force = (proximity - dist) / proximity
          const angle = Math.atan2(dy, dx)
          const pushForce = force * 50
          dot.vx -= Math.cos(angle) * pushForce * dt * 60
          dot.vy -= Math.sin(angle) * pushForce * dt * 60
          dot.active = true
          dot.color = activeColor
        } else {
          dot.active = false
          // Return to base color
          const r = parseInt(baseColor.slice(1, 3), 16)
          const g = parseInt(baseColor.slice(3, 5), 16)
          const b = parseInt(baseColor.slice(5, 7), 16)
          const ar = parseInt(activeColor.slice(1, 3), 16)
          const ag = parseInt(activeColor.slice(3, 5), 16)
          const ab = parseInt(activeColor.slice(5, 7), 16)
          dot.color = `rgb(${Math.round(r + (ar - r) * 0.1)}, ${Math.round(g + (ag - g) * 0.1)}, ${Math.round(b + (ab - b) * 0.1)})`
        }

        // Inertia effect on fast mouse movement
        if (mouseSpeed > speedTrigger) {
          const inertiaForce = Math.min(mouseSpeed / maxSpeed, 1) * 100
          dot.vx += (Math.random() - 0.5) * inertiaForce * dt * 60
          dot.vy += (Math.random() - 0.5) * inertiaForce * dt * 60
        }

        // Spring back to base position
        const springX = (dot.baseX - dot.x) * 0.02
        const springY = (dot.baseY - dot.y) * 0.02
        dot.vx += springX
        dot.vy += springY

        // Damping
        dot.vx *= 0.92
        dot.vy *= 0.92

        // Update position
        dot.x += dot.vx * dt * 60
        dot.y += dot.vy * dt * 60

        // Draw dot
        ctx.beginPath()
        ctx.arc(dot.x * window.devicePixelRatio, dot.y * window.devicePixelRatio, dot.size * window.devicePixelRatio, 0, Math.PI * 2)
        ctx.fillStyle = dot.color
        ctx.fill()
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current.x = e.clientX - rect.left
      mouseRef.current.y = e.clientY - rect.top
    }

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top

      dotsRef.current.forEach((dot) => {
        const dx = clickX - dot.x
        const dy = clickY - dot.y
        const dist = Math.sqrt(dx ** 2 + dy ** 2)

        if (dist < shockRadius) {
          const force = (shockRadius - dist) / shockRadius * shockStrength * 200
          const angle = Math.atan2(dy, dx)
          dot.vx -= Math.cos(angle) * force
          dot.vy -= Math.sin(angle) * force
        }
      })
    }

    window.addEventListener('resize', resize)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('click', handleClick)

    resize()
    animate()

    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('click', handleClick)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [dotSize, gap, baseColor, activeColor, proximity, speedTrigger, shockRadius, shockStrength, maxSpeed, resistance, returnDuration])

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full ${className}`}
      style={{ ...style, touchAction: 'none' }}
      aria-hidden="true"
    />
  )
}