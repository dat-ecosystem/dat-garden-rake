import { createDependencyTasks, loadNPM } from '../lib/npm.mjs'

export async function processDependency (api, task) {
  if (task.dependency) {
    const { batch, pkg } = await loadNPM(api, task.dependency)
    return [
      ...batch,
      ...createDependencyTasks(api, pkg)
    ]
  }
  throw new Error(`Unsupported dependency ${JSON.stringify(task)}`)
}
