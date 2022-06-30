import { person } from '../processor/person.mjs'
import { predictableObj, timeRandomID } from './util.mjs'

const ghUserURL = 'https://github.com/'
const glUserURL = 'https://gitlab.com/'
const npmUserURL = 'https://npmjs.com/~'

export function isGithubUser (url) {
  return url.startsWith(ghUserURL)
}

export function isNpmUser (url) {
  return url.startsWith(npmUserURL)
}

export function isGitlabUser (url) {
  return url.startsWith(glUserURL)
}

export function parseGithubUser (url) {
  return url.substring(ghUserURL.length)
}

export function parseGitlabUser (url) {
  return decodeURIComponent(url.substring(glUserURL.length))
}

export function gitlabGroupURL (groupId) {
  return gitlabUserURL(groupId)
}

export function githubUserURL (login) {
  return `${ghUserURL}${login}`
}

export function gitlabUserURL (userId) {
  return `${glUserURL}${encodeURIComponent(userId)}`
}

export function normalizeGitlabUser (user) {
  return predictableObj({
    gitlab: user.username,
    name: user.name,
    description: user.bio || undefined,
    pronouns: user.pronouns || undefined,
    company: user.organization || undefined,
    email: user.public_email || undefined,
    organization: user.organization || undefined,
    location: user.location || undefined,
    twitter: user.twitter || undefined,
    html_url: user.website_url || user.web_url || undefined,
    avatar_url: user.avatar_url || undefined
  })
}

export async function normalizePeople (api, peopleByTag) {
  const tagsForPeople = {}
  const batch = []
  for (const [tag, people] of Object.entries(peopleByTag)) {
    if (!Array.isArray(people)) {
      // There may be no contributors, resulting in an empty array.
      continue
    }
    for (const personRaw of people) {
      if (!personRaw) continue
      const parsed = normalizePerson(personRaw)
      if (!parsed) continue
      const id = personId(parsed)
      const tags = tagsForPeople[id]
      if (!tags) {
        tagsForPeople[id] = [tag]
      } else if (tags.indexOf(tag) === -1) {
        tags.push(tag)
      }
      for (const [key, value] of Object.entries(parsed)) {
        batch.push({ type: 'put', sublevel: api.people, key: `${id}#${key}`, value })
      }
      if (parsed.github_url) {
        batch.push(...await person.createTask(api, { url: parsed.github_url }))
      }
      if (parsed.gitlab_url) {
        batch.push(...await person.createTask(api, { url: parsed.gitlab_url }))
      }
      if (parsed.npm_url) {
        batch.push(...await person.createTask(api, { url: parsed.npm_url }))
      }
    }
  }
  return {
    value: Object.entries(tagsForPeople).map(([person, tags]) => ({ person, tags })),
    batch
  }
}

function personId (person) {
  if (person.email) {
    return `mailto://${person.email}`
  }
  if (person.github_url) {
    return person.github_url
  }
  if (person.gitlab_url) {
    return person.gitlab_url
  }
  if (person.npm_url) {
    return person.npm_url
  }
  if (person.name) {
    return `name://${encodeURI(person.name)}`
  }
  if (person.html_url) {
    return person.html_url
  }
  return `random://${timeRandomID()}`
}

function normalizePerson (person) {
  const parsed = _normalizePerson(person)
  if (!parsed) return null
  const { html_url: url } = parsed
  if (/^https:\/\/gitlab.com\/([^/]+)\/?$/.exec(url)) {
    parsed.gitlab_url = url
    delete parsed.html_url
  } else if (/^https:\/\/github.com\/([^/]+)$/.test(url)) {
    parsed.github_url = url
    delete parsed.html_url
  }
  if (parsed.npm) {
    parsed.npm_url = `https://npmjs.com/~${parsed.npm}`
    delete parsed.npm
  }
  return predictableObj(parsed)
}

function _normalizePerson (person) {
  if (!person) {
    return null
  }
  if (person.npmLogin) {
    if (typeof person.npmLogin === 'object') {
      return person.npmLogin
    }
    const parts = /^\s*([^<(]+)\s*(<([^>]+)>)?\s*/.exec(person.npmLogin)
    if (parts) {
      return {
        npm: parts[1]?.trim(),
        email: parts[3]?.trim()
      }
    }
  }
  if (person.npmFree) {
    if (typeof person.npmFree === 'object') {
      return {
        name: person.npmFree.name,
        email: person.npmFree.email,
        html_url: person.npmFree.url
      }
    }
    const parts = /^\s*([^<(]+)\s*(<([^>]+)>)?\s*(\(([^)]+)\))?\s*/.exec(person.npmFree)
    if (parts) {
      return {
        name: parts[1]?.trim(),
        email: parts[3]?.trim(),
        html_url: parts[5]?.trim()
      }
    }
  }
}
