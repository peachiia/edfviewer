import { useEffect, useState } from 'react'
import pkg from '../../package.json'
import './settings.css'

export type Theme = 'dark' | 'light'
type Tab = 'appearance' | 'help' | 'about'

interface Props {
  theme: Theme
  onTheme: (t: Theme) => void
  onClose: () => void
}

const KEYS: [string, string][] = [
  ['← / →', 'Step back / forward (by the Step size)'],
  ['PgUp / PgDn', 'Move one full window back / forward'],
  ['Home / End', 'Jump to the start / end of the recording'],
  ['↑ / ↓', 'More / less sensitive (µV per row)'],
]

const MOUSE: [string, string][] = [
  ['Mouse wheel', 'Pan through time'],
  ['Ctrl + wheel', 'Zoom the window (1–60 s)'],
  ['Drag on the EEG view', 'Select a zone (goes to the armed slot, A by default)'],
  ['Shift + drag', 'Select Zone B'],
  ['Drag a zone edge', 'Adjust the zone; start/end can also be typed in the toolbar'],
  ['Click the minimap', 'Jump to that position'],
  ['Double-click a channel name', 'Rename it (used in the PSD picker and band table too)'],
  ['Click a trigger in the list', 'Jump to it'],
  ['Panel button (toolbar)', 'Hide / show the Triggers and Channels side panel'],
  ['Drop a file anywhere', 'Open an EDF / BDF file'],
]

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <table className="help-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">
              <kbd>{k}</kbd>
            </th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SettingsDialog({ theme, onTheme, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('appearance')

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const tabs: [Tab, string][] = [
    ['appearance', 'Appearance'],
    ['help', 'Help'],
    ['about', 'About'],
  ]

  return (
    <div className="settings-backdrop" onMouseDown={onClose}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <h2>Settings</h2>
          <button className="small" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </header>
        <nav role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'active' : ''}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="settings-body">
          {tab === 'appearance' && (
            <section>
              <h3>Theme</h3>
              <div className="theme-choices">
                {(['dark', 'light'] as const).map((t) => (
                  <button
                    key={t}
                    className={`theme-card ${t} ${theme === t ? 'selected' : ''}`}
                    aria-pressed={theme === t}
                    onClick={() => onTheme(t)}
                  >
                    <span className="swatch" data-theme-preview={t}>
                      <i />
                      <i />
                      <i />
                    </span>
                    {t === 'dark' ? 'Dark' : 'Light'}
                  </button>
                ))}
              </div>
              <p className="muted">Your choice is remembered in this browser.</p>
            </section>
          )}

          {tab === 'help' && (
            <section>
              <h3>Keyboard</h3>
              <Rows rows={KEYS} />
              <h3>Mouse</h3>
              <Rows rows={MOUSE} />
              <h3>Tips</h3>
              <ul>
                <li>
                  <strong>Window</strong> is how many seconds are visible; <strong>Step</strong> is how far the arrows
                  move (defaults to the window length).
                </li>
                <li>
                  <strong>Auto</strong> scales to the current window; use the Channels tab for per-channel scale or to
                  hide a channel.
                </li>
                <li>
                  <strong>Filters</strong> are zero-phase Butterworth, applied to the whole channel. Type a cutoff or use
                  the arrows; changes apply immediately. The PSD uses the filtered signal.
                </li>
                <li>
                  <strong>PSD</strong>: pick zone A (and B) on the EEG view, choose a channel, and compare side by side
                  or overlaid. Zones shorter than ~2 s give a poor spectrum.
                </li>
                <li>Triggers come from EDF+/BDF+ annotations and the BioSemi Status channel.</li>
                <li>EDF+D (discontinuous) files are not supported.</li>
              </ul>
            </section>
          )}

          {tab === 'about' && (
            <section>
              <h3>EDF Viewer</h3>
              <p>
                A browser-only viewer for EDF/BDF biosignal recordings, built for inspecting EEG: scroll through the
                signal, filter it, mark triggers, and compare the power spectrum of two time zones (for example eyes
                open vs eyes closed).
              </p>
              <p>
                <strong>Private by design:</strong> files are read and processed in your browser and are never uploaded.
              </p>
              <p>
                Developed by{' '}
                <a href="https://github.com/peachiia" target="_blank" rel="noreferrer">
                  @peachiia
                </a>
                .{' '}
                <a href="https://github.com/peachiia/edfviewer" target="_blank" rel="noreferrer">
                  Source on GitHub
                </a>
              </p>
              <p className="muted">Version {pkg.version} · MIT License</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
