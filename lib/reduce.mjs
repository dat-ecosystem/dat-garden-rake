import { isGithubUser, isGitlabUser, isNpmUser } from '../lib/people.mjs'
import merge from 'lodash.merge'

export function reduceRawData ({ packages, repos, people }) {
  const reducedPeople = reducePeople(people)
  const projects = {}
  const valueNetwork = {}
  const organizations = {}
  const usedRepos = new Set()
  const foundPeople = new Set()
  for (const [url, pkg] of Object.entries(packages)) {
    const { dependents, dependencies, people, ...rest } = pkg
    projects[url] = rest
    const repo = repos[pkg.repository]
    if (repo) {
      usedRepos.add(pkg.repository)
    }
    const person = findPerson(repo?.people, 'owner') ?? findPerson(people, 'maintainer')
    const owner = reducedPeople[person]?.url
    if (owner) {
      foundPeople.add(owner)
    }
    valueNetwork[url] = {
      dependents,
      // Only list dependencies that show up in the list
      dependencies: dependencies.filter(dependency => packages[dependency]),
      owner
    }
  }
  for (const [url, repo] of Object.entries(repos)) {
    if (usedRepos.has(url)) {
      continue
    }
    // We don't have any information on repository-only projects at the moment!
    // still we list them!
    projects[url] = {}
    const owner = reducedPeople[findPerson(repo.people, 'owner')]?.url
    if (owner) {
      foundPeople.add(owner)
    }
    valueNetwork[url] = {
      dependents: [],
      dependencies: [],
      owner
    }
  }
  for (const personUrl of foundPeople) {
    const reducedPerson = reducedPeople[personUrl]
    organizations[reducedPerson.url] = reducedPerson.person
  }
  return { projects, valueNetwork, organizations }
}

function reducePeople (people) {
  const reducedPeople = {}
  let allEntries = Array.from(Object.entries(people)).map(([url, person]) => ({ url, person }))

  while (allEntries.length > 0) {
    const entry = allEntries.shift()
    const preCombined = [entry]
    const { url } = entry
    preCombined.push(...allEntries.filter(({ url: otherUrl, person }, index) => {
      if (otherUrl === url) {
        throw new Error('wut?')
      }
      if (
        person.github_url === url ||
        person.gitlab_url === url ||
        person.npm_url === url
      ) {
        allEntries[index] = null
        return true
      }
      return false
    }))
    // Delete combined entries from list!
    allEntries = allEntries.filter(Boolean)

    const emails = preCombined.reduce((emails, { person }) => {
      if (person.email) {
        emails.add(person.email)
      }
      return emails
    }, new Set())

    preCombined.push(...allEntries.filter(({ person }, index) => {
      if (emails.has(person.email)) {
        allEntries[index] = null
        return true
      }
      return false
    }))
    allEntries = allEntries.filter(Boolean)

    const sorted = preCombined.sort(sortPersons)
    const reducedPerson = {
      url: sorted[0].url,
      person: merge({}, ...sorted.reverse().map(({ person }) => person))
    }
    for (const { url } of preCombined) {
      reducedPeople[url] = reducedPerson
    }
  }
  return reducedPeople
}

function sortPersons (a, b) {
  const aWeight = weightOfPerson(a)
  const bWeight = weightOfPerson(b)
  if (aWeight > bWeight) return 1
  if (aWeight < bWeight) return -1
  return 0
}

function weightOfPerson (entry) {
  const prefix = isNpmUser(entry.url)
    ? '0'
    : isGithubUser(entry.url)
      ? '1'
      : isGitlabUser(entry.url)
        ? '2'
        : entry.person.email
          ? '3'
          : '4'
  return `${prefix}_${entry.url}`
}

function findPerson (people, tag) {
  if (!people) {
    return null
  }
  const found = people.find(person => person.tags.includes(tag))?.person ?? null
  if (found === '<unknown>') {
    return null
  }
  return found
}
