import { normalizeNPM, npmURL, parseNpmUrl } from '../lib/npm.mjs'
import { createRepoTasks, githubRepoURL } from '../lib/repo.mjs'
import { dependency } from './dependency.mjs'
import { npmDependents } from './npm-dependents.mjs'
import { repoDependents } from './repo-dependents.mjs'

export const blessed = {
  type: 'blessed',
  async process (api, task) {
    const { blessed } = task
    if (blessed.startsWith(npmURL)) {
      const parsed = parseNpmUrl(blessed)
      const url = await normalizeNPM(api, parsed.name, parsed.version ?? '*')
      const { name, version } = parseNpmUrl(url)
      return {
        batch: [
          ...await npmDependents.createTask(api, { name, version, depth: 0 }),
          ...await dependency.createTask(api, { dependency: url }),
          { type: 'put', sublevel: api.meta, key: `blessed#${blessed}`, value: { type: 'package', url } }
        ]
      }
    }
    if (blessed.startsWith(githubRepoURL)) {
      return {
        batch: [
          { type: 'put', sublevel: api.meta, key: `blessed#${blessed}`, value: { type: 'repo', url: blessed } },
          ...await createRepoTasks(api, { repoURL: blessed })
          // ...await repoDependents.createTask(api, { repoURL, depth: 0 })
        ]
      }
    }
    throw new Error(`Unsupported blessed entry ${blessed}`)
  }
}
