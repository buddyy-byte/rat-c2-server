import * as React from "react"
import { type VariantProps, cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-950 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-accent-600 to-purple-600 text-white hover:from-accent-500 hover:to-purple-500 active:from-accent-700 active:to-purple-700 shadow-glow",
        destructive: "bg-red-600 text-white hover:bg-red-500 active:bg-red-700 shadow-red-500/20",
        outline: "border border-dark-700 bg-dark-800 text-dark-100 hover:bg-dark-700 hover:border-accent-500/50",
        secondary: "bg-dark-800 text-dark-100 border border-dark-700 hover:bg-dark-700 hover:border-accent-500/50",
        ghost: "text-dark-300 hover:bg-dark-800 hover:text-white active:bg-dark-700",
        link: "text-accent-400 underline-offset-4 hover:underline",
        success: "bg-green-600 text-white hover:bg-green-500 active:bg-green-700 shadow-green-500/20",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-8",
        xl: "h-12 rounded-xl px-10 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }