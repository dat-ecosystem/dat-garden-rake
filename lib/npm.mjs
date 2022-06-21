import { normalizePeople } from './people.mjs'
import { getMaybe } from './util.mjs'
import { execa } from 'execa'

export const npmURL = 'https://www.npmjs.com/package/'

export async function loadNPM (api, name, version) {
  version = version || 'latest'
  const searchKey = `${name}@${version}`
  const link = await getMaybe(api.packageVersion, `${npmURL}${searchKey}#package`)
  if (link) {
    return {
      batch: [],
      pkg: await api.package.get(link)
    }
  }
  api.log(`Loading NPM package ${searchKey}`)
  const res = await execa('npm', ['show', searchKey, '--json'])
  if (res.exitCode !== 0) {
    throw new Error(`Error while executing: ${res.command}:\nstdout=${res.stdout}\nstderr=${res.stderr}`)
  }

  let pkgJSON
  try {
    pkgJSON = JSON.parse(res.stdout)
  } catch (err) {
    throw new Error(`Error while parsing result of ${res.command}:\nstdout=${res.stdout}`)
  }

  const pkg = normalizePackage(pkgJSON)
  const key = `${name}@${pkg.version}`
  const batch = [
    { type: 'put', sublevel: api.packageVersion, key: searchKey, value: key },
    { type: 'put', sublevel: api.package, key, value: pkg }
  ]
  if (pkg.repository) {
    batch.push(
      api.createTask({ type: 'repo-contributors', repoURL: pkg.repository }),
      { type: 'put', sublevel: api.repo, key: `${pkg.repository}#package+`, value: `${npmURL}${key}` }
    )
  }
  return {
    pkg,
    batch
  }
}

function normalizePackage (pkg) {
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
    dependencies: pkg.dependencies || [],
    funding: pkg.funding,
    // Make sure that pkg.repository is a normalized string for future lookup
    repository: normalizeRepository(pkg.repository)
  }
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
  return Object
    .entries(pkg.dependencies || {})
    .map(([npm, version]) => api.createTask({ type: 'dependency', npm, version }))
}
