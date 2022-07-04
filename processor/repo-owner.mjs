import { githubUserURL, gitlabGroupURL } from '../lib/people.mjs'
import { fetchGitlabAPI, getGithubOwner, getGitlabRepo, githubRepoURL, gitlabRepoURL } from '../lib/repo.mjs'
import { plusMinusInt, resourceTaskProcessor } from '../lib/util.mjs'
import { person } from './person.mjs'

export const repoOwner = resourceTaskProcessor({
  type: 'repo-owner',
  getDB: api => api.repos,
  getTaskDef (_api, type, { repoURL }) {
    return {
      key: `${repoURL}#owner`,
      task: { type, repoURL }
    }
  },
  async create (api, _db, task) {
    const { repoURL } = task
    if (repoURL.startsWith(gitlabRepoURL)) {
      return await loadGitlabOwner(api, task)
    }
    if (repoURL.startsWith(githubRepoURL)) {
      return await loadGithubOwner(api, task)
    }
    throw new Error(`Can not load repo contributors for ${repoURL}`)
  }
})

const maxOwnerAge = () => plusMinusInt(1000 * 60 * 60 * 24 * 30 * 2, 0.05) // two months seems good

async function loadGitlabOwner (api, task) {
  const { repoURL } = task
  const glRepo = getGitlabRepo(repoURL)
  const repo = await fetchGitlabAPI(api, `projects/${encodeURIComponent(glRepo)}`, {
    maxAge: maxOwnerAge()
  })
  if (!repo.owner) {
    return {
      value: '<unknown>',
      batch: []
    }
  }
  const groupId = repo.owner.id
  // https://docs.gitlab.com/ee/api/groups.html#details-of-a-group
  const group = await fetchGitlabAPI(api, `groups/${encodeURIComponent(groupId)}`, {
    maxAge: maxOwnerAge()
  })
  return {
    value: {
      gitlab_url: gitlabGroupURL(groupId),
      name: group.name,
      description: group.description,
      html_url: group.web_url,
      avatar_url: group.avatar_url
    },
    batch: []
  }
}

async function loadGithubOwner (api, task) {
  const { repoURL } = task
  const login = getGithubOwner(repoURL)
  const url = githubUserURL(login)
  return {
    value: url,
    batch: [
      ...await person.createTask(api, { url })
    ]
  }
}
