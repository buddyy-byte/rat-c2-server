'use client'

import { useEffect, useRef, useState } from 'react'

interface RippleGridProps {
  cellSize?: number
  color?: string
  radius?: number
  falloff?: 'linear' | 'smooth' | 'sharp'
  holdTime?: number
  fadeDuration?: number
  lineWidth?: number
  maxOpacity?: number
  fillOpacity?: number
  gridOpacity?: number
  cellRadius?: number
  clickPulse?: boolean
  pulseSpeed?: number
  className?: string
  style?: React.CSSProperties
}

interface Cell {
  x: number
  y: number
  brightness: number
  targetBrightness: number
  lastLit: number
  row: number
  col: number
}

export function RippleGrid({
  cellSize = 60,
  color = '#d946ef',
  radius = 120,
  falloff = 'smooth',
  holdTime = 300,
  fadeDuration = 800,
  lineWidth = 1,
  maxOpacity = 0.8,
  fillOpacity = 0.1,
  gridOpacity = 0.05,
  cellRadius = 4,
  clickPulse = true,
  pulseSpeed = 500,
  className = '',
  style = {},
}: RippleGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const cellsRef = useRef<Cell[][]>([])
  const mouseRef = useRef({ x: 0, y: 0, clicked: false, clickX: 0, clickY: 0, clickTime: 0 })
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

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
        initCells()
      }
    }

    const initCells = () => {
      const { width, height } = dimensions
      if (!width || !height) return

      const cols = Math.ceil(width / cellSize) + 2
      const rows = Math.ceil(height / cellSize) + 2
      const cells: Cell[][] = []

      for (let row = 0; row < rows; row++) {
        cells[row] = []
        for (let col = 0; col < cols; col++) {
          cells[row][col] = {
            x: col * cellSize,
            y: row * cellSize,
            brightness: 0,
            targetBrightness: 0,
            lastLit: 0,
            row,
            col,
          }
        }
      }
      cellsRef.current = cells
    }

    const falloffFn = (dist: number, rad: number): number => {
      const normalized = dist / rad
      if (normalized >= 1) return 0
      switch (falloff) {
        case 'linear': return 1 - normalized
        case 'smooth': return 1 - normalized * normalized * (3 - 2 * normalized)
        case 'sharp': return Math.pow(1 - normalized, 3)
        default: return 1 - normalized
      }
    }

    const animate = (time: number) => {
      const { width, height } = dimensions
      if (!width || !height) return

      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const dpr = window.devicePixelRatio
      const cs = cellSize * dpr
      const lw = lineWidth * dpr
      const cr = cellRadius * dpr

      // Handle click pulse
      if (mouseRef.current.clicked) {
        const elapsed = time - mouseRef.current.clickTime
        const pulseRadius = (elapsed / 1000) * pulseSpeed

        if (pulseRadius > Math.max(width, height) * 1.5) {
          mouseRef.current.clicked = false
        } else {
          cellsRef.current.forEach((row) => {
            row.forEach((cell) => {
              const dx = cell.x - mouseRef.current.clickX
              const dy = cell.y - mouseRef.current.clickY
              const dist = Math.sqrt(dx * dx + dy * dy)

              if (Math.abs(dist - pulseRadius) < cellSize * 0.5) {
                cell.targetBrightness = maxOpacity
                cell.lastLit = time
              }
            })
          })
        }
      }

      // Update and draw cells
      cellsRef.current.forEach((row) => {
        row.forEach((cell) => {
          // Mouse proximity
          const dx = mouseRef.current.x - cell.x
          const dy = mouseRef.current.y - cell.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < radius) {
            const brightness = falloffFn(dist, radius) * maxOpacity
            cell.targetBrightness = Math.max(cell.targetBrightness, brightness)
            cell.lastLit = time
          }

          // Fade out
          if (time - cell.lastLit > holdTime) {
            const fadeProgress = Math.min((time - cell.lastLit - holdTime) / fadeDuration, 1)
            cell.targetBrightness *= 1 - fadeProgress * 0.1
          }

          // Smooth brightness transition
          cell.brightness += (cell.targetBrightness - cell.brightness) * 0.1

          if (cell.brightness > 0.01 || gridOpacity > 0) {
            const opacity = Math.max(cell.brightness, gridOpacity)
            const r = parseInt(color.slice(1, 3), 16)
            const g = parseInt(color.slice(3, 5), 16)
            const b = parseInt(color.slice(5, 7), 16)

            // Draw cell outline
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`
            ctx.lineWidth = lw

            ctx.beginPath()
            if (cellRadius > 0) {
              // Rounded rect
              const x = cell.x * dpr
              const y = cell.y * dpr
              ctx.moveTo(x + cr, y)
              ctx.lineTo(x + cs - cr, y)
              ctx.quadraticCurveTo(x + cs, y, x + cs, y + cr)
              ctx.lineTo(x + cs, y + cs - cr)
              ctx.quadraticCurveTo(x + cs, y + cs, x + cs - cr, y + cs)
              ctx.lineTo(x + cr, y + cs)
              ctx.quadraticCurveTo(x, y + cs, x, y + cs - cr)
              ctx.lineTo(x, y + cr)
              ctx.quadraticCurveTo(x, y, x + cr, y)
            } else {
              ctx.rect(cell.x * dpr, cell.y * dpr, cs, cs)
            }
            ctx.stroke()

            // Draw fill
            if (cell.brightness > 0.01 && fillOpacity > 0) {
              ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${cell.brightness * fillOpacity})`
              if (cellRadius > 0) {
                // Same rounded rect for fill
                const x = cell.x * dpr
                const y = cell.y * dpr
                ctx.beginPath()
                ctx.moveTo(x + cr, y)
                ctx.lineTo(x + cs - cr, y)
                ctx.quadraticCurveTo(x + cs, y, x + cs, y + cr)
                ctx.lineTo(x + cs, y + cs - cr)
                ctx.quadraticCurveTo(x + cs, y + cs, x + cs - cr, y + cs)
                ctx.lineTo(x + cr, y + cs)
                ctx.quadraticCurveTo(x, y + cs, x, y + cs - cr)
                ctx.lineTo(x, y + cr)
                ctx.quadraticCurveTo(x, y, x + cr, y)
                ctx.fill()
              } else {
                ctx.fillRect(cell.x * dpr, cell.y * dpr, cs, cs)
              }
            }
          }
        })
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current.x = e.clientX - rect.left
      mouseRef.current.y = e.clientY - rect.top
    }

    const handleClick = (e: MouseEvent) => {
      if (!clickPulse) return
      const rect = canvas.getBoundingClientRect()
      mouseRef.current.clicked = true
      mouseRef.current.clickX = e.clientX - rect.left
      mouseRef.current.clickY = e.clientY - rect.top
      mouseRef.current.clickTime = performance.now()
    }

    window.addEventListener('resize', resize)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('click', handleClick)

    resize()
    animationRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('click', handleClick)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [cellSize, color, radius, falloff, holdTime, fadeDuration, lineWidth, maxOpacity, fillOpacity, gridOpacity, cellRadius, clickPulse, pulseSpeed])

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full ${className}`}
      style={{ ...style, touchAction: 'none' }}
      aria-hidden="true"
    />
  )
}