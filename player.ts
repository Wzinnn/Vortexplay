export function clampPlaybackPosition(current: number, delta: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  return Math.max(0, Math.min(duration, safeCurrent + safeDelta));
}

export function progressToPlaybackPosition(ratio: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const safeRatio = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  return safeRatio * duration;
}

export function millisecondsToPlaybackSeconds(milliseconds: number): number {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 0;
  return milliseconds / 1000;
}

export function validPlaybackDuration(...candidates: Array<number | undefined | null>): number {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) return candidate;
  }
  return 0;
}

export function shouldAcceptPlaybackTime(
  reportedSeconds: number,
  requestedSeconds: number | null,
  tolerance = 1.5,
): boolean {
  if (requestedSeconds === null) return true;
  if (!Number.isFinite(reportedSeconds) || reportedSeconds < 0) return false;
  return Math.abs(reportedSeconds - requestedSeconds) <= tolerance;
}

export function clearPlaybackSeekIfReached(
  reportedSeconds: number,
  requestedSeconds: number | null,
  tolerance = 1.5,
): number | null {
  return requestedSeconds !== null && shouldAcceptPlaybackTime(reportedSeconds, requestedSeconds, tolerance)
    ? null
    : requestedSeconds;
}
