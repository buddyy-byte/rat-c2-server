'use client'

import { useEffect, useRef, useState } from 'react'

interface GridMotionProps {
  gradientColor?: string
  className?: string
  style?: React.CSSProperties
}

export function GridMotion({ gradientColor = '#d946ef', className, style }: GridMotionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (rect) {
        canvas.width = rect.width * window.devicePixelRatio
        canvas.height = rect.height * window.devicePixelRatio
        canvas.style.width = rect.width + 'px'
        canvas.style.height = rect.height + 'px'
        setDimensions({ width: rect.width, height: rect.height })
      }
    }

    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    const gridSize = 50
    const lineWidth = 1
    let time = 0

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

      const gradient = ctx.createLinearGradient(0, 0, dimensions.width, dimensions.height)
      gradient.addColorStop(0, gradientColor)
      gradient.addColorStop(1, '#a855f7')

      ctx.strokeStyle = gradient
      ctx.lineWidth = lineWidth
      ctx.globalAlpha = 0.15

      const offset = (time * 20) % gridSize

      // Vertical lines
      for (let x = -offset; x < dimensions.width + offset; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + Math.sin((x + time) * 0.01) * 10, dimensions.height)
        ctx.stroke()
      }

      // Horizontal lines
      for (let y = -offset; y < dimensions.height + offset; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(dimensions.width, y + Math.cos((y + time) * 0.01) * 10)
        ctx.stroke()
      }

      ctx.restore()
      time += 0.02
      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resize)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [gradientColor, dimensions.width, dimensions.height])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ ...style, width: '100%', height: '100%', display: 'block' }}
      aria-hidden="true"
    />
  )
}