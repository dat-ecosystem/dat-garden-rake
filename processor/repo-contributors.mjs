import { normalizePeople } from '../lib/people.mjs'
import { fetchGithubAPI, fetchGitlabAPI, getGithubRepo, getGitlabRepo, githubURL, gitlabURL } from '../lib/repo.mjs'
import { getMaybe } from '../lib/util.mjs'

export async function processRepoContributors (api, task) {
  const { repoURL } = task
  const key = `${repoURL}#contributors`
  let contributors = await getMaybe(api.repo, key)
  if (contributors) {
    return []
  }
  if (repoURL.startsWith(gitlabURL)) {
    contributors = await loadGitlabContributors(repoURL)
  }
  if (repoURL.startsWith(githubURL)) {
    contributors = await loadGithubContributors(repoURL)
  }
  if (!contributors) {
    throw new Error(`Can not load repo contributors for ${repoURL}`)
  }
  contributors = normalizePeople({
    contributor: contributors
  })
  return [
    { type: 'put', sublevel: api.repo, key, value: contributors },
    api.createTask({ type: 'repo-owner', repoURL })
  ]
}

async function loadGitlabContributors (repoURL) {
  const glRepo = getGitlabRepo(repoURL)
  const members = await fetchGitlabAPI(`projects/${encodeURIComponent(glRepo)}/members/all`)
  return members.map(member => ({ gitlab: member }))
}

async function loadGithubContributors (repoURL) {
  const ghRepo = getGithubRepo(repoURL)
  const contributors = await fetchGithubAPI(`repos/${ghRepo}/contributors`)
  return contributors.map(contributor => ({ github: contributor }))
}
