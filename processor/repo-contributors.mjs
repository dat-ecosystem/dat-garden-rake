import { normalizePeople } from '../lib/people.mjs'
import { fetchGithubAPI, fetchGitlabAPI, getGithubRepo, getGitlabRepo, githubURL, gitlabURL } from '../lib/repo.mjs'
import { resourceTaskProcessor } from '../lib/util.mjs'

export const repoContributors = resourceTaskProcessor(
  'repo-contributors',
  api => api.repo,
  (_api, type, { repoURL }) => ({
    key: `${repoURL}#contributors`,
    task: { type, repoURL }
  }),
  async (api, _db, { repoURL }) => {
    let contributors
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
    return {
      value: contributors,
      batch: []
    }
  }
)

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
