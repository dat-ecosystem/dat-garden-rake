import { webcrypto as crypto } from 'crypto'
import { JSDOM } from 'jsdom'

export async function fetchJSDom (api, url, opts) {
  return new JSDOM(await api.fetchText(url, {}, opts))
}

export function createRateLimiter (count, window) {
  const queue = []
  return async (api, label) => {
    const now = Date.now()
    while (queue[0] < now) {
      queue.shift()
    }
    if (queue.length < count) {
      queue.push(now + window)
      return
    }
    const expire = queue[queue.length - count] + window
    queue.push(expire + window)
    await waitUntil(api, expire, label)
  }
}

export function deferAsync (cmd) {
  let requested = false
  let running = null
  return () => {
    if (running) {
      requested = true
      return running
    }
    running = cmd().finally(() => {
      running = null
      if (requested) {
        requested = false
        return cmd()
      }
    })
  }
}

export function timeRandomID () {
  return Math.round(Date.now()).toString(16) + '-' + crypto.randomUUID().substring(0, 23)
}

export async function waitUntil (api, time, label = '') {
  const waitFor = time - Date.now()
  if (waitFor <= 0) {
    return
  }
  api.log(`${label}Waiting until ${(new Date(time)).toISOString()} (${Math.round(waitFor / 100) / 10}s)`)
  await new Promise(resolve => {
    let timeout = null
    const finish = () => {
      api.signal?.removeEventListener('abort', finish)
      clearTimeout(timeout)
      resolve()
    }
    api.signal?.addEventListener('abort', finish)
    timeout = setTimeout(finish, waitFor)
  })
}

export async function getMaybe (db, key) {
  try {
    return await db.get(key)
  } catch (err) {
    if (err.code === 'LEVEL_NOT_FOUND') {
      return null
    }
    throw err
  }
}

export async function getOrCreate (api, db, key, task, create) {
  const existing = await getMaybe(db, key)
  if (existing === undefined) {
    api.log(`${task.id}'s data is already cached at ${key}`)
    return {
      value: existing,
      batch: []
    }
  }
  const { value, batch } = await create()
  if (!value) {
    throw new Error(`Value needs to be created ${value}`)
  }
  return {
    value,
    batch: [
      { type: 'put', sublevel: db, key, value },
      ...batch
    ]
  }
}

export function taskProcessor ({ type, getTaskDef, exec, validateTask }) {
  validateTask = validateTask ?? (() => true)
  return {
    type,
    getTaskDef: (api, item) => getTaskDef(api, type, item),
    async createTasks (api, items) {
      return await createTasks(api, items.map(item => getTaskDef(api, type, item)), validateTask)
    },
    async createTask (api, item) {
      return await createTasks(api, [getTaskDef(api, type, item)], validateTask)
    },
    async process (api, item) {
      return {
        batch: [...await exec(api, item)]
      }
    }
  }
}

export function resourceTaskProcessor ({ type, getDB, getTaskDef, create, validateTask }) {
  validateTask = validateTask ?? (() => true)
  return {
    type,
    getDB,
    getTaskDef: (api, item) => getTaskDef(api, type, item),
    async createTasks (api, items) {
      return await createResourceTasks(api, getDB(api), items.map(item => getTaskDef(api, type, item)), validateTask)
    },
    async createTask (api, item) {
      return await createResourceTasks(api, getDB(api), [getTaskDef(api, type, item)], validateTask)
    },
    async process (api, task) {
      const db = getDB(api)
      const { key } = getTaskDef(api, type, task)
      return await getOrCreate(
        api,
        db,
        key,
        task,
        () => create(api, db, task)
      )
    }
  }
}

export function predictableObj (input) {
  if (typeof input !== 'object' || input === null) {
    return input
  }
  if (Array.isArray(input)) {
    return input.map(predictableObj)
  }
  const obj = {}
  for (const key of Object.keys(input).sort()) {
    const value = input[key]
    if (value === undefined || value === null) {
      continue
    }
    obj[key] = typeof value === 'object' ? predictableObj(value) : value
  }
  return obj
}

async function createTasks (api, taskDefs, validateTask) {
  const existingTasks = await api.taskRegistry.getMany(taskDefs.map(({ key, task }) => `${task.type}:${key}`))
  taskDefs = taskDefs
    // In case another task for the resource is already registered
    .filter((_, index) => existingTasks[index] === undefined)

  const result = []
  for (const { task, key } of taskDefs) {
    if (!validateTask(api, task)) {
      continue
    }
    const actual = api.createTask(task)
    result.push(
      actual,
      { type: 'put', sublevel: api.taskRegistry, key: `${task.type}:${key}`, value: actual.key }
    )
  }
  return result
}

async function createResourceTasks (api, db, taskDefs, validateTask) {
  const existingResources = await db.getMany(taskDefs.map(({ key }) => key))
  taskDefs = taskDefs
    // Remove all keys that are already stored
    .filter((_, index) => existingResources[index] === undefined)

  return await createTasks(api, taskDefs, validateTask)
}

export class RateLimitError extends Error {
  constructor (resetTime) {
    super(`[HTTPStatus=429] Rate Limit Error! - waiting until: ${resetTime}s`)
    if (typeof resetTime === 'string') {
      resetTime = parseInt(resetTime, 10) * 1000
    }
    if (isNaN(resetTime)) {
      resetTime = Date.now() + 1000
    }
    this.resetTime = resetTime
  }
}

export class UnrecoverableError extends Error {}

export function addURLToError (url, err) {
  if (!err.url) {
    err.stack = `${url}: ${err.stack}`
    err.message = `${url}: ${err.message}`
    err.url = url
  }
  return err
}
