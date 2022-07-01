import { npmURL } from '../lib/npm.mjs'
import { createRepoTasks, isRepo } from '../lib/repo.mjs'
import { taskProcessor } from '../lib/util.mjs'
import { npmPackage } from './npm-package.mjs'

export const dependency = taskProcessor({
  type: 'dependency',
  getTaskDef (_api, type, { dependency }) {
    return {
      key: dependency,
      task: { type, dependency }
    }
  },
  async exec (api, { dependency: url }) {
    if (url.startsWith(npmURL)) {
      const { batch, value: pkg } = await npmPackage.process(api, { url })
      batch.push(...await dependency.createTasks(api, pkg.dependencies.map(dependency => ({ dependency }))))
      return batch
    }
    if (isRepo(url)) {
      return [
        ...await createRepoTasks(api, { repoURL: url })
      ]
    }
    throw new Error(`Unsupported dependency ${url}`)
  }
})
