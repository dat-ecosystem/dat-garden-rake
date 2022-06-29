import { normalizePerson } from '../lib/people.mjs'
import { fetchGithubAPI, githubUserURL } from '../lib/repo.mjs'
import { resourceTaskProcessor } from '../lib/util.mjs'

export const githubUser = resourceTaskProcessor(
  'github-user',
  api => api.people,
  (_api, type, { login }) => ({
    key: githubUserURL(login),
    task: { type, login }
  }),
  async (_api, _db, { login }) => {
    return {
      value: normalizePerson({
        github: await fetchGithubAPI(`users/${login}`)
      }),
      batch: []
    }
  }
)
