import { normalizeDependency } from '../lib/npm.mjs'
import { dependency } from './dependency.mjs'
import { npmPackage } from './npm-package.mjs'
import { repoDependents } from './repo-dependents.mjs'

export const blessed = {
  type: 'blessed',
  async process (api, task) {
    const { npm, version, repoURL } = task
    if (npm) {
      const url = await normalizeDependency(api, npm, version ?? '*')
      const { batch, value: pkg } = await npmPackage.process(api, { url })
      batch.push(...await dependency.createTasks(api, pkg.dependencies))
      if (pkg.repository) {
        batch.push(...await repoDependents.createTask(api, { repoURL: pkg.repository, depth: 1 }))
      }
      return {
        value: pkg,
        batch
      }
    } else {
      // TODO: This loads github dependencies but not yet deep dependencies
      return await repoDependents.process(api, { repoURL, depth: 0 })
    }
  }
}
