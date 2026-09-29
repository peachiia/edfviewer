# EDF Viewer — Domain Context

A browser-only viewer for EDF/BDF biosignal recordings (primarily the author's 8-channel EEG device). Everything runs client-side.

## Glossary

**Recording** — one loaded EDF/BDF file: header, channels, and decoded samples. Held entirely in memory.

**Channel** — one signal in a Recording, with its own label, unit, and sampling rate. Channels keep their native sampling rate (no resampling). Channel names are user-editable; the edited name is used everywhere (rows, PSD picker, band table).

**Signal channel** — a Channel plotted in the EEG view. *Status* and *Annotations* channels are not signal channels and are hidden from the stack.

**Raw** — decoded samples converted to physical units (µV for EEG). Never modified.

**Filtered** — Raw after the active Filter settings (HP/LP/notch), computed over the whole channel, zero-phase, cached per channel. Display and PSD both use Filtered.

**Window** — the fixed span of time visible in the EEG view (1–60 s, default 10 s).

**Step** — how far the Window moves per navigation action. Defaults to the Window length.

**Sensitivity** — global µV-per-row scale of the EEG view. A channel may override it.

**Trigger** — a marked event in a Recording. Two sources: (1) EDF+/BDF+ *annotation* TALs (onset, optional duration, text); (2) BioSemi *Status* channel — low 16 bits, a rising change is a trigger, system-flag bits ≥16 are masked. A Trigger with a duration is drawn as a shaded span.

**Zone** — a user-selected time range of the Recording used for PSD. There are at most two: **Zone A** and **Zone B** (e.g. eyes open vs eyes closed). Zones live for the session only and are not persisted per file.

**PSD** — power spectral density of a Zone on one channel: Welch, Hann window, 50% overlap, default 4 s segments, µV²/Hz, computed on Filtered signal.

**Band power** — PSD integrated over delta/theta/alpha/beta, reported absolute, relative, and as Δ(B−A).

**Minimap** — the scrollbar-like overview under the EEG view showing position, Trigger ticks, and Zone bands.

## Avoid

- "Epoch" — not a v1 concept (ERP epoching is deferred). Use **Zone**.
- "Montage" / "re-reference" — channels are shown as recorded in v1.
