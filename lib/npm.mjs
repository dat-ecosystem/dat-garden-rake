import pMap from 'p-map'
import pacote from 'pacote'
import semver from 'semver'
import { githubRepoURL } from './repo.mjs'
import { addURLToError, createRateLimiter, fetchJSDom, plusMinusInt, RateLimitError } from './util.mjs'

export const npmURL = 'https://www.npmjs.com/package/'

export function parseNpmUrl (url) {
  if (typeof url !== 'string') {
    throw new Error(`URL not a string: ${url}`)
  }
  if (!url.startsWith(npmURL)) {
    throw new Error(`Not an NPM URL: ${url}`)
  }
  const parts = /(.+?)(\/v\/(.+))?$/.exec(url.substring(npmURL.length))
  if (!parts) {
    throw new Error(`Unexpected NPM URL: ${url}`)
  }
  return { name: parts[1], version: parts[3] }
}

export function createNpmUrl (name, version) {
  return `${npmURL}${name}/v/${version}`
}

export async function normalizeNPM (api, name, input) {
  name = name.split('/').map(entry => entry.trim()).join('/')
  let version = semver.valid(input)
  if (version !== null) {
    return `${npmURL}${name}/v/${version}`
  }
  if (semver.validRange(input) !== null) {
    let versions
    try {
      versions = (await loadPackumentCached(api, name, 'latest')).versions
    } catch (err) {
      if (api.signal.aborted) {
        throw err
      }
      return `npm-unresolvable://${name}@${input}: ${err.stack}`
    }
    if (typeof versions === 'string') {
      versions = [versions]
    } else if (!Array.isArray(versions)) {
      return `npm-unresolvable://${name}@${input}: versions=${versions}`
    }
    version = semver.maxSatisfying(versions, input)
    if (version === null) {
      if (input === '*') {
        version = versions[versions.length - 1]
      } else {
        return `npm-unresolvable://${name}@${input}: version=null (not satisfiable, ${versions})`
      }
    }
    return createNpmUrl(name, version)
  }
  // "next" or "alpha" may be just a string, a / indicates a github repo
  if (!/\//.test(input)) {
    try {
      const { 'dist-tags': tags } = await loadPackumentCached(api, name, input)
      version = tags?.[input]
      if (version) {
        return `${npmURL}${name}/v/${version}`
      }
    } catch (err) {
      if (api.signal.aborted) {
        throw err
      }
    }
  }
}

export async function normalizeDependencies (api, dependencies) {
  const deps = await pMap(Object.entries(dependencies), ([name, input]) => normalizeDependency(api, name, input), { concurrency: 1 })
  return deps.filter(Boolean)
}

export async function normalizeDependency (api, name, input) {
  if (input === 'latest') {
    input = '*'
  }
  const normalized = await normalizeNPM(api, name, input)
  if (normalized !== null) {
    return normalized
  }
  // Remove everything after '#'
  input = /(.+?)(#.+)?/.exec(input)[1]
  const repo = normalizeRepository(input)
  if (repo) {
    return repo
  }
  if (/\//.test(input)) {
    return `${githubRepoURL}${input}`
  }
  return input
}

export function normalizeRepository (repo) {
  if (!repo) {
    return undefined
  }
  if (typeof repo === 'string') {
    if (repo.startsWith('https:')) {
      repo = `git+https:${repo.substring(6)}`
    } else if (repo.startsWith('git:')) {
      repo = `git+https:${repo.substring(4)}`
    } else if (!/^[a-z_+]+:/i.test(repo)) {
      repo = `git+https://github.com/${repo}`
    } else {
      const parts = /^git\+ssh:\/\/git@(.*)/.exec(repo)
      if (parts) {
        repo = `git+https://${parts[1]}`
      }
    }
    if ((repo.startsWith('git+https://github.com') || repo.startsWith('git+https://gitlab.com')) && repo.endsWith('.git')) {
      repo = repo.substring(0, repo.length - 4)
    }
    // remove hash!
    return /^([^#]*)/.exec(repo)[1]
  }
  if (repo.url) {
    return normalizeRepository(repo.url)
  }
  return null
}

// 50 per second guessed through experiments...
const rateLimiter = createRateLimiter(50, 60000)
export async function fetchNpmJSDom (api, url, opts = {}) {
  try {
    return await fetchJSDom(api, url, { rateLimiter, ...opts })
  } catch (err) {
    if (err.res?.status === 429) {
      throw addURLToError(url, new RateLimitError(Date.now() + 5000))
    }
    throw err
  }
}

export async function loadPackumentCached (api, name, version) {
  const pkg = `${name}@${version}`
  return api.cached({ key: `npm://${pkg}` }, async () => {
    api.log(`Loading NPM package ${pkg}`)
    let value = await pacote.packument(pkg, { fullMetadata: true, fullReadJson: true })
    const ver = value.versions[version] || value.versions[value['dist-tags'][version]]
    value = {
      ...value,
      ...ver
    }
    value.versions = Object.keys(value.versions).sort(semver.compareLoose)
    return {
      value,
      expires: semver.valid(version) ? 'never' : 'run',
      maxAge: plusMinusInt(1000 * 60 * 60 * 24, 0.1)
    }
  })
}
