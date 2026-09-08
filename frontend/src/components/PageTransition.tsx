import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

interface PageTransitionProps {
  children: React.ReactNode
}

export default function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation()
  const [pathname, setPathname] = useState(location.pathname)

  useEffect(() => {
    const handler = () => {
      setPathname(location.pathname)
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [location.pathname])

  // In a real implementation, we would use framer-motion or CSS transitions
  // For now, we'll just return the children with a simple key change to force remount
  return <div key={pathname}>{children}</div>
}