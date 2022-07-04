import { normalizeNPM } from '../lib/npm.mjs'
import { createRepoTasks, getGithubRepo, githubRepoURL, gitlabRepoURL } from '../lib/repo.mjs'
import { fetchJSDom, plusMinusInt, resourceTaskProcessor, timeRandomID } from '../lib/util.mjs'
import { dependentInfo } from './dependent-info.mjs'

export const repoDependents = resourceTaskProcessor({
  type: 'repo-dependents',
  getDB: api => api.repos,
  getTaskDef (_api, type, { repoURL, depth, pageId, page }) {
    return {
      key: `${repoURL}#dependents+${pageId ?? 0}`,
      task: { type, repoURL, depth: depth ?? 0, pageId, page }
    }
  },
  async create (api, _db, { repoURL, depth, page }) {
    let dependents
    const batch = []
    if (repoURL.startsWith(githubRepoURL)) {
      const github = await loadGithubDependents(api, repoURL, page)
      dependents = github.dependents
      if (github.page) {
        batch.push(...await repoDependents.createTask(api, { repoURL, depth, pageId: timeRandomID(), page: github.page }))
      }
    }
    if (repoURL.startsWith(gitlabRepoURL)) {
      // Gitlab doesn't support this, but we store an empty array anyways
      dependents = []
    }
    if (!dependents) {
      throw new Error(`Unsupported repository url: ${repoURL}`)
    }
    return {
      value: dependents,
      batch: [
        ...batch,
        ...await dependentInfo.createTasks(api, dependents.map(dependent => ({ dependent, depth: depth + 1 }))),
        ...await createRepoTasks(api, { repoURL })
      ]
    }
  }
})

async function loadGithubDependents (api, repoURL, page) {
  const url = page ?? `https://github.com/${getGithubRepo(repoURL)}/network/dependents?dependent_type=PACKAGE`
  return await loadGithubDependentsPage(api, url)
}

async function verifyGithubDependent (api, dependentURL, repoURL) {
  //
  // Github does occasionaly list dependents that have no relationship to
  // a repository. In order to make sure that we don't accidentally catch a dependency
  // we do the counter-check where we also look if the repository shows up
  // as dependency of the dependent.
  //
  // Example of broken dependent/dependency:
  // - https://github.com/hypercore-protocol/hypercore-streams/network/dependents?dependent_type=PACKAGE (npm-run-path listed)
  //   (screenshot: https://i.gyazo.com/46028e8105763f5ade2e9582e712ddad.png)
  // - https://github.com/sindresorhus/npm-run-path/network/dependencies (no hyperdrive-streams listed ?!)
  //   (screenshot: https://i.gyazo.com/1f6b6333807ecf9b41528b44b54f4d65.png)
  //
  const ghRepo = getGithubRepo(dependentURL)
  const url = `https://github.com/${ghRepo}/network/dependencies`
  // Once a dependency is found/established it
  const jsdom = await fetchJSDom(api, url, { expires: 'never' })
  const { document } = jsdom.window
  const el = document.getElementById('dependencies')
  if (!el) {
    return false
  }
  if (findDependency(el, repoURL, url)) {
    return true
  }
  for (const $more of el.querySelectorAll('#dependencies form')) {
    const more = new URL(await $more.getAttribute('action'), url)
    const res = await (more)
    if (findDependency(res.window.document, repoURL, more)) {
      return true
    }
  }
  return false
}

function findDependency (el, repoURL, url) {
  for (const $dependency of el.querySelectorAll('[data-octo-click="dep_graph_package"][data-hovercard-type="repository"]')) {
    const found = `git+${new URL($dependency.getAttribute('href'), url).href}`
    if (found === repoURL) {
      return true
    }
  }
  return false
}

async function loadGithubDependentsPage (api, url) {
  const jsdom = await fetchJSDom(api, url, { maxAge: plusMinusInt(1000 * 60 * 60 * 24 * 14, 0.05) /* 2 weeks */ })
  const { document } = jsdom.window
  const el = document.getElementById('dependents')
  const result = {
    dependents: [],
    page: null
  }
  if (!el) {
    return result
  }
  for (const $dependent of el.querySelectorAll('.Box-row')) {
    const span = $dependent.children[1]
    const isGHLink = span.getAttribute('data-repository-hovercards-enabled') === ''
    if (isGHLink) {
      const anchor = [...$dependent.querySelectorAll('a')].pop()
      const dependentURL = new URL(anchor.getAttribute('href'), githubRepoURL).href
      if (await verifyGithubDependent(dependentURL, url)) {
        result.dependents.push(dependentURL)
      }
    } else {
      const text = span.textContent.trim()
      try {
        result.dependents.push(await normalizeNPM(api, text, '*'))
      } catch (e) {
        api.log(`Unexpected node: ${text}: ${e.stack}`)
      }
    }
  }
  const next = el.querySelector('.paginate-container a:nth-child(2)')
  if (next) {
    result.page = next.getAttribute('href')
  }
  return result
}
