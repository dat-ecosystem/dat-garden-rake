import fs from 'fs/promises'
import path from 'path'
import { addURLToError, collect } from '../lib/util.mjs'

export const finalize = {
  type: 'finalize',
  async process (api, task) {
    const startTime = (await api.meta.get('start')).replace(/:/g, '').replace(/\./g, '_')
    await exportJSON(api, path.join(task.options.outFolder, startTime))
    return {
      batch: []
    }
  }
}

async function exportJSON (api, cwd) {
  await fs.mkdir(cwd, { recursive: true })
  await writeCollection(path.join(cwd, 'packages.json'), api.package)
  await writeCollection(path.join(cwd, 'repos.json'), api.repo, cleanRepos)
  await writeCollection(path.join(cwd, 'people.json'), api.people)
  await writeCollection(path.join(cwd, 'errors.json'), api.tasks)
  await writeCollection(path.join(cwd, 'meta.json'), api.meta)
}

function cleanRepos (repos) {
  for (const value of Object.values(repos)) {
    const owner = value.owner
    let people = []
    const contributors = value.contributors
    if (contributors) {
      delete value.contributors
      people = contributors
    }
    if (owner) {
      delete value.owner
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
    value.people = people
    value.package = Array.from(new Set(value.package))
  }
  return repos
}

async function writeCollection (path, collection, process) {
  let obj = await collect(collection)
  try {
    if (process) {
      obj = process(obj)
    }
    const json = JSON.stringify(obj, null, 2)
    await fs.writeFile(path, json)
  } catch (err) {
    console.log(obj)
    throw addURLToError(path, err)
  }
}
