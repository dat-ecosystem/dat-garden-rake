import { githubUserURL } from './repo.mjs'
import { webcrypto as crypto } from 'crypto'
import { githubUser } from '../processor/github-user.mjs'

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
      const parsed = predictableObj(
        normalizePerson(personRaw)
      )
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
      if (parsed.github) {
        batch.push(...await githubUser.createTask(api, { login: parsed.github }))
      }
    }
  }
  return {
    value: Object.entries(tagsForPeople).map(([person, tags]) => ({ person, tags })),
    batch
  }
}

function predictableObj (input) {
  if (typeof input !== 'object' || input === null) {
    return input
  }
  if (Array.isArray(input)) {
    return input.map(predictableObj)
  }
  const obj = {}
  for (const key of Object.keys(input).sort()) {
    const value = input[key]
    if (value === undefined || value === null) {
      continue
    }
    obj[key] = typeof value === 'object' ? predictableObj(value) : value
  }
  return obj
}

function personId (person) {
  if (person.email) {
    return `mailto://${person.email}`
  }
  if (person.github) {
    return githubUserURL(person.github)
  }
  if (person.npm) {
    return `https://npmjs.com/~${person.npm}`
  }
  if (person.name) {
    return `name://${encodeURI(person.name)}`
  }
  if (person.html_url) {
    return person.htm_url
  }
  return `random://${crypto.randomUUID()}`
}

export function normalizePerson (person) {
  if (!person) {
    return null
  }
  if (person.gitlab) {
    const { gitlab } = person
    return {
      gitlab: gitlab.username,
      name: gitlab.name,
      html_url: gitlab.web_url,
      avatar_url: gitlab.avatar
    }
  }
  if (person.github) {
    const { github: user } = person
    return {
      github: user.login,
      github_type: user.type,
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
        url: person.npmFree.url
      }
    }
    const parts = /^\s*([^<(]+)\s*(<([^>]+)>)?\s*(\(([^)]+)\))?\s*/.exec(person.npmFree)
    if (parts) {
      return {
        name: parts[1]?.trim(),
        email: parts[3]?.trim(),
        url: parts[5]?.trim()
      }
    }
  }
}
