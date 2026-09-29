import { useState } from 'react'

interface Props {
  value: string
  onCommit: (v: string) => void
  className?: string
  title?: string
}

/** Text that turns into an input on double-click. Enter/blur commits, Esc cancels. */
export function EditableName({ value, onCommit, className, title }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null) {
    return (
      <span className={className} title={title ?? 'Double-click to rename'} onDoubleClick={() => setDraft(value)}>
        {value}
      </span>
    )
  }
  const commit = () => {
    onCommit(draft)
    setDraft(null)
  }
  return (
    <input
      className="name-input"
      autoFocus
      value={draft}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') setDraft(null)
      }}
    />
  )
}
