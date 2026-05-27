/**
 * Automatic pipeline scheduler.
 *
 * Fires 30 minutes after each official Pais Lotto draw:
 *   Tuesday  22:30 Israel time
 *   Saturday 22:30 Israel time
 *
 * node-cron expression: "30 22 * * 2,6"
 * Days: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
 */

import cron from 'node-cron'
import { runLatestPipeline, isPipelineRunning } from './services/drawPipelineService.js'

const SCHEDULE  = '30 22 * * 2,6'
const TIMEZONE  = 'Asia/Jerusalem'

export function startScheduler() {
  if (!cron.validate(SCHEDULE)) {
    console.error('[Scheduler] Invalid cron expression — scheduler not started')
    return
  }

  cron.schedule(SCHEDULE, async () => {
    console.log('[Scheduler] ── Scheduled pipeline triggered (Tue/Sat 22:30 IL) ──')

    if (isPipelineRunning()) {
      console.log('[Scheduler] Pipeline already running — skipped')
      return
    }

    try {
      const result = await runLatestPipeline('scheduler')
      console.log(
        `[Scheduler] Pipeline complete` +
        `  drawId=${result.drawId}` +
        `  winnings=₪${result.winnings}` +
        `  error=${result.error ?? 'none'}` +
        `  durationMs=${result.durationMs}`
      )
    } catch (err) {
      console.error('[Scheduler] Unhandled error:', err.message)
    }
  }, { timezone: TIMEZONE })

  console.log(`[Scheduler] Started — fires ${SCHEDULE} (${TIMEZONE})`)
}
