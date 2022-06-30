import { normalizeNPM, parseNpmUrl } from '../lib/npm.mjs'
import { dependency } from './dependency.mjs'
import { npmDependents } from './npm-dependents.mjs'
import { repoDependents } from './repo-dependents.mjs'

export const blessed = {
  type: 'blessed',
  async process (api, task) {
    const { npm, repoURL } = task
    if (npm) {
      const url = await normalizeNPM(api, npm, task.version ?? '*')
      const { name, version } = parseNpmUrl(url)
      return {
        batch: [
          ...await npmDependents.createTask(api, { name, version, depth: 0 }),
          ...await dependency.createTask(api, { dependency: url })
        ]
      }
    } else {
      // TODO: This loads github dependents but not yet dependencies
      return {
        batch: [
          // ...await repoDependents.createTask(api, { repoURL, depth: 0 })
        ]
      }
    }
  }
}
