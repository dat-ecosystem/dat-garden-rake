import PQueue from 'p-queue'
import { RateLimitError, getMaybe, waitUntil, timeRandomID, addURLToError, UnrecoverableError } from './util.mjs'
import { setMaxListeners } from 'events'

export async function runTasks (opts) {
  const { db, cacheDb, processors, concurrency, maxRetries, signal } = opts
  await Promise.all([db.open(), cacheDb.open()])
  const api = createAPI(db, cacheDb.sublevel('', { valueEncoding: 'json' }), opts)
  await maybeRestart(api)
  await maybeInit(api)
  await maybeRetry(api)
  setMaxListeners(Number.MAX_SAFE_INTEGER, signal)
  if (signal.aborted) {
    return api.log('Aborted.')
  }
  const q = new PQueue({
    concurrency,
    autoStart: true
  })
  // In order to prevent accidentally partially written states, this pauses the
  // queue which will prevent additional tasks to be executed. The process should
  // end after persistState is done.
  const signalListener = () => {
    q.clear()
  }
  signal.addEventListener('abort', signalListener)
  try {
    let retryMin
    const addTask = task => {
      if (task.errors && task.errors.length >= maxRetries) {
        return
      }
      if (task.unrecoverable) {
        return
      }
      if (task.retry && task.retry > Date.now()) {
        if (retryMin === undefined || retryMin > task.retry) {
          retryMin = task.retry
        }
        return
      }
      const processor = hydrateTask(processors, maxRetries, api, task, signal)
      if (processor) {
        q.add(processor)
      }
    }
    const onput = (key, value) => {
      addTask(value)
    }
    db.on('batch', entries => {
      for (const entry of entries) {
        if (entry.type === 'put' && entry.sublevel === api.tasks) {
          onput(entry.key, entry.value)
        }
      }
    })
    api.tasks.on('put', onput)
    while (!api.signal.aborted) {
      retryMin = undefined
      for await (const entry of api.tasks.iterator()) {
        const task = entry[1]
        addTask(task)
      }
      await q.onIdle()
      if (signal.aborted || retryMin === undefined) {
        break
      }
      await waitUntil(api, retryMin)
    }
    await q.onIdle()
    if (!api.signal.aborted) {
      api.log('Finalizing.')
      const batch = [
        api.createTask({ type: 'finalize', options: api.opts })
      ]
      const end = await getMaybe(api.meta, 'end')
      if (!end) {
        batch.push({ type: 'put', sublevel: api.meta, key: 'end', value: new Date().toISOString() })
      }
      await db.batch(batch)
      await q.onIdle()
      await db.close()
      api.log('Done.')
    } else {
      console.log('Paused.')
    }
  } finally {
    db.close()
    cacheDb.close()
    signal.removeEventListener('abort', signalListener)
  }
}

async function maybeRetry (api) {
  if (!api.opts.retry) return
  const batch = []
  for await (const [key, task] of api.tasks.iterator()) {
    if (task.errors) {
      delete task.errors
      batch.push({ type: 'put', sublevel: api.tasks, key, value: task })
    }
  }
  await api.db.batch(batch)
}

async function maybeRestart (api) {
  if (!api.opts.forceRestart) {
    if (api.opts.skipRestart) {
      return
    }
    const end = await getMaybe(api.meta, 'end')
    if (!end) {
      // Skip Resetting
      return
    }
  }
  api.log('Resetting data of previous run.')
  await api.db.clear()
}

async function maybeInit (api) {
  const start = await getMaybe(api.meta, 'start')
  if (start) {
    api.log('Resuming.')
    return
  }
  api.log('Initing.')
  await api.db.batch([
    { type: 'put', sublevel: api.meta, key: 'start', value: new Date().toISOString() },
    api.createTask({ type: 'init', options: api.opts })
  ])
}

function cleanOptions (options) {
  // Removes all properties from options that are task-queue specific
  const { db, cacheDb, extendAPI, log, processors, signal, ...rest } = options
  return rest
}

async function isExpired (api, res) {
  if (api.opts.preferCache) {
    return false
  }
  if (res.expires === 'never') {
    return false
  }
  if (res.expires === 'run' && res.start === await api.getStart()) {
    return false
  }

  if (res.maxAge) {
    return res.time + res.maxAge < Date.now()
  }
  return true
}

function validateCacheItem (item) {
  if (typeof item !== 'object') {
    throw new Error('worker needs to return an object!')
  }
  const { expires, maxAge } = item
  if (expires !== undefined) {
    if (expires !== 'run' && expires !== 'never') {
      throw new Error(`worker may return an expires property, but it needs to be "run" or "never"  (expires=${expires})`)
    }
  }
  if (maxAge !== undefined) {
    if (typeof maxAge !== 'number' || isNaN(maxAge)) {
      throw new Error(`worker may return a maxAge for the but needs to be a positive number (maxAge=${maxAge})`)
    }
  }
}

