import { normalizeDependencies, normalizeRepository, loadPackumentCached, parseNpmUrl } from '../lib/npm.mjs'
import { normalizePeople } from '../lib/people.mjs'
import { createRepoTasks } from '../lib/repo.mjs'
import { resourceTaskProcessor, timeRandomID } from '../lib/util.mjs'

export const npmPackage = resourceTaskProcessor({
  type: 'npm-package',
  getDB: api => api.packages,
  getTaskDef (_api, type, { url }) {
    return {
      key: url,
      task: { type, url }
    }
  },
  async create (api, _db, { url }) {
    const { name, version } = parseNpmUrl(url)
    const { value: pkg, batch } = await normalizePackage(api, version, await loadPackumentCached(api, name, version))
    batch.push({ type: 'put', sublevel: api.packages, key: url, value: pkg })
    if (pkg.repository) {
      batch.push(
        ...await createRepoTasks(api, { repoURL: pkg.repository }),
        { type: 'put', sublevel: api.repos, key: `${pkg.repository}#package+${timeRandomID()}`, value: url }
      )
    }
    return {
      value: pkg,
      batch
    }
  }
})

function toArray (input) {
  if (input === null || input === undefined) {
    return []
  }
  if (Array.isArray(input)) {
    return input
  }
  return [input]
}

async function normalizePackage (api, version, pkg) {
  const { value: people, batch } = await normalizePeople(api, {
    author: [{ npmFree: (pkg.author || '') }],
    publishedBy: [{ npmLogin: pkg._npmUser }],
    contributor: toArray(pkg.contributors).map(contributor => ({ npmFree: contributor })),
    maintainer: toArray(pkg.maintainers).map(maintainer => ({ npmLogin: maintainer })),
    user: Object.keys(pkg.users || {}).map(user => ({ npmLogin: user }))
  })
  return {
    value: {
      name: pkg.name,
      version,
      description: pkg.description,
      keywords: pkg.keywords,
      homepage: pkg.homepage,
      bugs: pkg.bugs?.url || pkg.bugs,
      license: pkg.license,
      time: pkg.time?.[version],
      people,
      dependencies: await normalizeDependencies(api, pkg.dependencies || {}),
      funding: pkg.funding,
      // Make sure that pkg.repository is a normalized string for future lookup
      repository: normalizeRepository(pkg.repository)
    },
    batch
  }
}
