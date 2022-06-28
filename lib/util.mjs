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

export async function collect (db) {
  const result = {}
  for await (const [key, value] of db.iterator()) {
    const parts = /(.+?)((#|!!)(.+?))?(\+)?$/.exec(key)
    const namespace = parts[1]
    const property = parts[4]
    if (!property) {
      result[namespace] = value
      continue
    }
    let entry = result[namespace]
    if (!entry) {
      entry = {}
      result[namespace] = entry
    }
    if (parts[5]) {
      let arr = entry[property]
      if (!arr) {
        arr = []
        entry[property] = arr
      }
      arr.push(value)
    } else {
      entry[property] = value
    }
  }
  return result
}

export async function waitUntil (api, time, signal) {
  const waitFor = time - Date.now()
  api.log(`Waiting until ${(new Date(time)).toISOString()} (${waitFor}ms)`)
  await new Promise(resolve => {
    let timeout = null
    const finish = () => {
      signal.removeEventListener('abort', finish)
      clearTimeout(timeout)
      resolve()
    }
    signal.addEventListener('abort', finish)
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

async function getOrCreate (api, db, key, task, create) {
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

export function taskProcessor (type, getTaskDef, exec, validateTask) {
  validateTask = validateTask ?? (() => true)
  return {
    type,
    getTaskDef,
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

export function resourceTaskProcessor (type, getDB, getTaskDef, create, validateTask) {
  validateTask = validateTask ?? (() => true)
  return {
    type,
    getDB,
    getTaskDef,
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
  constructor (url, resetTime) {
    super(`[HTTPStatus=429] Rate Limit Error! ${url} - waiting until: ${resetTime}s`)
    this.url = url
    if (typeof resetTime === 'string') {
      resetTime = parseInt(resetTime, 10) * 1000
    }
    if (isNaN(resetTime)) {
      resetTime = Date.now() + 1000
    }
    this.resetTime = resetTime
  }
}

export function addURLToError (url, err) {
  if (!err.url) {
    err.message = `${url}: ${err.message}`
    err.stack = `${JSON.stringify(url)}: ${err.stack}`
    err.url = url
  }
  return err
}

export async function fetchJSON (url, headers) {
  try {
    const res = await fetch(url, headers)
    const txt = await res.text()
    if (res.status === 429) {
      // Too many requests
      throw new RateLimitError(url, res.headers.get('x-ratelimit-reset'))
    }
    if (res.status !== 200) {
      throw new Error(`[HTTPStatus=${res.status}] ${txt}`)
    }
    try {
      return JSON.parse(txt)
    } catch (err) {
      throw new Error(`JSON parse error: ${err.message}\n${txt}`)
    }
  } catch (err) {
    throw addURLToError(url, err)
  }
}
