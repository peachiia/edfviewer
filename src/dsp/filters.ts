import { designButterworth, designNotch, type Sos } from './butterworth';
import { filtfilt, type FloatArray } from './filtfilt';

export interface PassSettings {
  enabled: boolean;
  freq: number; // Hz
  order: number; // 2-8
}

export interface NotchSettings {
  enabled: boolean;
  freq: number; // Hz (50 or 60 typically)
  q: number;
}

export interface FilterSettings {
  /** Master switch. */
  enabled: boolean;
  highpass: PassSettings;
  lowpass: PassSettings;
  notch: NotchSettings;
}

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  enabled: false,
  highpass: { enabled: true, freq: 0.5, order: 4 },
  lowpass: { enabled: true, freq: 40, order: 4 },
  notch: { enabled: false, freq: 50, q: 30 },
};

/** Whether a filter stage of the given frequency is realisable at this sampling rate. */
function usable(freq: number, fs: number): boolean {
  return freq > 0 && freq < fs / 2;
}

/**
 * Apply the enabled HP/LP/notch stages (zero-phase, whole channel) at sampling rate `fs`.
 * Stages whose frequency is at or above Nyquist for this channel are skipped (channels
 * can have different rates). When the master switch is off or no stage applies, the
 * input array itself is returned (no copy); otherwise a new array of the same type.
 */
export function applyFilters<T extends FloatArray>(x: T, fs: number, settings: FilterSettings): T {
  if (!settings.enabled) return x;
  const sos: Sos = [];
  const { highpass, lowpass, notch } = settings;
  if (highpass.enabled && usable(highpass.freq, fs)) sos.push(...designButterworth('highpass', highpass.order, highpass.freq, fs));
  if (lowpass.enabled && usable(lowpass.freq, fs)) sos.push(...designButterworth('lowpass', lowpass.order, lowpass.freq, fs));
  if (notch.enabled && usable(notch.freq, fs)) sos.push(...designNotch(notch.freq, notch.q, fs));
  if (sos.length === 0) return x;

  // Pad long enough to cover the slowest transient (~3 periods of the highpass cutoff).
  const padlen = highpass.enabled && usable(highpass.freq, fs) ? Math.ceil((3 * fs) / highpass.freq) : undefined;
  return filtfilt(sos, x, { padlen }) as T;
}
