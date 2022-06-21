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

export const githubURL = 'git+https://github.com/'
export function getGithubRepo (repoURL) {
  return repoURL.substring(githubURL.length).split('/').slice(0, 2).join('/')
}

export const gitlabURL = 'git+https://gitlab.com/'
export function getGitlabRepo (repoURL) {
  if (repoURL.endsWith('.git')) {
    repoURL = repoURL.substring(0, repoURL.length - 4)
  }
  return repoURL.substring(gitlabURL.length)
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
