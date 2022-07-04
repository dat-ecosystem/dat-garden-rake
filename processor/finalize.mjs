import fs from 'fs/promises'
import path from 'path'
import { reduceRawData } from '../lib/reduce.mjs'
import { addURLToError, predictableObj } from '../lib/util.mjs'

export const finalize = {
  type: 'finalize',
  async process (api, task) {
    const subDir = cleanDate(await api.meta.get('start'))
    const isHistory = api.opts.outMode === 'history'
    const exportPath = isHistory ? path.join(task.options.outFolder, subDir) : task.options.outFolder
    await exportJSON(api, exportPath, api.opts)
    if (isHistory) {
      await updateIndex(task.options.outFolder, path.join(subDir, 'index.json'))
    }
    return {
      batch: []
    }
  }
}

async function updateIndex (outFolder, metaPath) {
  const indexPath = path.join(outFolder, 'index.json')
  let index
  try {
    index = JSON.parse(await fs.readFile(indexPath))
  } catch (e) {
    index = {
      history: []
    }
  }
  index.latest = metaPath
  index.history.push(metaPath)
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2))
}

function cleanDate (date) {
  return String(date).replace(/:/g, '').replace(/\./g, '_')
}

async function exportJSON (api, cwd, opts) {
  const raw = path.join(cwd, 'raw')
  await fs.mkdir(raw, { recursive: true })
  await writeJSON(path.join(raw, 'errors.json'), extractErrorTasks(await collect(api.tasks)))
  const [packages, repos, people] = await Promise.all([
    collect(api.packages),
    collect(api.repos).then(cleanRepos),
    collect(api.people)
  ])
  await writeJSON(path.join(raw, 'packages.json'), packages)
  await writeJSON(path.join(raw, 'repos.json'), repos)
  await writeJSON(path.join(raw, 'people.json'), people)
  const { organizations, projects, valueNetwork } = reduceRawData({ packages, repos, people })
  await writeJSON(path.join(cwd, 'organizations.json'), organizations)
  await writeJSON(path.join(cwd, 'projects.json'), projects)
  await writeJSON(path.join(cwd, 'valuenetwork.json'), valueNetwork)

  const index = {
    ...await collect(api.meta),
    exported: new Date().toISOString(),
    files: {
      'index.json': '(this file) Information about the run (start, blessed input, etc.)',
      'organizations.json': 'All users/organizations found for projects (combined/normalized)',
      'projects.json': 'All projects (repos or npm packages) found',
      'raw/errors.json': 'Errors that occurred during the run',
      'raw/packages.json': 'NPM package related information collected during the run',
      'raw/people.json': 'Lookup table of organizations or individuals linked in packages/repos',
      'raw/repos.json': 'Repository related information collected during the run',
      'valuenetwork.json': 'Relationships between projects, other projects and organizations'
    }
  }
  if (opts.skipTimes) {
    delete index.end
    delete index.exported
    delete index.lastModified
    delete index.start
  }
  await writeJSON(path.join(cwd, 'index.json'), predictableObj(index))
}

async function collect (db) {
  const result = {}
  for await (const [key, value] of db.iterator()) {
    const parts = /(.+?)((#|!!)(.+?))?(\+[a-f0-9-]+)?$/.exec(key)
    const namespace = parts[1]
    const property = parts[4]
    if (!property) {
      result[namespace] = value
      continue
    }
    let entry = result[namespace]
    if (!entry) {
      entry = {}
      result[namespace] = entry
    }
    if (parts[5] /* + */) {
      let arr = entry[property]
      if (!arr) {
        arr = []
        entry[property] = arr
      }
      if (Array.isArray(value)) {
        arr.push(...value)
      } else {
        arr.push(value)
      }
    } else {
      entry[property] = value
    }
  }
  return result
}

function extractErrorTasks (tasks) {
  return Object
    .values(tasks)
    .filter(task => task.errors).map(task => {
      const { id, errors, ...rest } = task
      rest.error = errors.pop()
      return rest
    })
    .sort((a, b) => {
      if (a.error > b.error) return 1
      if (a.error < b.error) return -1
      if (a.type > b.type) return 1
      if (a.type < b.type) return -1
      for (const key of Object.keys(a).sort()) {
        if (key === 'error' || key === 'type') continue
        if (a[key] > b[key]) return 1
        if (a[key] < b[key]) return -1
      }
      return 0
    })
}

function cleanRepos (repos) {
  for (const repo of Object.values(repos)) {
    const owner = repo.owner
    let people = []
    const contributors = repo.contributors
    if (contributors) {
      delete repo.contributors
      people = contributors
    }
    if (owner) {
      delete repo.owner
      const existing = people.find(({ person }) => person === owner)
      if (existing) {
        if (!existing.tags) {
          throw new Error(`existing ${owner} ${JSON.stringify(existing)}`)
        }
        existing.tags.push('owner')
      } else {
        people.push({
          person: owner,
          tags: ['owner']
        })
      }
    }
    repo.people = people
    repo.package = repo.package ? Array.from(new Set(repo.package)) : []
  }
  return repos
}

async function writeJSON (path, obj) {
  try {
    const json = JSON.stringify(obj, null, 2)
    await fs.writeFile(path, json)
  } catch (err) {
    throw addURLToError(path, err)
  }
}
