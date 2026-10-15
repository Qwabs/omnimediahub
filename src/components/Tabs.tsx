export type TabItem = { id: string; label: string }

/** Tab strip with a strong hairline bottom rule and a 2px ash underline on the active tab. */
export function Tabs({
  tabs,
  value,
  onChange,
  className = '',
  label = 'Sections',
}: {
  tabs: TabItem[]
  value: string
  onChange: (id: string) => void
  className?: string
  label?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex overflow-x-auto border-b border-hairline-strong ${className}`}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          className={`tab ${t.id === value ? 'tab-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
