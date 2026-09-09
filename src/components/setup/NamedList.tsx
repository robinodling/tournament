import { useState } from 'react'
import type { Id } from '../../types'

interface Item {
  id: Id
  name: string
}

interface Props {
  items: Item[]
  placeholder: string
  onRename: (id: Id, name: string) => void
  onRemove: (id: Id) => void
  onAdd: (names: string[]) => void
}

/** Editable list of names with single-add and paste-many. */
export function NamedList({ items, placeholder, onRename, onRemove, onAdd }: Props) {
  const [draft, setDraft] = useState('')
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const addDraft = () => {
    const name = draft.trim()
    if (!name) return
    onAdd([name])
    setDraft('')
  }

  const addPasted = () => {
    const names = pasteText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (names.length) onAdd(names)
    setPasteText('')
    setPasteMode(false)
  }

  return (
    <div className="stack">
      {items.length > 0 && (
        <div className="list">
          {items.map((item, i) => (
            <div key={item.id} className="list-item">
              <span className="muted small" style={{ width: '1.5em' }}>
                {i + 1}
              </span>
              <input className="input grow" value={item.name} placeholder={placeholder} onChange={(e) => onRename(item.id, e.target.value)} aria-label={`${placeholder} ${i + 1}`} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.name}`}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {pasteMode ? (
        <div className="stack">
          <textarea className="input" placeholder={'One name per line'} value={pasteText} onChange={(e) => setPasteText(e.target.value)} autoFocus />
          <div className="row">
            <button type="button" className="btn btn-primary grow" onClick={addPasted}>
              Add all
            </button>
            <button type="button" className="btn" onClick={() => setPasteMode(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <input
            className="input grow"
            placeholder={`Add ${placeholder.toLowerCase()}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addDraft()
              }
            }}
          />
          <button type="button" className="btn" onClick={addDraft} disabled={!draft.trim()}>
            Add
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setPasteMode(true)} title="Paste a list">
            📋
          </button>
        </div>
      )}
    </div>
  )
}
