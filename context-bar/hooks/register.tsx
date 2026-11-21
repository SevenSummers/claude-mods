import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { ContextFill, UsageLimit } from '../types'

const fill = atom({ plugin: 'context-bar', key: 'fill' } as const, null)
const limits = atom({ plugin: 'context-bar', key: 'limits' } as const, [])

/** Fill levels at which a meter turns amber, then red. */
const WARN_PERCENT = 60
const DANGER_PERCENT = 80

/** Terminal segment glyphs: a lit cell and an unlit one. */
const LIT = '▰'
const UNLIT = '▱'
const MIN_SEGMENTS = 6
const MAX_SEGMENTS = 16
/** Columns a meter takes besides its segments: label, gaps, percentage, reset countdown. */
const METER_CHROME = 18
/** Least room kept between two meters, in columns. */
const METER_GAP = 3

/**
 * Drawn segments on the editor and app surfaces: identical slanted cells, lit ones
 * filled and unlit ones outlined, so both share one shape, size and baseline.
 * Sizes are CSS pixels; colours are fixed because an SVG image cannot read the theme.
 */
const CELL_WIDTH = 6
const CELL_HEIGHT = 10
const CELL_SLANT = 3
const CELL_GAP = 2
const COLORS = { success: '#3fb950', warning: '#d29922', error: '#f85149', unlit: '#8b949e', pace: '#58a6ff' } as const
/** Extra room opened in the gap that holds the pacing marker, so it never touches a cell. */
const MARKER_ROOM = 4
/** Terminal pacing glyph, set between two cells. */
const PACE_GLYPH = '┃'

/** Length of each time-boxed usage window, for the pacing marker. */
const WINDOW_MS: Record<string, number> = { five_hour: 5 * 60 * 60_000, seven_day: 7 * 24 * 60 * 60_000 }

/** Short retro labels for each window, in display order. */
const LABELS: Record<string, string> = { context: 'CTX', five_hour: '5H', seven_day: '7D', spend_limit: 'SPD' }
const ORDER = ['context', 'five_hour', 'seven_day', 'spend_limit']

/** Redraw often enough to keep the reset countdowns current. */
const COUNTDOWN_REFRESH_MS = 60_000

type Meter = {
  kind: string
  percent: number
  detail: string
  /** Share of the window's time already gone, 0 to 1: where even-paced usage would be now. */
  pace?: number
}

function toFill(context: SessionContextUsage): ContextFill | null {
  if (context.tokens === undefined || context.percent === undefined) {
    return null
  }

  return { tokens: context.tokens, window: context.window, percent: context.percent }
}

function toLimits(rateLimits: SessionRateLimit[]): UsageLimit[] {
  return rateLimits.map(limit => {
    const resetsAt = limit.resetsAt === undefined ? Number.NaN : Date.parse(limit.resetsAt)

    return Number.isNaN(resetsAt)
      ? { kind: limit.kind, percent: limit.percentUsed }
      : { kind: limit.kind, percent: limit.percentUsed, resetsAt }
  })
}

async function refresh($: EngineInterface) {
  const usage = await $.session.usage()
  await update($, fill, () => toFill(usage.context))
  await update($, limits, () => toLimits(usage.rateLimits))
}

function tokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(count % 1_000_000 === 0 ? 0 : 1)}M`
  }

  return `${Math.round(count / 1000)}k`
}

/** Time until a reset, as compactly as a meter's tail allows: 45m, 2h14m, 3d4h. */
function countdown(resetsAt: number, now: number): string {
  const minutes = Math.max(0, Math.round((resetsAt - now) / 60_000))

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    return `${hours}h${String(minutes % 60).padStart(2, '0')}m`
  }

  return `${Math.floor(hours / 24)}d${hours % 24}h`
}

/** Where even-paced usage of a window would be now, 0 to 1; undefined for a window with no clock. */
function paceOf(kind: string, resetsAt: number | undefined, now: number): number | undefined {
  const length = WINDOW_MS[kind]

  if (length === undefined || resetsAt === undefined) {
    return undefined
  }

  return Math.min(1, Math.max(0, 1 - (resetsAt - now) / length))
}

/**
 * A row of slanted cells, the first `lit` filled in `color`, the rest outlined. A pacing
 * marker, when given, is a slanted line of the cells' own angle and height, set in a
 * widened gap before cell `paceCell` so it never covers a cell.
 */
function meterSvg(segments: number, lit: number, color: string, paceCell: number | undefined): { source: string; width: number } {
  const pitch = CELL_WIDTH + CELL_GAP
  const room = paceCell === undefined ? 0 : MARKER_ROOM
  const width = segments * pitch - CELL_GAP + CELL_SLANT + 1 + room + (paceCell === 0 || paceCell === segments ? CELL_GAP : 0)
  const top = 0.5
  const bottom = CELL_HEIGHT - 0.5
  // A marker at the very start pushes every cell right by its gap and room.
  const lead = paceCell === 0 ? CELL_GAP + room : 0
  const parts: string[] = []

  for (let i = 0; i < segments; i++) {
    // Cells after the marker move right to open its gap. Inset by half a pixel so
    // outlines stay crisp and the same size as the fills.
    const x = i * pitch + 0.5 + lead + (paceCell !== undefined && paceCell > 0 && i >= paceCell ? room : 0)
    const points = `${x + CELL_SLANT},${top} ${x + CELL_SLANT + CELL_WIDTH},${top} ${x + CELL_WIDTH},${bottom} ${x},${bottom}`
    parts.push(
      i < lit
        ? `<polygon points="${points}" fill="${color}" stroke="${color}" stroke-width="1"/>`
        : `<polygon points="${points}" fill="none" stroke="${COLORS.unlit}" stroke-opacity="0.7" stroke-width="1"/>`,
    )
  }

  if (paceCell !== undefined) {
    // The middle of the marker's gap along the cells' bottom edge; the top leans by the same slant.
    const gapStart = paceCell === 0 ? 0 : paceCell * pitch - CELL_GAP + 0.5
    const x = gapStart + (CELL_GAP + room) / 2
    parts.push(
      `<line x1="${(x + CELL_SLANT).toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${bottom}" stroke="${COLORS.pace}" stroke-width="2" stroke-linecap="round"/>`,
    )
  }

  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CELL_HEIGHT}" viewBox="0 0 ${width} ${CELL_HEIGHT}">${parts.join('')}</svg>`,
    width,
  }
}

