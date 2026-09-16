/** Bucketed condition of an `AssetEntity`, derived from its 0-100 `healthIndex` (see AssetHealthService). */
export enum AssetHealthStatus {
  /** healthIndex >= 80. */
  HEALTHY = 'HEALTHY',
  /** healthIndex >= 50. */
  WARNING = 'WARNING',
  /** healthIndex < 50. */
  CRITICAL = 'CRITICAL',
  /** No device nodes attached yet — nothing to compute a score from. */
  UNKNOWN = 'UNKNOWN',
}
