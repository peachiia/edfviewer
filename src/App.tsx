export default function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>🧠 EDF Viewer</h1>
      <p>Fast, zero-install browser-based viewer for EEG and biosignal data.</p>
      <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '8px' }}>
        <h2>Status: Development</h2>
        <p>Running on port 8401 for tunnel testing</p>
        <p>Drag and drop .edf or .bdf files to analyze biosignal data.</p>
      </div>
    </div>
  )
}
