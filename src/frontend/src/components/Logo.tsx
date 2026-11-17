import styles from './Logo.module.css'

type LogoProps = {
  /** "dark" su sfondo scuro (sidebar), "light" su sfondo chiaro (login) */
  variant?: 'dark' | 'light'
}

export function Logo({ variant = 'dark' }: LogoProps) {
  return (
    <span className={`${styles.logo} ${variant === 'light' ? styles.light : ''}`}>
      <svg width="28" height="28" viewBox="0 0 512 512" aria-hidden="true">
        <rect width="512" height="512" rx="112" fill="#0f172a" stroke="#334155" strokeWidth="16" />
        <rect x="88" y="112" width="300" height="84" rx="42" fill="#2dd4bf" />
        <rect x="168" y="216" width="220" height="84" rx="42" fill="#5eead4" />
        <rect x="244" y="320" width="144" height="84" rx="42" fill="#99f6e4" />
        <line
          x1="428"
          y1="100"
          x2="428"
          y2="412"
          stroke="#fbbf24"
          strokeWidth="32"
          strokeLinecap="round"
        />
      </svg>
      <span>
        <span className={styles.accent}>Flow</span>Sync
      </span>
    </span>
  )
}
