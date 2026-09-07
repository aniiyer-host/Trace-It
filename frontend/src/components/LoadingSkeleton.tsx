import { cn } from '@/lib/utils'

interface LoadingSkeletonProps {
  width?: string | number
  height?: string | number
  className?: string
}

export default function LoadingSkeleton({
  width = '100%',
  height = '1rem',
  className = ''
}: LoadingSkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse',
        'bg-muted/50',
        'rounded',
        className
      )}
      style={{
        width: typeof width === 'string' ? width : `${width}px`,
        height: typeof height === 'string' ? height : `${height}px`
      }}
    />
  )
}