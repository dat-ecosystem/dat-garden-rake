import { normalizePeople } from './people.mjs'
import { getMaybe } from './util.mjs'
import { execa } from 'execa'
import semver from 'semver'
import QuickLRU from 'quick-lru'
import pMap from 'p-map'
import { githubURL } from './repo.mjs'

export const npmURL = 'https://www.npmjs.com/package/'

async function npmShow (args, signal) {
  const res = await execa('npm', ['show', '--json', ...args], {
    signal
  })
  if (res.exitCode !== 0) {
    throw new Error(`Error while executing: ${res.command}:\nstdout=${res.stdout}\nstderr=${res.stderr}`)
  }
  try {
    return JSON.parse(res.stdout)
  } catch (err) {
    throw new Error(`Error while parsing result of ${res.command}:\nstdout=${res.stdout}`)
  }
}

function parseNpmUrl (url) {
  if (typeof url !== 'string') {
    throw new Error(`URL not a string: ${url}`)
  }
  if (!url.startsWith(npmURL)) {
    throw new Error(`Not an NPM URL: ${url}`)
  }
  const parts = /(.+?)\/v\/(.+)$/.exec(url.substring(npmURL.length))
  if (!parts) {
    throw new Error(`Unexpected NPM URL: ${url}`)
  }
  return { name: parts[1], version: parts[2] }
}

export async function loadNPM (api, url) {
  const { name, version } = parseNpmUrl(url)
  let pkg = await getMaybe(api.package, url)
  if (pkg) {
    return {
      batch: [],
      pkg
    }
  }
  api.log(`Loading NPM package ${name}@${version}`)
  pkg = await normalizePackage(api, await npmShow([`${name}@${version}`], api.signal))
  const batch = [
    { type: 'put', sublevel: api.package, key: url, value: pkg }
  ]
  if (pkg.repository) {
    batch.push(
      api.createTask({ type: 'repo-contributors', repoURL: pkg.repository }),
      { type: 'put', sublevel: api.repo, key: `${pkg.repository}#package+`, value: url }
    )
  }
  return {
    pkg,
    batch
  }
}

async function normalizePackage (api, pkg) {
  return {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    keywords: pkg.keywords,
    homepage: pkg.homepage,
    bugs: pkg.bugs?.url || pkg.bugs,
    license: pkg.license,
    time: pkg.time?.[pkg.version],
    size: {
      packed: pkg._contentLength || 0,
      unpacked: pkg.dist?.unpackedSize || 0
    },
    people: normalizePeople({
      author: [{ npmFree: (pkg.author || '') }],
      publishedBy: [{ npmLogin: pkg._npmUser }],
      contributor: (pkg.contributors || []).map(contributor => ({ npmFree: contributor })),
      maintainers: (pkg.maintainers || []).map(maintainer => ({ npmLogin: maintainer })),
      users: Object.keys(pkg.users || {}).map(user => ({ npmLogin: user }))
    }),
    dependencies: await normalizeDependencies(api, pkg.dependencies || {}),
    funding: pkg.funding,
    // Make sure that pkg.repository is a normalized string for future lookup
    repository: normalizeRepository(pkg.repository)
  }
}

async function normalizeDependencies (api, dependencies) {
  return await pMap(Object.entries(dependencies), ([name, input]) => normalizeDependency(api, name, input), { concurrency: 1 })
}

const lru = new QuickLRU({
  maxSize: 100
})

async function npmVersions (name, signal) {
  let cached = lru.get(name)
  if (!cached) {
    cached = await npmShow([name, 'versions'], signal)
    lru.set(name, cached)
  }
  return cached
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
      versions = await npmVersions(name, api.signal)
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
    return `${npmURL}${name}/v/${version}`
  }
  // "next" or "alpha" may be just a string, a / indicates a github repo
  if (!/\//.test(input)) {
    let tags
    try {
      tags = await npmShow([name, 'dist-tags'], api.signal)
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

async function normalizeDependency (api, name, input) {
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
    return `${githubURL}${input}`
  }
  return input
}

function normalizeRepository (repo) {
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

export function createDependencyTasks (api, pkg) {
  return pkg.dependencies.map(dependency => api.createTask({ type: 'dependency', dependency }))
}
