import PQueue from 'p-queue'
import { webcrypto as crypto } from 'crypto'
import { RateLimitError, getMaybe, waitUntil } from './util.mjs'

export async function runTasks (opts) {
  const { db, processors, concurrency, maxRetries, signal } = opts
  await db.open()
  const api = createAPI(db, opts)
  await maybeInit(api, opts)
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
    q.pause()
    db.close()
  }
  signal.addEventListener('abort', signalListener)
  try {
    let retryMin
    const addTask = task => {
      if (task.errors && task.errors.length >= maxRetries) {
        return
      }
      if (task.retry && task.retry > Date.now()) {
        if (retryMin === undefined || retryMin > task.retry) {
          retryMin = task.retry
        }
        return
      }
      q.add(hydrateTask(processors, maxRetries, api, task, signal))
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
      await waitUntil(api, retryMin, signal)
    }
    await q.onIdle()
    if (!api.signal.aborted) {
      await api.meta.put('end', new Date().toISOString())
      api.log('Finalizing.')
      await db.batch([
        api.createTask({ type: 'finalize', options: cleanOptions(opts) })
      ])
      await q.onIdle()
      await db.close()
      api.log('Done.')
    } else {
      console.log('Paused.')
    }
  } finally {
    signal.removeEventListener('abort', signalListener)
  }
}

async function maybeInit (api, options) {
  const start = await getMaybe(api.meta, 'start')
  if (start) {
    return
  }
  api.log('Initing.')
  await api.db.batch([
    { type: 'put', sublevel: api.meta, key: 'start', value: new Date().toISOString() },
    api.createTask({ type: 'init', options: cleanOptions(options) })
  ])
}

function cleanOptions (options) {
  // Removes all properties from options that are task-queue specific
  const { db, extendAPI, log, processors, signal, concurrency, maxRetries, ...rest } = options
  return rest
}

function createAPI (db, opts) {
  const api = opts.extendAPI(db, {
    db,
    batch: tasks => {
      if (api.signal.aborted) return
      return db.batch(tasks)
    },
    signal: opts.signal,
    createTask: task => {
      task.id = Math.round(Date.now()).toString(16) + '-' + crypto.randomUUID().substring(0, 23)
      return { type: 'put', sublevel: api.tasks, key: task.id, value: task }
    },
    log (...args) {
      if (api.signal.aborted) return
      opts.log(...args)
    },
    meta: db.sublevel('meta', { valueEncoding: 'json' }),
    tasks: db.sublevel('tasks', { valueEncoding: 'json' })
  })
  return api
}

function hydrateTask (processors, maxRetries, api, task) {
  return async () => {
    let batch
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
      batch = [
        ...await processor(api, task),
        { type: 'del', sublevel: api.tasks, key: task.id }
      ]
      api.log('Finished', task.id)
    } catch (err) {
      if (api.signal.aborted) {
        return
      }
      const updateTask = {
        type: 'put',
        sublevel: api.tasks,
        key: task.id,
        value:
          err instanceof RateLimitError
            ? { ...task, retry: err.resetTime }
            : { ...task, retry: null, errors: [...(task.errors || []), err.stack] }
      }
      if (updateTask.value.retry) {
        api.log(`RateLimit encountered for ${task.id}, retrying at ${new Date(updateTask.value.retry)} (${updateTask.value.retry - Date.now()}ms).`)
      } else if (updateTask.value.errors?.length === maxRetries) {
        api.log(`Restarted ${task.id} ${maxRetries} times, will stop trying:`, updateTask.value.errors[maxRetries - 1])
      }
      batch = [updateTask]
    }
    if (!api.signal.aborted) {
      await api.batch(batch)
    }
  }
}
