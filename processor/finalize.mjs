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
  await writeCollection(path.join(cwd, 'repos.json'), api.repo)
  await writeCollection(path.join(cwd, 'people.json'), api.people)
  await writeCollection(path.join(cwd, 'errors.json'), api.tasks)
  await writeCollection(path.join(cwd, 'meta.json'), api.meta)
}

async function writeCollection (path, collection) {
  const obj = await collect(collection)
  try {
    const json = JSON.stringify(obj, null, 2)
    await fs.writeFile(path, json)
  } catch (err) {
    console.log(obj)
    throw addURLToError(path, err)
  }
}
