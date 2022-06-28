import { npmURL } from '../lib/npm.mjs'
import { isRepo } from '../lib/repo.mjs'
import { taskProcessor } from '../lib/util.mjs'
import { npmPackage } from './npm-package.mjs'
import { repoDependents } from './repo-dependents.mjs'

export const dependentInfo = taskProcessor(
  'dependent-info',
  (_api, type, { dependent }) => ({
    key: dependent,
    task: { type, dependent }
  }),
  async (api, { dependent }) => {
    if (dependent.startsWith(npmURL)) {
      const { batch, value: pkg } = await npmPackage.process(api, { url: dependent })
      if (pkg.repository) {
        batch.push(...await repoDependents.createTask(api, { repoURL: pkg.repository }))
      }
      return batch
    }
    if (isRepo(dependent)) {
      return await repoDependents.createTask(api, { repoURL: dependent })
    }
    throw new Error(`Unsupported dependent-info: ${dependent}`)
  }
)
