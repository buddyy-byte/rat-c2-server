'use client'

import { useEffect, useRef } from 'react'

interface GradientTextProps {
  children: React.ReactNode
  className?: string
  colors?: string[]
  animationSpeed?: number
  direction?: 'horizontal' | 'vertical' | 'diagonal'
  pauseOnHover?: boolean
  yoyo?: boolean
  showBorder?: boolean
  style?: React.CSSProperties
}

export function GradientText({
  children,
  className = '',
  colors = ['#d946ef', '#a855f7', '#9333ea', '#7e22ce'],
  animationSpeed = 8,
  direction = 'horizontal',
  pauseOnHover = true,
  yoyo = true,
  showBorder = false,
  style = {},
}: GradientTextProps) {
  const textRef = useRef<HTMLSpanElement>(null)
  const animationRef = useRef<number>()

  useEffect(() => {
    const element = textRef.current
    if (!element) return

    const gradientString = colors.join(', ')
    let position = 0
    let directionMultiplier = 1
    let paused = false

    const animate = () => {
      if (!paused) {
        position += directionMultiplier * (1 / animationSpeed) * (1 / 60)

        if (position >= 1) {
          if (yoyo) {
            directionMultiplier = -1
            position = 1
          } else {
            position = 0
          }
        } else if (position <= 0) {
          if (yoyo) {
            directionMultiplier = 1
            position = 0
          } else {
            position = 1
          }
        }

        let gradient: string
        switch (direction) {
          case 'horizontal':
            gradient = `linear-gradient(90deg, ${gradientString})`
            break
          case 'vertical':
            gradient = `linear-gradient(180deg, ${gradientString})`
            break
          case 'diagonal':
            gradient = `linear-gradient(45deg, ${gradientString})`
            break
        }

        element.style.background = gradient
        element.style.backgroundSize = '200% 200%'
        element.style.backgroundPosition = `${position * 100}% ${position * 100}%`
        element.style.webkitBackgroundClip = 'text'
        element.style.backgroundClip = 'text'
        element.style.color = 'transparent'

        if (showBorder) {
          element.style.webkitTextStroke = '1px transparent'
          element.style.backgroundImage = gradient
          element.style.backgroundSize = '200% 200%'
          element.style.backgroundPosition = `${position * 100}% ${position * 100}%`
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    const handleMouseEnter = () => { if (pauseOnHover) paused = true }
    const handleMouseLeave = () => { if (pauseOnHover) paused = false }

    element.addEventListener('mouseenter', handleMouseEnter)
    element.addEventListener('mouseleave', handleMouseLeave)

    animate()

    return () => {
      element.removeEventListener('mouseenter', handleMouseEnter)
      element.removeEventListener('mouseleave', handleMouseLeave)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [colors, animationSpeed, direction, pauseOnHover, yoyo, showBorder])

  return (
    <span
      ref={textRef}
      className={`${className} bg-clip-text text-transparent`}
      style={{
        ...style,
        background: `linear-gradient(90deg, ${colors.join(', ')})`,
        backgroundSize: '200% 200%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
      }}
    >
      {children}
    </span>
  )
}