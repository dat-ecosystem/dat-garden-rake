import { normalizeDependencies, normalizeRepository, npmInfo, parseNpmUrl } from '../lib/npm.mjs'
import { normalizePeople } from '../lib/people.mjs'
import { createRepoTasks } from '../lib/repo.mjs'
import { resourceTaskProcessor } from '../lib/util.mjs'

export const npmPackage = resourceTaskProcessor(
  'npm-package',
  api => api.package,
  (_api, type, { url }) => ({
    key: url,
    task: { type, url }
  }),
  async (api, _db, { url }) => {
    const { name, version } = parseNpmUrl(url)
    api.log(`Loading NPM package ${name}@${version}`)
    const pkg = await normalizePackage(api, version, await npmInfo(`${name}@${version}`, version))
    const batch = [
      { type: 'put', sublevel: api.package, key: url, value: pkg }
    ]
    if (pkg.repository) {
      batch.push(
        ...await createRepoTasks(api, { repoURL: pkg.repository }),
        { type: 'put', sublevel: api.repo, key: `${pkg.repository}#package+`, value: url }
      )
    }
    return {
      value: pkg,
      batch
    }
  }
)

async function normalizePackage (api, version, pkg) {
  return {
    name: pkg.name,
    version,
    description: pkg.description,
    keywords: pkg.keywords,
    homepage: pkg.homepage,
    bugs: pkg.bugs?.url || pkg.bugs,
    license: pkg.license,
    time: pkg.time?.[version],
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
