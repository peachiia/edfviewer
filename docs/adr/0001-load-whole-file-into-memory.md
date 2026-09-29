# 0001 — Load the whole file into memory

**Status:** accepted

## Context

Recordings from the target device (8-channel EEG) are small. Streaming with `File.slice()` adds complexity to rendering, filtering, and PSD, all of which want random access to full channels.

## Decision

Read the whole file into an `ArrayBuffer` and decode every channel to a typed array up front. Show "Decoding…", then any errors/warnings, then the chart. Warn above ~1 GB.

The parser and DSP sit behind an interface that does not assume in-memory data, so lazy `File.slice()` loading can replace it later without touching the UI.

## Consequences

- Simple, fast random access for the renderer, filters, and Welch.
- Very large files can exhaust memory; mitigated only by the warning in v1.
- Lazy loading is deferred (see issue #1, out of scope).
