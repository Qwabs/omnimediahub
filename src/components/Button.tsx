import { Link } from 'react-router'
import type { ComponentProps, ReactNode } from 'react'

type Variant = 'primary' | 'secondary'

const variantClass: Record<Variant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return <button className={`${variantClass[variant]} ${className}`} {...props} />
}

export function ButtonLink({
  to,
  variant = 'primary',
  className = '',
  children,
}: {
  to: string
  variant?: Variant
  className?: string
  children: ReactNode
}) {
  return (
    <Link to={to} className={`${variantClass[variant]} ${className}`}>
      {children}
    </Link>
  )
}
