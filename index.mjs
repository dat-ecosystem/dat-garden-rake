import { Level } from 'level'
import { processors } from './processor/index.mjs'
import { runTasks } from './lib/task-queue.mjs'

export async function scrape (opts = {}) {
  let { state, signal, ...rest } = opts
  if (!signal) {
    signal = (new AbortController()).signal
  }
  const log = (...args) => {
    console.log('[SCRAPER]', ...args)
  }
  const db = new Level(state ?? 'state')
  if (opts.reset) {
    log('DELETING ALL STATE DATA')
    await db.clear()
    log('deleted.')
  } else if (opts.restart) {
    log('Clearing tasks and meta information')
    await db.sublevel('tasks').clear()
    await db.sublevel('meta').clear()
    await db.sublevel('task-for-resource').clear()
    log('cleared.')
  }
  await runTasks({
    db,
    blessedFile: './blessed.json',
    outFolder: './out',
    concurrency: 10,
    maxRetries: 2,
    maxDepth: 5,
    signal,
    ...rest,
    processors,
    extendAPI (db, api) {
      return {
        ...api,
        package: db.sublevel('package', { valueEncoding: 'json' }),
        repo: db.sublevel('repo', { valueEncoding: 'json' }),
        people: db.sublevel('people', { valueEncoding: 'json' }),
        packageVersion: db.sublevel('package-version', { valueEncoding: 'json' })
      }
    },
    log
  })
}
