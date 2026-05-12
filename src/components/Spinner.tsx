export default function Spinner({
  size = 32,
  color = 'var(--accent)',
}: {
  size?: number
  color?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Chargement"
      role="status"
    >
      <circle
        cx="12" cy="12" r="9.5"
        stroke={color}
        strokeWidth="2.5"
        strokeOpacity="0.18"
      />
      <path
        d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.75s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  )
}
