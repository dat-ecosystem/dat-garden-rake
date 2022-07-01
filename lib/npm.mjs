import pMap from 'p-map'
import pacote from 'pacote'
import semver from 'semver'
import { githubRepoURL } from './repo.mjs'

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
      versions = await npmVersions(api, name, 'latest')
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
      const { 'dist-tags': tags } = await npmInfo(name, input)
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
    return repo
  }
  if (repo.url) {
    return normalizeRepository(repo.url)
  }
  return null
}

export async function npmVersions (api, name, version) {
  return api.cached({ key: `npm-versions://${name}@${version}` }, async () => ({
    value: (await npmInfo(name, version)).versions,
    expires: Date.now() + (1000 * 60 * 30) // 30 minutes
  }))
}

export async function npmInfo (pkg, version) {
  let res = await pacote.packument(pkg, { fullMetadata: true, fullReadJson: true })
  const ver = res.versions[version] || res.versions[res['dist-tags'][version]]
  res = {
    ...res,
    ...ver
  }
  delete res.readme
  res.versions = Object.keys(res.versions).sort(semver.compareLoose)
  return res
}
