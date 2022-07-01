import { npmURL } from '../lib/npm.mjs'
import { isRepo } from '../lib/repo.mjs'
import { taskProcessor } from '../lib/util.mjs'
import { npmPackage } from './npm-package.mjs'
import { repoDependents } from './repo-dependents.mjs'

export const dependentInfo = taskProcessor({
  type: 'dependent-info',
  getTaskDef (_api, type, { dependent, depth }) {
    return {
      key: JSON.stringify({ dependent, depth }),
      task: { type, dependent, depth: depth || 0 }
    }
  },
  async exec (api, { dependent, depth }) {
    if (dependent.startsWith(npmURL)) {
      const { batch, value: pkg } = await npmPackage.process(api, { url: dependent })
      if (pkg.repository) {
        // batch.push(...await repoDependents.createTask(api, { repoURL: pkg.repository, depth: depth + 1 }))
      }
      return batch
    }
    if (isRepo(dependent)) {
      return await repoDependents.createTask(api, { repoURL: dependent, depth })
    }
    throw new Error(`Unsupported dependent-info: ${dependent} [depth=${depth}]`)
  },
  validateTask (api, task) {
    return task.depth <= api.opts.maxDepth && !task.dependent.startsWith('npm-unresolvable://')
  }
})
