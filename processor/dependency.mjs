import { createDependencyTasks, loadNPM } from '../lib/npm.mjs'

export async function processDependency (api, task) {
  if (task.npm) {
    const { batch, pkg } = await loadNPM(api, task.npm, task.version)
    return [
      ...batch,
      ...createDependencyTasks(api, pkg)
    ]
  }
  throw new Error(`Unsupported dependency ${JSON.stringify(task)}`)
}
