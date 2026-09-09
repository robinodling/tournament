interface Props {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  hint?: string
}

export function Stepper({ label, value, min, max, onChange, hint }: Props) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  return (
    <div className="stepper">
      <span className="stepper-label">
        {label}
        {hint && <span className="muted small"> {hint}</span>}
      </span>
      <span className="stepper-controls">
        <button type="button" className="btn" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={`Decrease ${label}`}>
          −
        </button>
        <input
          className="input stepper-input"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            if (!Number.isNaN(n)) onChange(clamp(n))
          }}
          aria-label={label}
        />
        <button type="button" className="btn" onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}>
          +
        </button>
      </span>
    </div>
  )
}
