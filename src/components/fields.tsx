import type { ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/* fields — text-input / textarea / select / slider / toggle / colour  */
/* ------------------------------------------------------------------ */

function FieldShell({
  id,
  label,
  hint,
  children,
  aside,
}: {
  id: string
  label: string
  hint?: string
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-body-md text-ink">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint ? <p className="text-caption-md text-mute">{hint}</p> : null}
    </div>
  )
}

export function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <input
        id={id}
        className="field"
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  )
}

export function Textarea({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 4,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  rows?: number
}) {
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <textarea
        id={id}
        className="field"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  )
}

export function Select({
  id,
  label,
  value,
  options,
  onChange,
  hint,
}: {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

export function Slider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  hint,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      aside={
        <span className="text-caption-md tabular-nums text-mute">
          {value}
          {unit}
        </span>
      }
    >
      <input
        id={id}
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </FieldShell>
  )
}

/** ASCII checkbox — `[x]` / `[ ]`. Never a switch graphic. */
export function Toggle({
  id,
  label,
  checked,
  onChange,
  hint,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className="flex items-center gap-3 self-start py-1 text-left text-body-md text-ink"
        onClick={() => onChange(!checked)}
      >
        <span aria-hidden="true" className="text-ink">
          {checked ? '[x]' : '[ ]'}
        </span>
        <span>{label}</span>
      </button>
      {hint ? <p className="pl-8 text-caption-md text-mute">{hint}</p> : null}
    </div>
  )
}

export function ColorInput({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      aside={<span className="text-caption-md text-mute">{value || 'transparent'}</span>}
    >
      <input
        id={id}
        className="h-10 w-20 cursor-pointer border border-hairline bg-surface-soft p-1"
        type="color"
        value={value || '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  )
}
