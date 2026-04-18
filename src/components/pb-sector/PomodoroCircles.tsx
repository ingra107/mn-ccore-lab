import { motion } from 'framer-motion'

interface PomodoroCirclesProps {
  completed: number
  total?: number
  active?: boolean
  onClickCircle?: (index: number) => void
}

export default function PomodoroCircles({ completed, total = 4, active = false, onClickCircle }: PomodoroCirclesProps) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const isFilled = i < completed
        const isActive = active && i === completed

        return (
          <motion.button
            key={i}
            onClick={() => onClickCircle?.(i)}
            disabled={isFilled}
            style={{
              width: 10,
              height: 10,
              borderRadius: 'var(--radius-circle)',
              border: `1.5px solid ${isFilled || isActive ? 'var(--teal)' : 'var(--slate)'}`,
              background: isFilled ? 'var(--teal-solid)' : 'transparent',
              opacity: isFilled ? 1 : isActive ? 0.8 : 0.85,
              cursor: onClickCircle && !isFilled ? 'pointer' : 'default',
              padding: 0,
            }}
            animate={isActive ? { scale: [1, 1.3, 1] } : {}}
            transition={isActive ? { repeat: Infinity, duration: 2, ease: 'easeInOut' } : {}}
            title={isFilled ? 'Completed' : isActive ? 'In progress...' : 'Click to start pomodoro'}
          />
        )
      })}
    </div>
  )
}
