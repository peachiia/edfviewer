# EDF Viewer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Privacy: 100% client-side](https://img.shields.io/badge/Privacy-100%25%20client--side-green.svg)](#privacy)

A browser-only viewer for EDF/BDF biosignal recordings, built for inspecting EEG. Scroll through a recording, filter it, see triggers, and compare the power spectrum of two time zones (for example eyes open vs eyes closed).

**Live: [edfviewer.peachiia.com](https://edfviewer.peachiia.com)** · Developed by [@peachiia](https://github.com/peachiia)

## Features

- **Formats:** EDF (16-bit), BDF (24-bit BioSemi), EDF+C and BDF+. EDF+D is rejected with a clear message. Per-channel sampling rates are kept as recorded; units are converted to µV.
- **Viewer:** stacked, scrollable Canvas view. Adjustable window (1–60 s), step and µV sensitivity, auto-scale, per-channel hide/scale, editable channel names, and a minimap.
- **Filters:** Butterworth high-pass, low-pass (orders 2–8) and 50/60 Hz notch, zero-phase, applied to the whole channel in a Web Worker. Raw data is never modified.
- **Triggers:** from EDF+/BDF+ annotations and the BioSemi Status channel, shown as markers, on the minimap, and in a clickable list.
- **Zones and PSD:** select Zone A and Zone B on the signal, then compare their Welch PSD side by side or overlaid, with delta/theta/alpha/beta band shading and an absolute / relative / Δ(B−A) band-power table.
- **Settings:** light/dark theme, in-app help, and about. Your preferences are remembered in the browser (`localStorage`).

## Controls

| Input | Action |
| --- | --- |
| `←` / `→` | Step back / forward |
| `PgUp` / `PgDn` | Move one full window |
| `Home` / `End` | Start / end of the recording |
| `↑` / `↓` | More / less sensitive |
| Mouse wheel | Pan through time |
| `Ctrl` + wheel | Zoom the window |
| Drag on the signal | Select Zone A |
| `Shift` + drag | Select Zone B |
| Double-click a channel name | Rename it |
| `→ A` / `→ B` on a trigger | Use that trigger as a zone: its duration, or until the next trigger |
| Drop a file anywhere | Open it |

The **⚙ Settings** button has the same list, plus the theme switch and About.

## Run it locally

You need [Node.js](https://nodejs.org/) 18 or later and npm.

```bash
git clone https://github.com/peachiia/edfviewer.git
cd edfviewer
npm install
npm run dev
```

Then open <http://localhost:8401> and drop an `.edf` or `.bdf` file onto the page. In dev mode there is also a "Load demo" button that opens a synthetic recording.

Other commands:

```bash
npm test          # run the unit tests (Vitest)
npm run build     # type-check and build to ./dist
npm run preview   # serve the production build
```

`npm run dev` listens on port 8401 on all interfaces. To use another port, edit the `dev` script in `package.json` and `server.port` in `vite.config.ts`. If you serve it under your own hostname, add it to `server.allowedHosts` in `vite.config.ts`.

To host your own copy, build with `npm run build` and serve the `dist/` folder from any static host.

## Privacy

Everything runs in your browser. Files are read from disk locally and are never uploaded; there is no telemetry and no server component.

## Tech

React 18, TypeScript, Vite, a custom Canvas 2D renderer, [uPlot](https://github.com/leeoniya/uPlot) for PSD charts, and Vitest. Tests use synthetic EDF/BDF files generated in code, so no recordings are committed.

## Roadmap

Planned or deferred beyond v1: montages / re-referencing, EDF+D support, multi-channel PSD overlay, lazy loading for very large files, ERP epoching, export, WebGL rendering, detrending, and settings import/export. See [issue #1](https://github.com/peachiia/edfviewer/issues/1) for the v1 plan.

## Project docs

- [`CONTEXT.md`](CONTEXT.md): domain glossary
- [`docs/adr/`](docs/adr/): architecture decisions

## License

[MIT](LICENSE) © Pongsakorn Wechakarn
