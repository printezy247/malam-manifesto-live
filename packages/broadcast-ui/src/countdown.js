/**
 * Recompute from the deadline on each render; never decrement stored ticks.
 * @param {number} deadlineMs
 * @param {number} nowMs
 */
export function remainingSeconds(deadlineMs, nowMs) {
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) {
    throw new TypeError('Countdown times must be finite');
  }
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}
