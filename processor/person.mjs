import { isGithubUser, isGitlabUser, isNpmUser, normalizeGitlabUser, parseGithubUser, parseGitlabUser } from '../lib/people.mjs'
import { fetchGithubAPI, fetchGitlabAPI } from '../lib/repo.mjs'
import { createRateLimiter, fetchJSDom, predictableObj, RateLimitError, resourceTaskProcessor } from '../lib/util.mjs'

export const person = resourceTaskProcessor(
  'person',
  api => api.people,
  (_api, type, { url }) => ({
    key: url,
    task: { type, url }
  }),
  async (api, _db, { url }) => {
    if (isGithubUser(url)) {
      return await fetchGithubUser(api, url)
    }
    if (isNpmUser(url)) {
      return await fetchNpmUser(api, url)
    }
    if (isGitlabUser(url)) {
      return await fetchGitlabUser(api, url)
    }
    throw new Error(`Unsupported person to look up: ${url}`)
  }
)

async function fetchGithubUser (api, url) {
  const login = parseGithubUser(url)
  const user = await fetchGithubAPI(api, `users/${login}`)
  return {
    value: predictableObj({
      github_url: url,
      github_type: user.type,
      name: user.name,
      company: user.company,
      description: user.bio,
      email: user.email,
      location: user.location,
      twitter_url: user.twitter_username ? `https://twitter.com/${user.twitter_username}` : undefined,
      html_url: user.html_url,
      avatar_url: user.avatar_url
    }),
    batch: []
  }
}

async function fetchGitlabUser (api, url) {
  // https://docs.gitlab.com/ee/api/users.html#single-user
  const user = await fetchGitlabAPI(api, `users/${encodeURIComponent(parseGitlabUser(url))}`)
  return {
    value: normalizeGitlabUser(user),
    batch: []
  }
}
const twitterPrefix = 'https://twitter.com/'

// 50 per second guessed through experiments...
const rateLimiter = createRateLimiter(50, 60000)
async function fetchNpmJSDom (api, url) {
  try {
    return await fetchJSDom(api, url, { rateLimiter })
  } catch (err) {
    if (err.res?.status === 429) {
      throw new RateLimitError(url, Date.now() + 5000)
    }
    throw err
  }
}

async function fetchNpmUser (api, url) {
  const dom = await fetchNpmJSDom(api, url)
  const { document } = dom.window
  const $name = document.querySelector('#main h2')
  const $el = $name?.parentNode?.parentNode
  if (!$el) {
    throw new Error('Cant find main node')
  }
  const batch = []
  let name
  if ($name.nextSibling?.nodeName === 'DIV') {
    name = $name.nextSibling.querySelector('div')?.innerHTML
  }
  const links = [...$el.querySelectorAll('a')].map(node => node.getAttribute('href')).filter(Boolean)
  const twitterUrl = links.find(url => url.startsWith(twitterPrefix))
  const githubUrl = links.find(url => url.startsWith('https://github.com/'))
  const avatar = $el.querySelector('img')?.getAttribute('src')
  if (githubUrl) {
    batch.push(...await person.createTask(api, { url: githubUrl }))
  }
  return {
    value: {
      name,
      npm: url,
      github_url: githubUrl,
      twitter_url: twitterUrl,
      avatar_url: avatar ? new URL(avatar, url).href : undefined
    },
    batch
  }
}
