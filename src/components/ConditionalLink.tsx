import { Link } from 'react-router-dom'

interface ConditionalLinkProps extends React.HTMLAttributes<HTMLElement> {
  to?: string
  children: React.ReactNode
}

export default function ConditionalLink({ to, children, ...props }: ConditionalLinkProps) {
  if (to) {
    return <Link to={to} {...props as any}>{children}</Link>
  }
  return <div {...props}>{children}</div>
}
