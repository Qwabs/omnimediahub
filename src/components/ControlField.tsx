import { ColorInput, Select, Slider, TextInput, Toggle } from './fields'
import type { Control } from '@/tools/registry/types'

/** Numeric field used by dimension and timerange controls. */
export function NumberInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-caption-md text-body">
      <span className="text-mute">{label}</span>
      <input
        id={id}
        type="number"
        className="field h-9 w-24 px-2"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

/**
 * Renders a registry `Control` as the matching field. Shared by the tool
 * workspace and the pipeline console.
 */
export function ControlField({
  control,
  value,
  onChange,
}: {
  control: Control
  value: unknown
  onChange: (v: unknown) => void
}) {
  switch (control.kind) {
    case 'select':
      return (
        <Select
          id={control.id}
          label={control.label}
          value={String(value)}
          options={control.options}
          hint={control.hint}
          onChange={onChange}
        />
      )
    case 'slider':
      return (
        <Slider
          id={control.id}
          label={control.label}
          value={Number(value)}
          min={control.min}
          max={control.max}
          step={control.step}
          unit={control.unit}
          hint={control.hint}
          onChange={onChange}
        />
      )
    case 'toggle':
      return (
        <Toggle
          id={control.id}
          label={control.label}
          checked={Boolean(value)}
          hint={control.hint}
          onChange={onChange}
        />
      )
    case 'text':
      return (
        <TextInput
          id={control.id}
          label={control.label}
          value={String(value ?? '')}
          placeholder={control.placeholder}
          hint={control.hint}
          onChange={onChange}
        />
      )
    case 'color':
      return (
        <ColorInput
          id={control.id}
          label={control.label}
          value={String(value ?? '')}
          hint={control.hint}
          onChange={onChange}
        />
      )
    case 'dimensions': {
      const size = (value as { width: number; height: number }) ?? { width: 0, height: 0 }
      return (
        <div className="flex flex-col gap-2">
          <span className="text-body-md text-ink">{control.label}</span>
          <div className="flex flex-wrap gap-4">
            <NumberInput
              id={`${control.id}-width`}
              label="w"
              value={size.width}
              onChange={(width) => onChange({ ...size, width })}
            />
            <NumberInput
              id={`${control.id}-height`}
              label="h"
              value={size.height}
              onChange={(height) => onChange({ ...size, height })}
            />
          </div>
          {control.hint ? <p className="text-caption-md text-mute">{control.hint}</p> : null}
        </div>
      )
    }
    case 'timerange': {
      const range = (value as { start: number; end: number }) ?? { start: 0, end: 0 }
      return (
        <div className="flex flex-col gap-2">
          <span className="text-body-md text-ink">{control.label}</span>
          <div className="flex flex-wrap gap-4">
            <NumberInput
              id={`${control.id}-start`}
              label="start"
              value={range.start}
              onChange={(start) => onChange({ ...range, start })}
            />
            <NumberInput
              id={`${control.id}-end`}
              label="end"
              value={range.end}
              onChange={(end) => onChange({ ...range, end })}
            />
          </div>
          {control.hint ? <p className="text-caption-md text-mute">{control.hint}</p> : null}
        </div>
      )
    }
  }
}
