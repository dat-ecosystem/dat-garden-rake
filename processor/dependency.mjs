import { npmURL } from '../lib/npm.mjs'
import { isRepo } from '../lib/repo.mjs'
import { taskProcessor } from '../lib/util.mjs'
import { npmPackage } from './npm-package.mjs'
import { repoDependents } from './repo-dependents.mjs'

export const dependency = taskProcessor(
  'dependency',
  (_api, type, { dependency }) => ({
    key: dependency,
    task: { type, dependency }
  }),
  async (api, { dependency }) => {
    if (dependency.startsWith(npmURL)) {
      const { batch, value: pkg } = await npmPackage.process(api, dependency)
      batch.push(...await dependency.createTasks(api, pkg.dependency))
      return batch
    }
    if (isRepo(dependency)) {
      return await repoDependents.createTask(api, { repoURL: dependency })
    }
    throw new Error(`Unsupported dependency ${dependency}`)
  }
)
