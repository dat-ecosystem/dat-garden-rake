import { getGithubRepo, getMaybe, githubURL, gitlabURL, RateLimitError } from './util.mjs'
import { JSDOM } from 'jsdom'
import { npmURL } from './npm.mjs'

function dependentKey (url) {
  return `${url}#dependents`
}

export async function loadRepoDependents (api, repoURL) {
  const key = dependentKey(repoURL)
  let dependents = await getMaybe(api.repo, key)
  if (dependents) {
    return []
  }
  if (repoURL.startsWith(githubURL)) {
    dependents = await loadGithubDependents(repoURL)
  }
  if (repoURL.startsWith(gitlabURL)) {
    // Gitlab doesn't support this, but we store an empty array anyways
    dependents = []
  }
  if (!dependents) {
    throw new Error(`Unsupported repository url: ${repoURL}`)
  }
  return [
    { type: 'put', sublevel: api.repo, key, value: dependents },
    ...await createDependentTasks(api, dependents)
  ]
}

async function createDependentTasks (api, dependents) {
  const entries = await api.repo.getMany(dependents.map(dependentKey))
  return Object.entries(entries)
    .filter(([_index, entry]) => entry === undefined)
    .map(([index]) => api.createTask({ type: 'dependent-info', dependent: dependents[index] }))
}

async function loadGithubDependents (repoURL) {
  const ghRepo = getGithubRepo(repoURL)
  const url = `https://github.com/${ghRepo}/network/dependents?dependent_type=PACKAGE`
  const res = await fetch(url)
  if (res.status === 429) {
    const retryTime = parseInt(res.headers.get('retry-after'), 10) * 1000 + Date.now()
    throw new RateLimitError(url, retryTime)
  }
  if (res.status !== 200) {
    throw new Error(`HTTP STATUS=${res.status} while requesting repo.`)
  }
  const jsdom = new JSDOM(await res.text())
  const document = jsdom.window.document
  const [el] = document.querySelectorAll('#dependents')
  return [...new Set(
    [...el ? el.querySelectorAll('.Box-row') : []]
      .map($dependent => {
        const span = $dependent.children[1]
        const isGHLink = span.getAttribute('data-repository-hovercards-enabled') === ''
        if (isGHLink) {
          const anchor = [...$dependent.querySelectorAll('a')].pop()
          return new URL(anchor.getAttribute('href'), githubURL).href
        }
        return `${npmURL}${span.textContent.trim()}`
      })
  )]
}
