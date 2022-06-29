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
    // https://docs.github.com/en/rest/users/users#get-a-user
    const user = await fetchGithubAPI(`users/${login}`)
    return {
      value: {
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
      },
      batch: []
    }
  }
)
