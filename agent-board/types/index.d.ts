/** One agent as the board draws it. */
export type AgentLine = {
  id: string
  type: string
  description: string
  /** First line of the agent's latest progress summary; empty before it reports any. */
  doing: string
  state: 'active' | 'done' | 'failed'
  /** Whole seconds since it started. */
  seconds: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-board': { agents: AgentLine[] }
  }
}
