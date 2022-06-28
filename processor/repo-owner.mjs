import { fetchGithubAPI, fetchGitlabAPI, getGithubOwner, getGitlabRepo, githubURL, gitlabURL } from '../lib/repo.mjs'
import { resourceTaskProcessor } from '../lib/util.mjs'

export const repoOwner = resourceTaskProcessor(
  'repo-owner',
  api => api.repo,
  (_api, type, { repoURL }) => ({
    key: `${repoURL}#owner`,
    task: { type, repoURL }
  }),
  async (_api, _db, { repoURL }) => {
    let owner
    if (repoURL.startsWith(gitlabURL)) {
      owner = await loadGitlabOwner(repoURL)
    }
    if (repoURL.startsWith(githubURL)) {
      owner = await loadGithubOwner(repoURL)
    }
    if (!owner) {
      throw new Error(`Can not load repo contributors for ${repoURL}`)
    }
    return {
      value: owner,
      batch: []
    }
  }
)

async function loadGitlabOwner (repoURL) {
  const glRepo = getGitlabRepo(repoURL)
  const repo = await fetchGitlabAPI(`projects/${encodeURIComponent(glRepo)}`)
  if (!repo.owner) {
    return null
  }
  const group = await fetchGitlabAPI(`groups/${repo.owner.id}`)
  // https://docs.gitlab.com/ee/api/groups.html#details-of-a-group
  return {
    type: 'gitlab',
    user: group.path_with_namespace,
    name: group.name,
    company: null,
    description: group.description,
    email: null,
    location: null,
    twitter: null,
    html_url: group.web_url,
    avatar_url: group.avatar_url
  }
}

async function loadGithubOwner (repoURL) {
  const user = await fetchGithubAPI(`users/${getGithubOwner(repoURL)}`)
  // https://docs.github.com/en/rest/users/users#get-a-user
  return {
    type: 'github',
    user: user.login,
    name: user.name,
    company: user.company,
    description: user.bio,
    email: user.email,
    location: user.location,
    twitter: user.twitter_username,
    html_url: user.html_url,
    avatar_url: user.avatar_url
  }
}
