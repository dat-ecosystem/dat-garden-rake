import { fetchGitlabAPI, getGithubOwner, getGitlabRepo, githubURL, githubUserURL, gitlabGroupURL, gitlabURL } from '../lib/repo.mjs'
import { resourceTaskProcessor } from '../lib/util.mjs'
import { githubUser } from './github-user.mjs'
import { gitlabGroup } from './gitlab-group.mjs'

export const repoOwner = resourceTaskProcessor(
  'repo-owner',
  api => api.repo,
  (_api, type, { repoURL }) => ({
    key: `${repoURL}#owner`,
    task: { type, repoURL }
  }),
  async (api, _db, task) => {
    const { repoURL } = task
    if (repoURL.startsWith(gitlabURL)) {
      return await loadGitlabOwner(api, task)
    }
    if (repoURL.startsWith(githubURL)) {
      return await loadGithubOwner(api, task)
    }
    throw new Error(`Can not load repo contributors for ${repoURL}`)
  }
)

async function loadGitlabOwner (api, task) {
  const { repoURL } = task
  const glRepo = getGitlabRepo(repoURL)
  const repo = await fetchGitlabAPI(`projects/${encodeURIComponent(glRepo)}`)
  if (!repo.owner) {
    return null
  }
  const group = repo.owner.id
  return {
    value: gitlabGroupURL(group),
    batch: [
      ...await gitlabGroup.createTask(api, { group })
    ]
  }
}

async function loadGithubOwner (api, task) {
  const { repoURL } = task
  const login = getGithubOwner(repoURL)
  return {
    value: githubUserURL(login),
    batch: [
      ...await githubUser.createTask(api, { login })
    ]
  }
}