function createAPI (db, cacheDb, opts) {
  const activeCacheRequests = {}
  const processCache = async (item, worker) => {
    let res = await getMaybe(cacheDb, item.key)
    if (res && await isExpired(api, res)) {
      res = null
    }
    if (!res) {
      res = await worker(item)
      validateCacheItem(res)
      res.start = await api.getStart()
      res.time = Date.now()
      await cacheDb.put(item.key, res)
    }
    return res.value
  }
  let start
  const api = opts.extendAPI(db, {
    db,
    async getStart () {
      if (!start) {
        start = await api.meta.get('start')
      }
      return start
    },
    batch: tasks => {
      if (api.signal.aborted) return
      return db.batch(tasks)
    },
    opts: cleanOptions(opts),
    cached (item, worker) {
      let request = activeCacheRequests[item.key]
      if (!request) {
        request = {
          item,
          worker,
          op: processCache(item, worker).finally(() => {
            delete activeCacheRequests[item.key]
          })
        }
        activeCacheRequests[item.key] = request
      }
      return request.op
    },
    async fetchJSON (url, fetchOpts, opts) {
      const txt = await api.fetchText(url, fetchOpts, opts)
      try {
        return JSON.parse(txt)
      } catch (err) {
        throw new Error(`JSON parse error: ${err.message}\n${txt}`)
      }
    },
    async fetchText (url, fetchOpts, { maxAge, expires, rateLimiter } = {}) {
      opts = opts ?? {}
      return api.cached(
        { key: JSON.stringify({ url, opts: fetchOpts }) },
        async () => {
          try {
            if (rateLimiter) {
              await rateLimiter(api, url)
            }
            const res = await fetch(url, fetchOpts)
            if (res.status === 429) {
              // Too many requests
              const rateLimitReset = res.headers.get('x-ratelimit-reset') ?? res.headers.get('ratelimit-reset')
              const retryAfter = res.headers.get('retry-after')
              throw new RateLimitError(
                rateLimitReset
                  ? parseInt(rateLimitReset, 10)
                  : retryAfter
                    ? Date.now() + parseInt(retryAfter, 10) + 1000
                    : Date.now() + 5000
              )
            }
            if (res.status === 404) {
              throw new UnrecoverableError('404 - Not Found')
            }
            const txt = await res.text()
            if (res.status !== 200) {
              throw Object.assign(new Error(`[HTTPStatus=${res.status}] ${txt}`), { res })
            }
            return {
              value: txt,
              expires,
              maxAge
            }
          } catch (err) {
            throw addURLToError(url, err)
          }
        }
      )
    },
    signal: opts.signal,
    createTask: task => {
      task.id = timeRandomID()
      return { type: 'put', sublevel: api.tasks, key: task.id, value: task }
    },
    log (...args) {
      if (api.signal.aborted) return
      opts.log(...args)
    },
    meta: db.sublevel('meta', { valueEncoding: 'json' }),
    tasks: db.sublevel('tasks', { valueEncoding: 'json' }),
    taskRegistry: db.sublevel('task-registry', { valueEncoding: 'utf-8' })
  })
  return api
}

function hydrateTask (processors, maxRetries, api, task) {
  if (task.errors?.length === maxRetries) {
    return
  }
  return async () => {
    let batch = []
    try {
      const processor = processors[task.type]
      if (!processor) {
        throw new Error(`Unexpected task ${JSON.stringify(task)}`)
      }
      if (task.errors) {
        api.log(`Restarting ${task.id} due to error.`)
      } else {
        delete task.retry
        api.log('Starting', task)
      }
      const res = await processor(api, task)
      batch = [
        ...res.batch,
        { type: 'del', sublevel: api.tasks, key: task.id }
      ]
    } catch (err) {
      if (api.signal.aborted) {
        return
      }
      if (task.type === 'finalize') {
        console.log(err.stack)
        return
      }
      const updateTask = {
        type: 'put',
        sublevel: api.tasks,
        key: task.id,
        value:
          err instanceof RateLimitError
            ? { ...task, retry: err.resetTime }
            : err instanceof UnrecoverableError
              ? { ...task, unrecoverable: true, errors: [...(task.errors || []), err.stack] }
              : { ...task, retry: null, errors: [...(task.errors || []), err.stack] }
      }
      if (updateTask.value.retry) {
        api.log(`RateLimit encountered for ${task.id}, retrying at ${new Date(updateTask.value.retry)} (${updateTask.value.retry - Date.now()}ms).`)
      } else if (updateTask.value.errors?.length === maxRetries) {
        api.log(`Restarted ${task.id} ${maxRetries} times, will stop trying:`, updateTask.value.errors[maxRetries - 1])
      }
      batch = [updateTask]
    }
    if (task.type !== 'finalize') {
      batch.push({ type: 'put', sublevel: api.meta, key: 'lastModified', value: new Date().toISOString() })
    }
    if (!api.signal.aborted) {
      try {
        await api.batch(batch)
        api.log('Finished', task.id)
      } catch (err) {
        console.log(err.stack)
        console.log(batch)
      }
    }
  }
}
