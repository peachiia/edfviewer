import { useCallback, useEffect, useRef, useState } from 'react'
import { EdfParseError, loadRecording, type Recording } from './parser/parse'
import { ZonePsdViewer } from './psd/ZonePsdViewer'
import { FiltersMenu, maxFilterFreq, useFilteredData, useFilterSettings } from './filters'

type Theme = 'dark' | 'light'
interface Loaded {
  name: string
  rec: Recording
  id: number
}

const WARN_BYTES = 1e9

function initialTheme(): Theme {
  try {
    const t = localStorage.getItem('edfviewer.theme')
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* storage unavailable */
  }
  return 'dark'
}

const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)))

export default function App() {
  const [current, setCurrent] = useState<Loaded | null>(null)
  const [loadingName, setLoadingName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const { settings: filterSettings, setSettings: setFilterSettings } = useFilterSettings()
  const filtered = useFilteredData(current?.rec ?? null, filterSettings)
  const fileInput = useRef<HTMLInputElement>(null)
  const idRef = useRef(0)
  const dragDepth = useRef(0)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('edfviewer.theme', theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  const load = useCallback(async (source: Blob, name: string) => {
    if (source.size > WARN_BYTES) {
      const gb = (source.size / 1e9).toFixed(1)
      const ok = window.confirm(
        `${name} is ${gb} GB. The whole file is decoded in memory, which may be slow or fail in this browser. Continue?`,
      )
      if (!ok) return
    }
    setError(null)
    setWarnings([])
    setLoadingName(name)
    await nextPaint() // let "Decoding…" render before the synchronous decode
    try {
      const rec = await loadRecording(source)
      setWarnings(rec.warnings)
      setCurrent({ name, rec, id: ++idRef.current })
    } catch (e) {
      setError(
        e instanceof EdfParseError
          ? e.message
          : `Could not read ${name}: ${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      setLoadingName(null)
    }
  }, [])

  const openFile = (f: File | undefined | null) => {
    if (f) void load(f, f.name)
  }

  // page-wide drag and drop
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current++
      setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      openFile(e.dataTransfer?.files[0])
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  const openDialog = () => fileInput.current?.click()
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  const loadDemo = import.meta.env.DEV
    ? async () => {
        const { buildDemoEdf } = await import('./viewer/demo')
        await load(new Blob([buildDemoEdf()]), 'demo.edf')
      }
    : undefined

  return (
    <div className="app">
      <input
        ref={fileInput}
        type="file"
        accept=".edf,.bdf,.EDF,.BDF"
        hidden
        onChange={(e) => {
          openFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {(error || warnings.length > 0) && (
        <div className="messages">
          {error && (
            <div className="msg error" role="alert">
              <span>{error}</span>
              <button className="small" onClick={() => setError(null)}>
                Dismiss
              </button>
            </div>
          )}
          {warnings.map((w, i) => (
            <div className="msg warn" key={i}>
              <span>Warning: {w}</span>
              <button className="small" onClick={() => setWarnings((ws) => ws.filter((_, j) => j !== i))}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {loadingName === null && current ? (
        <ZonePsdViewer
          key={current.id}
          recording={current.rec}
          fileName={current.name}
          onOpen={openDialog}
          theme={theme}
          onToggleTheme={toggleTheme}
          source={filtered}
          filtersUi={
            <FiltersMenu
              settings={filterSettings}
              onChange={setFilterSettings}
              maxFreq={maxFilterFreq(current.rec.channels)}
              label={filtered.label}
              pending={filtered.pending}
            />
          }
        />
      ) : (
        <div className="empty">
          <button className="drop-target" onClick={openDialog} disabled={loadingName !== null}>
            {loadingName !== null ? (
              <>
                <span className="big">Decoding…</span>
                <span className="muted">{loadingName}</span>
              </>
            ) : (
              <>
                <span className="big">Drop an EDF or BDF file here</span>
                <span className="muted">or click to open one. Everything stays in your browser.</span>
              </>
            )}
          </button>
          {loadDemo && loadingName === null && (
            <button className="small" onClick={() => void loadDemo()}>
              Load demo (dev only)
            </button>
          )}
          <button className="small theme-corner" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      )}

      {dragging && <div className="drop-overlay">Drop to open</div>}
    </div>
  )
}