type GlyphRun = { part: 'lit' | 'unlit'; count: number } | { part: 'pace' }

/** The terminal meter as runs of lit and unlit cells, the pacing glyph set before cell `paceCell`. */
function glyphRuns(lit: number, segments: number, paceCell: number | undefined): GlyphRun[] {
  const runs: GlyphRun[] = []
  const push = (part: 'lit' | 'unlit', from: number, to: number) => {
    if (to > from) {
      runs.push({ part, count: to - from })
    }
  }
  if (paceCell === undefined) {
    push('lit', 0, lit)
    push('unlit', lit, segments)
  } else if (paceCell <= lit) {
    // Usage is at or past even pace: the marker sits inside the lit cells.
    push('lit', 0, paceCell)
    runs.push({ part: 'pace' })
    push('lit', paceCell, lit)
    push('unlit', lit, segments)
  } else {
    push('lit', 0, lit)
    push('unlit', lit, paceCell)
    runs.push({ part: 'pace' })
    push('unlit', paceCell, segments)
  }

  return runs
}

function levelColor(percent: number): 'success' | 'warning' | 'error' {
  return percent >= DANGER_PERCENT ? 'error' : percent >= WARN_PERCENT ? 'warning' : 'success'
}

export const register: Register = on => {
  // Seed from the current reading so a reload or resumed session shows the meters at once,
  // and keep the reset countdowns ticking between turns.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    $.clock.every(COUNTDOWN_REFRESH_MS, () => $.ui.invalidate('ui.render'))

    return result
  })

  // The engine pushes a measurement after each main-thread turn and when a usage window moves.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, fill, () => toFill(e.context))
    }

    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => toLimits(e.rateLimits))
    }

    return next(e)
  })

  // A compaction or /clear empties the window until the next response reports.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    await refresh($)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const context = await read($, fill)
    const windows = await read($, limits)

    if (e.props.hasSurvey || (context === null && windows.length === 0)) {
      return next(e)
    }

    const now = await $.clock.now()
    const meters: Meter[] = []

    if (context !== null) {
      meters.push({ kind: 'context', percent: context.percent, detail: `${tokens(context.tokens)}/${tokens(context.window)}` })
    }

    for (const limit of windows) {
      meters.push({
        kind: limit.kind,
        percent: limit.percent,
        detail: limit.resetsAt === undefined ? '' : `↻${countdown(limit.resetsAt, now)}`,
        pace: paceOf(limit.kind, limit.resetsAt, now),
      })
    }

    meters.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))

    // Size the segments so every meter shares one row; a narrow panel wraps them instead.
    const perMeter = (e.props.bodyColumns - METER_GAP * (meters.length - 1)) / meters.length
    const segments = Math.min(MAX_SEGMENTS, Math.max(MIN_SEGMENTS, Math.floor(perMeter - METER_CHROME)))
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    // The terminal has no Svg element; it draws the meters as text glyphs instead.
    const Svg = 'Svg' in ui ? ui.Svg : undefined

    // space-between spreads the meters evenly: the first at the left edge, the last at the right.
    return (
      <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between" alignItems="center" columnGap={METER_GAP} width="100%">
        {meters.map(meter => {
          const percent = Math.max(0, meter.percent)
          const lit = Math.min(segments, Math.round((segments * Math.min(100, percent)) / 100))
          const color = levelColor(percent)
          const label = LABELS[meter.kind] ?? meter.kind.slice(0, 3).toUpperCase()
          // The marker snaps to the nearest gap between cells.
          const paceCell = meter.pace === undefined ? undefined : Math.round(meter.pace * segments)
          const bar = meterSvg(segments, lit, COLORS[color], paceCell)
          const paceText = meter.pace === undefined ? '' : `, even pace ${Math.round(meter.pace * 100)} percent`

          return (
            <Box key={meter.kind} flexDirection="row" alignItems="center" gap={1}>
              <Text mono bold color="claude">
                {label}
              </Text>
              {Svg === undefined ? (
                <Text mono>
                  {glyphRuns(lit, segments, paceCell).map((run, i) =>
                    run.part === 'pace' ? (
                      <Text key={`r${i}`} color="suggestion" bold>
                        {PACE_GLYPH}
                      </Text>
                    ) : run.part === 'lit' ? (
                      <Text key={`r${i}`} color={color}>
                        {LIT.repeat(run.count)}
                      </Text>
                    ) : (
                      <Text key={`r${i}`} dimColor>
                        {UNLIT.repeat(run.count)}
                      </Text>
                    ),
                  )}
                </Text>
              ) : (
                <Svg source={bar.source} alt={`${label} ${Math.round(percent)} percent used${paceText}`} width={bar.width} height={CELL_HEIGHT} />
              )}
              <Text mono tabular bold color={color}>
                {`${Math.round(percent)}%`}
              </Text>
              {meter.detail === '' ? null : (
                <Text mono tabular dimColor>
                  {meter.detail}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
    )
  })
}
