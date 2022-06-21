import { loadRepoDependents } from '../lib/repo.mjs'

export async function processRepoDependents (api, task) {
  return await loadRepoDependents(
    api,
    task.repoURL
  )
}
