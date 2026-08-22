'use client'

import { useEffect, useRef, useState } from 'react'

interface ParticleTextProps {
  text: string
  particleSize?: number
  density?: number
  color?: string
  highlightColor?: string
  scatter?: number
  gatherDuration?: number
  stagger?: number
  pointerRepel?: number
  repelRadius?: number
  idleDrift?: number
  trigger?: 'mount' | 'hover' | 'click'
  fontSize?: number | string
  fontWeight?: number | string
  fontFamily?: string
  glow?: boolean
  className?: string
  style?: React.CSSProperties
}

interface Particle {
  x: number
  y: number
  targetX: number
  targetY: number
  vx: number
  vy: number
  color: string
  size: number
  delay: number
  gathered: boolean
}

export function ParticleText({
  text = 'RAT C2',
  particleSize = 2,
  density = 4,
  color = '#ffffff',
  highlightColor = '#d946ef',
  scatter = 150,
  gatherDuration = 1600,
  stagger = 400,
  pointerRepel = 30,
  repelRadius = 100,
  idleDrift = 0.5,
  trigger = 'mount',
  fontSize = 'clamp(3rem, 12vw, 8rem)',
  fontWeight = 800,
  fontFamily = 'JetBrains Mono, monospace',
  glow = true,
  className = '',
  style = {},
}: ParticleTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const particlesRef = useRef<Particle[]>([])
  const mouseRef = useRef({ x: 0, y: 0 })
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [gathered, setGathered] = useState(false)
  const [triggered, setTriggered] = useState(trigger === 'mount')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (rect) {
        canvas.width = rect.width * window.devicePixelRatio
        canvas.height = rect.height * window.devicePixelRatio
        canvas.style.width = `${rect.width}px`
        canvas.style.height = `${rect.height}px`
        setDimensions({ width: rect.width, height: rect.height })
        generateParticles()
      }
    }

    const generateParticles = () => {
      const { width, height } = dimensions
      if (!width || !height) return

      // Create offscreen canvas for text measurement
      const offscreen = document.createElement('canvas')
      const octx = offscreen.getContext('2d')!
      offscreen.width = width * window.devicePixelRatio
      offscreen.height = height * window.devicePixelRatio

      octx.font = `${fontWeight} ${fontSize} ${fontFamily}`
      octx.textAlign = 'center'
      octx.textBaseline = 'middle'
      octx.fillStyle = 'white'
      octx.fillText(text, width / 2 * window.devicePixelRatio, height / 2 * window.devicePixelRatio)

      const imageData = octx.getImageData(0, 0, offscreen.width, offscreen.height)
      const pixels = imageData.data

      const particles: Particle[] = []

      for (let y = 0; y < offscreen.height; y += density) {
        for (let x = 0; x < offscreen.width; x += density) {
          const index = (y * offscreen.width + x) * 4
          const alpha = pixels[index + 3]

          if (alpha > 128) {
            const targetX = x / window.devicePixelRatio
            const targetY = y / window.devicePixelRatio

            // Scatter initial position
            const angle = Math.random() * Math.PI * 2
            const distance = scatter * Math.random()
            const startX = targetX + Math.cos(angle) * distance
            const startY = targetY + Math.sin(angle) * distance

            particles.push({
              x: startX,
              y: startY,
              targetX,
              targetY,
              vx: 0,
              vy: 0,
              color: Math.random() > 0.7 ? highlightColor : color,
              size: particleSize * (0.5 + Math.random() * 0.5),
              delay: Math.random() * stagger,
              gathered: false,
            })
          }
        }
      }

      particlesRef.current = particles
      setGathered(false)
    }

    const animate = (time: number) => {
      const { width, height } = dimensions
      if (!width || !height) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particlesRef.current.forEach((particle) => {
        // Gather animation
        if (!particle.gathered) {
          if (time > particle.delay) {
            const progress = Math.min((time - particle.delay) / gatherDuration, 1)
            const eased = 1 - Math.pow(1 - progress, 3) // easeOutCubic

            particle.x += (particle.targetX - particle.x) * eased * 0.15
            particle.y += (particle.targetY - particle.y) * eased * 0.15

            if (progress >= 1) {
              particle.gathered = true
              particle.x = particle.targetX
              particle.y = particle.targetY
            }
          }
        } else {
          // Idle drift
          particle.x += (Math.random() - 0.5) * idleDrift
          particle.y += (Math.random() - 0.5) * idleDrift

          // Mouse repel
          const dx = mouseRef.current.x - particle.x
          const dy = mouseRef.current.y - particle.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < repelRadius && dist > 0) {
            const force = (repelRadius - dist) / repelRadius * pointerRepel
            particle.vx -= (dx / dist) * force * 0.1
            particle.vy -= (dy / dist) * force * 0.1
          }

          // Spring back to target
          particle.vx += (particle.targetX - particle.x) * 0.02
          particle.vy += (particle.targetY - particle.y) * 0.02
          particle.vx *= 0.92
          particle.vy *= 0.92
          particle.x += particle.vx
          particle.y += particle.vy
        }

        // Draw particle
        ctx.beginPath()
        ctx.arc(particle.x * window.devicePixelRatio, particle.y * window.devicePixelRatio, particle.size * window.devicePixelRatio, 0, Math.PI * 2)

        if (glow && particle.color === highlightColor) {
          const gradient = ctx.createRadialGradient(
            particle.x * window.devicePixelRatio,
            particle.y * window.devicePixelRatio,
            0,
            particle.x * window.devicePixelRatio,
            particle.y * window.devicePixelRatio,
            particle.size * window.devicePixelRatio * 3
          )
          gradient.addColorStop(0, highlightColor)
          gradient.addColorStop(1, 'transparent')
          ctx.fillStyle = gradient
          ctx.arc(particle.x * window.devicePixelRatio, particle.y * window.devicePixelRatio, particle.size * window.devicePixelRatio * 3, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.fillStyle = particle.color
        ctx.beginPath()
        ctx.arc(particle.x * window.devicePixelRatio, particle.y * window.devicePixelRatio, particle.size * window.devicePixelRatio, 0, Math.PI * 2)
        ctx.fill()
      })

      const allGathered = particlesRef.current.every(p => p.gathered)
      if (allGathered && !gathered) {
        setGathered(true)
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current.x = e.clientX - rect.left
      mouseRef.current.y = e.clientY - rect.top
    }

    const handleClick = () => {
      if (trigger === 'click') {
        setTriggered(true)
        generateParticles()
      }
    }

    const handleMouseEnter = () => {
      if (trigger === 'hover') {
        setTriggered(true)
        generateParticles()
      }
    }

    window.addEventListener('resize', resize)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('mouseenter', handleMouseEnter)

    resize()
    if (triggered) {
      generateParticles()
      animationRef.current = requestAnimationFrame(animate)
    }

    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('mouseenter', handleMouseEnter)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [text, particleSize, density, color, highlightColor, scatter, gatherDuration, stagger, pointerRepel, repelRadius, idleDrift, trigger, fontSize, fontWeight, fontFamily, glow, triggered])

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full ${className}`}
      style={{ ...style, touchAction: 'none' }}
      aria-label={text}
      aria-hidden="true"
    />
  )
}