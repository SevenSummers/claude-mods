import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage } from 'claude-code'

import type { ContextFill } from '../types'

const fill = atom({ plugin: 'context-bar', key: 'fill' } as const, null)

/** Fill levels at which the bar turns amber, then red. */
const WARN_PERCENT = 60
const DANGER_PERCENT = 80
const LABEL_COLUMNS = 34

function toFill(context: SessionContextUsage): ContextFill | null {
  if (context.tokens === undefined || context.percent === undefined) {
    return null
  }

  return { tokens: context.tokens, window: context.window, percent: context.percent }
}

function compact(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`
  }

  return `${Math.round(tokens / 1000)}k`
}

export const register: Register = on => {
  // Seed from the current reading so a reload or resumed session shows the bar at once.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const { context } = await $.session.usage()
    await update($, fill, () => toFill(context))

    return result
  })

  // The engine pushes a measurement after each main-thread turn.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, fill, () => toFill(e.context))
    }

    return next(e)
  })

  // A compaction or /clear empties the window until the next response reports.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    const { context } = await $.session.usage()
    await update($, fill, () => toFill(context))

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, fill)

    if (e.props.hasSurvey || current === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const percent = Math.min(100, Math.max(0, current.percent))
    const color = percent >= DANGER_PERCENT ? 'error' : percent >= WARN_PERCENT ? 'warning' : 'success'
    const barColumns = Math.max(10, e.props.bodyColumns - LABEL_COLUMNS)
    const filled = Math.round((barColumns * percent) / 100)
    const hint = percent >= DANGER_PERCENT ? ' · consider a fresh session' : ''

    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text dimColor>Context</Text>
        <Box flexDirection="row" width={barColumns} height={1} backgroundColor="subtle">
          <Box width={filled} height={1} backgroundColor={color} />
        </Box>
        <Text color={color} bold tabular>
          {percent}%
        </Text>
        <Text dimColor tabular wrap="truncate-end">
          {compact(current.tokens)} / {compact(current.window)}
          {hint}
        </Text>
      </Box>
    )
  })
}
