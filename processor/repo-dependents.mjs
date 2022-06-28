import { JSDOM } from 'jsdom'
import { normalizeNPM, npmURL } from '../lib/npm.mjs'
import { getGithubRepo, githubURL, gitlabURL } from '../lib/repo.mjs'
import { RateLimitError, resourceTaskProcessor } from '../lib/util.mjs'
import { npmPackage } from './npm-package.mjs'
import { repoOwner } from './repo-owner.mjs'

export const repoDependents = resourceTaskProcessor(
  'repo-dependents',
  api => api.repo,
  (_api, type, { repoURL }) => ({
    key: `${repoURL}#dependents`,
    task: { type, repoURL }
  }),
  async (api, _db, { repoURL }) => {
    let dependents
    if (repoURL.startsWith(githubURL)) {
      dependents = await loadGithubDependents(api, repoURL)
    }
    if (repoURL.startsWith(gitlabURL)) {
      // Gitlab doesn't support this, but we store an empty array anyways
      dependents = []
    }
    if (!dependents) {
      throw new Error(`Unsupported repository url: ${repoURL}`)
    }
    return {
      value: dependents,
      batch: [
        ...await createDependentTasks(api, dependents),
        ...await repoOwner.createTask(api, { repoURL })
      ]
    }
  }
)

async function loadGithubDependents (api, repoURL) {
  const ghRepo = getGithubRepo(repoURL)
  const dependentSet = new Set()
  let url = `https://github.com/${ghRepo}/network/dependents?dependent_type=PACKAGE`
  while (url) {
    if (api.signal.aborted) {
      throw new Error('Aborted.')
    }
    const next = await loadGithubDependentsPage(api, url, dependentSet)
    if (next === url) {
      break
    } else {
      url = next
    }
  }
  return Array.from(dependentSet)
}

async function loadGithubDependentsPage (api, url, dependentSet) {
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
  const el = document.getElementById('dependents')
  if (!el) {
    return
  }
  for (const $dependent of el.querySelectorAll('.Box-row')) {
    const span = $dependent.children[1]
    const isGHLink = span.getAttribute('data-repository-hovercards-enabled') === ''
    if (isGHLink) {
      const anchor = [...$dependent.querySelectorAll('a')].pop()
      dependentSet.add(new URL(anchor.getAttribute('href'), githubURL).href)
    } else {
      const text = span.textContent.trim()
      try {
        dependentSet.add(await normalizeNPM(api, text, '*'))
      } catch (e) {
        api.log(`Unexpected node: ${text}: ${e.stack}`)
      }
    }
  }
  const next = el.querySelector('.paginate-container a:nth-child(2)')
  if (next) {
    return next.getAttribute('href')
  }
}

async function createDependentTasks (api, dependents) {
  const batch = []
  for (const dependent of dependents) {
    if (dependent.startsWith(npmURL)) {
      batch.push(...await npmPackage.createTask(api, { url: dependent }))
    } else if (dependent.startsWith(githubURL) || dependent.startsWith(gitlabURL)) {
      batch.push(...await repoDependents.createTask(api, { repoURL: dependent }))
    }
  }
  return batch
}
