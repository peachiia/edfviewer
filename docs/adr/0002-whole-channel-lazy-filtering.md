# 0002 — Whole-channel lazy filtering, cached per channel

**Status:** accepted

## Context

Zero-phase (forward-backward) Butterworth filtering has edge transients and is not naturally windowed. Filtering only the visible Window would show edge artifacts and change as the user scrolls; PSD over a Zone needs the same filtered signal as the display.

## Decision

Filter a whole channel at once (Butterworth SOS, forward-backward), lazily — only for displayed channels and the PSD channel — in a Web Worker. Cache the result per channel and invalidate all caches on any filter-setting change. Raw data is never modified. The status label always shows the active filters.

## Consequences

- Display and PSD are consistent and free of per-window edge artifacts.
- First display after a settings change pays a whole-channel cost, off the main thread.
- Memory: one extra Float32/Float64 array per filtered channel.
