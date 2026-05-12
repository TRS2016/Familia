interface EmptyStateProps {
  emoji: string
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ emoji, title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: '48px 24px',
      gap: 10,
      fontFamily: 'var(--font-family)',
    }}>
      <span style={{ fontSize: 40, lineHeight: 1 }}>{emoji}</span>
      <p style={{
        fontSize: 15,
        fontWeight: 700,
        color: 'var(--text)',
        margin: 0,
      }}>
        {title}
      </p>
      {description && (
        <p style={{
          fontSize: 13,
          color: 'var(--text-muted)',
          margin: 0,
          lineHeight: 1.5,
        }}>
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 8,
            padding: '10px 22px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-family)',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            boxShadow: 'var(--shadow-btn)',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
