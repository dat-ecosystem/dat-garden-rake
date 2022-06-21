import { createDependencyTasks, loadNPM } from '../lib/npm.mjs'

export async function processBlessed (api, task) {
  if (task.npm) {
    const { batch, pkg } = await loadNPM(api, task.npm, task.version)
    return [
      ...batch,
      api.createTask({ type: 'repo-dependents', repoURL: pkg.repository }),
      ...createDependencyTasks(api, pkg)
    ]
  }
  throw new Error(`Unsupported blessed task ${JSON.stringify(task)}`)
}
