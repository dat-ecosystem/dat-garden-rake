import { loadNPM, npmURL } from '../lib/npm.mjs'
import { loadRepoDependents } from '../lib/repo.mjs'
import { githubURL, gitlabURL } from '../lib/util.mjs'

export async function processDependentInfo (api, task) {
  const dependent = task.dependent
  if (dependent.startsWith(npmURL)) {
    const name = dependent.substring(npmURL.length)
    const { batch, pkg } = await loadNPM(api, name, 'latest')
    if (pkg.repository) {
      batch.push(api.createTask({ type: 'dependent-info', dependent: pkg.repository }))
    }
    return batch
  }
  if (dependent && (dependent.startsWith(githubURL) || dependent.startsWith(gitlabURL))) {
    return await loadRepoDependents(api, dependent)
  }
  throw new Error(`Unsupported dependent-info: ${JSON.stringify(task)}`)
}
