import { Level } from 'level'
import { processors } from './processor/index.mjs'
import { runTasks } from './lib/task-queue.mjs'

export async function scrape (opts = {}) {
  let { state, signal, ...rest } = opts
  if (!signal) {
    signal = (new AbortController()).signal
  }
  const db = new Level(state ?? 'state')
  if (opts.clear) {
    await db.clear()
  }
  await runTasks({
    db,
    blessedFile: './blessed.json',
    outFolder: './out',
    concurrency: 10,
    maxRetries: 2,
    signal,
    ...rest,
    processors,
    extendAPI (db, api) {
      return {
        ...api,
        package: db.sublevel('package', { valueEncoding: 'json' }),
        repo: db.sublevel('repo', { valueEncoding: 'json' }),
        packageVersion: db.sublevel('package-version', { valueEncoding: 'json' })
      }
    },
    log (...args) {
      console.log('[SCRAPER]', ...args)
    }
  })
}
