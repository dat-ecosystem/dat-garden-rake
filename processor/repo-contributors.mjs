import pMap from 'p-map'
import { githubUserURL, gitlabUserURL, normalizeGitlabUser } from '../lib/people.mjs'
import { fetchGithubAPI, fetchGitlabAPI, getGithubRepo, getGitlabRepo, githubRepoURL, gitlabRepoURL } from '../lib/repo.mjs'
import { getOrCreate, plusMinusInt, resourceTaskProcessor } from '../lib/util.mjs'
import { person } from './person.mjs'

export const repoContributors = resourceTaskProcessor({
  type: 'repo-contributors',
  getDB: api => api.repos,
  getTaskDef (_api, type, { repoURL }) {
    return {
      key: `${repoURL}#contributors`,
      task: { type, repoURL }
    }
  },
  async create (api, _db, task) {
    const { repoURL } = task
    if (repoURL.startsWith(gitlabRepoURL)) {
      return await loadGitlabContributors(api, task, repoURL)
    }
    if (repoURL.startsWith(githubRepoURL)) {
      return await loadGithubContributors(api, repoURL)
    }
    throw new Error(`Can not load repo contributors for ${repoURL}`)
  }
})

const maxContributorAge = () => plusMinusInt(1000 * 60 * 60 * 24 * 7, 0.05) // One week

async function loadGitlabContributors (api, task, repoURL) {
  const glRepo = getGitlabRepo(repoURL)
  // TODO: paging
  // https://docs.gitlab.com/ee/api/members.html#list-all-members-of-a-group-or-project
  const members = await fetchGitlabAPI(api, `projects/${encodeURIComponent(glRepo)}/members/all?per_page=100&page=1`, {
    maxAge: maxContributorAge()
  })
  const result = {
    value: [],
    batch: []
  }
  await pMap(members, async member => {
    const key = gitlabUserURL(member.username)
    result.value.push({ person: key, tags: ['contributor'] })
    result.batch.push(...(await getOrCreate(api, api.people, key, task, async () => {
      return {
        value: normalizeGitlabUser(member),
        batch: []
      }
    })).batch)
  }, { concurrency: 10 })
  return result
}

async function loadGithubContributors (api, repoURL) {
  const ghRepo = getGithubRepo(repoURL)
  const contributors = await fetchGithubAPI(api, `repos/${ghRepo}/contributors`, {
    maxAge: maxContributorAge()
  })
  const result = {
    value: [],
    batch: []
  }
  for (const contributor of contributors) {
    const url = githubUserURL(contributor.login)
    result.value.push({ person: url, tags: ['contributor'] })
    result.batch.push(...await person.createTask(api, { url }))
  }
  return result
}
