import { createNpmUrl, normalizeNPM, parseNpmUrl } from '../lib/npm.mjs'
import { fetchJSDom, plusMinusInt, resourceTaskProcessor } from '../lib/util.mjs'
import { npmPackage } from './npm-package.mjs'

function depUrl (name) {
  return `https://www.npmjs.com/browse/depended/${name}`
}

export const npmDependents = resourceTaskProcessor({
  type: 'npm-dependents',
  getDB: api => api.packages,
  getTaskDef (_api, type, { name, version, depth, page, url }) {
    return {
      key: `${createNpmUrl(name, version)}#dependents+${page}`,
      task: { type, name, version, depth: depth ?? 0, page: page ?? 0, url: url ?? depUrl(name) }
    }
  },
  async create (api, _db, { name, version, depth, page, url }) {
    const dom = await fetchJSDom(api, url, {
      maxAge: plusMinusInt(1000 * 60 * 60 * 24 * 7, 0.05) // One week seems good
    })
    const { document } = dom.window
    const dependents = []
    const batch = []
    if (page === 0) {
      const { value: pkg, batch: npmBatch } = await npmPackage.process(api, { url: createNpmUrl(name, version) })
      batch.push(
        ...npmBatch
      )
      if (pkg.repository) {
        // batch.push(...await repoDependents.createTask(api, { repoURL: pkg.repository, depth }))
      }
    }
    for (const $name of document.querySelectorAll('#main ul h3')) {
      const href = new URL($name.parentNode.getAttribute('href'), url).href
      try {
        const { name: depName } = parseNpmUrl(href)
        const depUrl = await normalizeNPM(api, depName, '*')
        const { version: depVersion } = parseNpmUrl(depUrl)
        dependents.push(depUrl)
        batch.push(
          ...await npmPackage.createTask(api, { url: depUrl }),
          ...await npmDependents.createTask(api, {
            name: depName,
            version: depVersion,
            depth: depth + 1,
            offset: 0
          })
        )
      } catch (err) {
        // todo proper warning please!
        console.log(err.stack)
      }
    }
    const baseURL = depUrl(name)
    for (const $link of document.querySelectorAll('#main a')) {
      try {
        const href = $link.getAttribute('href')
        if (href.startsWith(baseURL) && $link.innerText.trim() === 'Next Page') {
          batch.push(...await npmDependents.createTask(api, { name, version, depth, page: page + 1, url: href }))
          break
        }
      } catch (err) {
        console.log(err.stack)
      }
    }
    return {
      value: dependents,
      batch
    }
  },
  validateTask (api, task) {
    return task.depth <= api.opts.maxDepth
  }
})
