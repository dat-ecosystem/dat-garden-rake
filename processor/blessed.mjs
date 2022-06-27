import { createDependencyTasks, loadNPM, normalizeNPM } from '../lib/npm.mjs'

export async function processBlessed (api, task) {
  const { npm, version, repoURL } = task
  if (npm) {
    const { batch, pkg } = await loadNPM(api, await normalizeNPM(api, npm, version ?? '*'))
    return [
      ...batch,
      api.createTask({ type: 'repo-dependents', repoURL: pkg.repository }),
      ...createDependencyTasks(api, pkg)
    ]
  }
  return [
    api.createTask({ type: 'repo-dependents', repoURL })
  ]
}
