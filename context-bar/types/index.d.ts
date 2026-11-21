/** The live context window's fill, as the status line reads it. */
export type ContextFill = { tokens: number; window: number; percent: number }

/** One subscription usage window (five-hour, weekly), as the status line reads it. */
export type UsageLimit = {
  /** `five_hour`, `seven_day`, or a gateway's `spend_limit`. */
  kind: string
  percent: number
  /** When the window resets, in milliseconds since the epoch. */
  resetsAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { fill: ContextFill | null; limits: UsageLimit[] }
  }
}
