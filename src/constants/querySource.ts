/**
 * Query origin used for routing and telemetry. Custom hook config.name is passed
 * through directly, so this is intentionally an open string rather than a
 * closed enumeration of built-in sources.
 */
export type QuerySource = string
