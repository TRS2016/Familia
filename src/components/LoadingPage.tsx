import Spinner from './Spinner'

export default function LoadingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg, #F7F2EA)',
      fontFamily: 'var(--font-family, Nunito, system-ui, sans-serif)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
    }}>
      <div style={{
        fontSize: 36,
        fontWeight: 900,
        color: 'var(--accent, #E07B54)',
        letterSpacing: '-1px',
      }}>
        Familia
      </div>
      <Spinner size={28} />
    </div>
  )
}
