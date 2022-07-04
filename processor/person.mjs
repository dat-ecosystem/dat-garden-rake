import { fetchNpmJSDom } from '../lib/npm.mjs'
import { isGithubUser, isGitlabUser, isNpmUser, normalizeGitlabUser, parseGithubUser, parseGitlabUser } from '../lib/people.mjs'
import { fetchGithubAPI, fetchGitlabAPI } from '../lib/repo.mjs'
import { plusMinusInt, predictableObj, resourceTaskProcessor } from '../lib/util.mjs'

export const person = resourceTaskProcessor({
  type: 'person',
  getDB: api => api.people,
  getTaskDef (_api, type, { url }) {
    return {
      key: url,
      task: { type, url }
    }
  },
  async create (api, _db, { url }) {
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
})

const maxUserAge = () => plusMinusInt(1000 * 60 * 60 * 24 * 30, 0.05) // 1 month

async function fetchGithubUser (api, url) {
  const login = parseGithubUser(url)
  const user = await fetchGithubAPI(api, `users/${login}`, {
    maxAge: maxUserAge()
  })
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
  const user = await fetchGitlabAPI(api, `users/${encodeURIComponent(parseGitlabUser(url))}`, {
    maxAge: maxUserAge()
  })
  return {
    value: normalizeGitlabUser(user),
    batch: []
  }
}

const twitterPrefix = 'https://twitter.com/'

async function fetchNpmUser (api, url) {
  const dom = await fetchNpmJSDom(api, url, {
    maxAge: maxUserAge()
  })
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
      npm_url: url,
      github_url: githubUrl,
      twitter_url: twitterUrl,
      avatar_url: avatar ? new URL(avatar, url).href : undefined
    },
    batch
  }
}
