import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg, #F7F2EA)',
        fontFamily: 'var(--font-family, Nunito, system-ui, sans-serif)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
      }}>
        <div style={{
          background: 'var(--bg-card, #FFFAF5)',
          borderRadius: 'var(--radius-xl, 24px)',
          padding: '32px 24px',
          maxWidth: 360,
          width: '100%',
          textAlign: 'center',
          boxShadow: 'var(--shadow-card, 0 2px 12px rgba(0,0,0,0.07))',
        }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>💥</div>
          <h1 style={{
            fontSize: 20,
            fontWeight: 900,
            color: 'var(--text, #3D2B1F)',
            margin: '0 0 8px',
          }}>
            Quelque chose s'est cassé
          </h1>
          <p style={{
            fontSize: 13,
            color: 'var(--text-sub, #7A6A60)',
            lineHeight: 1.6,
            margin: '0 0 24px',
          }}>
            Une erreur inattendue est survenue.<br />
            Recharge la page pour continuer.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'var(--accent, #E07B54)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md, 14px)',
              padding: '13px 24px',
              fontFamily: 'inherit',
              fontSize: 15,
              fontWeight: 800,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Recharger l'application
          </button>
          <details style={{ marginTop: 16, textAlign: 'left' }}>
            <summary style={{ fontSize: 11, color: 'var(--text-muted, #A89F97)', cursor: 'pointer' }}>
              Détails de l'erreur
            </summary>
            <pre style={{
              fontSize: 10,
              color: 'var(--text-muted, #A89F97)',
              marginTop: 8,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {this.state.error.message}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
