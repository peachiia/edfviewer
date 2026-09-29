# EDF Viewer

A browser-only viewer for EDF/BDF biosignal recordings, built for inspecting EEG. Files are read locally in your browser and never uploaded.

> **Status:** early development. v1 is being built; see [issue #1](https://github.com/peachiia/edfviewer/issues/1) for the plan and progress.

## v1 scope

- Open EDF (16-bit), BDF (24-bit BioSemi), EDF+C and BDF+ files (EDF+D is rejected with a clear message)
- Stacked, scrollable EEG view (Canvas) with adjustable window (1–60 s), step, and µV sensitivity
- Editable channel names for files with missing labels
- Butterworth high-pass, low-pass, and 50/60 Hz notch filters (zero-phase)
- Triggers from EDF+/BDF+ annotations and the BioSemi Status channel
- Select up to two time zones and compare their PSD (Welch) side by side or overlaid, with a delta/theta/alpha/beta band-power table

## Development

```bash
npm install
npm run dev      # http://localhost:8401
npm run build
```

## Roadmap

Deferred beyond v1: montages/re-referencing, EDF+D, multi-channel PSD overlay, lazy loading for very large files, ERP epoching, export, WebGL rendering, detrending, settings import/export.

## Docs

- [`CONTEXT.md`](CONTEXT.md) — domain glossary
- [`docs/adr/`](docs/adr/) — architecture decisions

## License

MIT
