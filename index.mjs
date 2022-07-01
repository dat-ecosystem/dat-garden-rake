import { Level } from 'level'
import { processors } from './processor/index.mjs'
import { runTasks } from './lib/task-queue.mjs'

export async function scrape (opts = {}) {
  let { state, cache, signal, ...rest } = opts
  if (!signal) {
    signal = (new AbortController()).signal
  }
  const log = (...args) => {
    if (opts.quiet) {
      process.stdout.write('.')
    }
    // console.log('[SCRAPER]', ...args)
  }
  const cacheDb = new Level(cache ?? 'cache')
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
  } else if (opts.retry) {
    log('Removing error state from tasks')
    const batch = []
    const tasks = db.sublevel('tasks', { valueEncoding: 'json' })
    for await (const [key, task] of tasks.iterator()) {
      if (task.errors) {
        delete task.errors
        batch.push({ type: 'put', sublevel: tasks, key, value: task })
      }
    }
    await db.batch(batch)
    log('all tasks error free')
  }
  if (!opts.token?.gitlab) {
    throw new Error('Gitlab token missing! Did you set the GITLAB_TOKEN environment variable?')
  }
  if (!opts.token?.github) {
    throw new Error('Github token missing! Did you set the GITLAB_TOKEN environment variable?')
  }
  const outModes = ['history', 'override']
  if (!outModes.includes(opts.outMode)) {
    throw new Error(`Unsupported --out-mode=${opts.outMode}, suppoorted modes are: ${outModes.join(', ')}`)
  }
  await runTasks({
    db,
    cacheDb,
    preferCache: false,
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
        packages: db.sublevel('packages', { valueEncoding: 'json' }),
        repos: db.sublevel('repos', { valueEncoding: 'json' }),
        people: db.sublevel('people', { valueEncoding: 'json' })
      }
    },
    log
  })
}
