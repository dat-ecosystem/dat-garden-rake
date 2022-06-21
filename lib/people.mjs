import mergeWith from 'lodash.mergewith'

export function normalizePeople (peopleByTag) {
  const personInfoByKey = {}
  const personInfoByEmail = {}
  const personInfoByURL = {}
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
      const key = JSON.stringify(parsed)
      let personInfo = mergeWithArray(personInfoByKey[key], { person: parsed, tags: [tag], key })
      personInfo = mergeWithArray(personInfo.person.email ? personInfoByEmail[personInfo.person.email] : null, personInfo)
      personInfo = mergeWithArray(personInfo.person.url ? personInfoByEmail[personInfo.person.url] : null, personInfo)
      personInfoByKey[key] = personInfo
      if (personInfo.person.email) {
        personInfoByEmail[personInfo.person.email] = personInfo
      }
      if (personInfo.person.url) {
        personInfoByURL[personInfo.person.url] = personInfo
      }
    }
  }
  return Object.values(personInfoByKey).map(({ person, tags }) => ({ person, tags }))
}

function mergeArray (obj, src) {
  if (Array.isArray(obj)) {
    return obj.concat(src)
  }
}

function mergeWithArray (...args) {
  return mergeWith(...args, mergeArray)
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

function normalizePerson (person) {
  if (person.gitlab) {
    const { username: gitlab, name, web_url: url, avatar_url: avatar } = person.gitlab
    return {
      gitlab,
      name,
      url,
      avatar
    }
  }
  if (person.github) {
    if (person.github.type !== 'User') return
    const { login: github, html_url: url, avatar_url: avatar } = person.github
    return {
      github,
      url,
      avatar
    }
  }
  if (person.npmLogin) {
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
