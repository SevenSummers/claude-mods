import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register } from 'claude-code'

import type { AgentLine } from '../types'

const agents = atom({ plugin: 'agent-board', key: 'agents' } as const, [])

const POLL_MS = 2000
/** How long a finished agent stays on the board with its tick or cross. */
const LINGER_MS = 15_000
const MAX_ROWS = 6

const ACTIVE = new Set(['pending', 'running', 'waiting', 'idle'])
const FAILED = new Set(['failed', 'killed'])

function firstLine(text: string): string {
  return text.split('\n').find(line => line.trim() !== '')?.trim() ?? ''
}

function elapsed(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }

  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

// When each agent was first seen finished, so it can linger briefly then leave.
const finishedAt = new Map<string, number>()

function toLine(agent: AgentInfo, now: number): AgentLine {
  const state = ACTIVE.has(agent.status) ? 'active' : FAILED.has(agent.status) ? 'failed' : 'done'
  const summary = firstLine(agent.label)

  return {
    id: agent.id,
    type: agent.type,
    description: agent.description,
    // Empty until the agent reports progress beyond its own description.
    doing: summary === agent.description ? '' : summary,
    state,
    seconds: Math.max(0, Math.round((now - agent.startTime) / 1000)),
  }
}

async function refresh($: EngineInterface) {
  const now = await $.clock.now()
  const lines: AgentLine[] = []

  for (const agent of await $.agent.list()) {
    const line = toLine(agent, now)

    if (line.state === 'active') {
      finishedAt.delete(agent.id)
      lines.push(line)
      continue
    }

    const at = finishedAt.get(agent.id) ?? now
    finishedAt.set(agent.id, at)

    if (now - at < LINGER_MS) {
      lines.push(line)
    }
  }

  const previous = await read($, agents)

  if (JSON.stringify(previous) !== JSON.stringify(lines)) {
    await update($, agents, () => lines)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    $.clock.every(POLL_MS, () => refresh($))

    return result
  })

  // Show a new agent straight away rather than on the next poll.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    await refresh($)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const lines = await read($, agents)

    if (e.props.hasSurvey || lines.length === 0) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const running = lines.filter(line => line.state === 'active').length
    const shown = lines.slice(0, MAX_ROWS)
    const hidden = lines.length - shown.length

    return (
      <Box flexDirection="column">
        <Text bold color="claude">
          {running === 0 ? 'Agents finished' : `${running} agent${running === 1 ? '' : 's'} running`}
        </Text>
        {shown.map(line => {
          const mark = line.state === 'active' ? '●' : line.state === 'failed' ? '✗' : '✓'
          const markColor = line.state === 'active' ? 'claude' : line.state === 'failed' ? 'error' : 'success'
          const isDone = line.state !== 'active'

          return (
            <Box key={line.id} flexDirection="row" gap={1}>
              <Text color={markColor}>{mark}</Text>
              <Text bold dimColor={isDone}>
                {line.type}
              </Text>
              <Text dimColor wrap="truncate-end">
                {line.description}
              </Text>
              <Box flexGrow={1} flexShrink={1}>
                {line.doing === '' ? null : (
                  <Text dimColor={isDone} wrap="truncate-end">
                    · {line.doing}
                  </Text>
                )}
              </Box>
              <Text dimColor tabular>
                {elapsed(line.seconds)}
              </Text>
            </Box>
          )
        })}
        {hidden > 0 ? <Text dimColor>+{hidden} more</Text> : null}
      </Box>
    )
  })
}
