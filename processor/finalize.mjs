import fs from 'fs/promises'
import path from 'path'
import { addURLToError, collect } from '../lib/util.mjs'

export async function processFinalize (api, task) {
  const startTime = (await api.meta.get('start')).replace(/:/g, '').replace(/\./g, '_')
  await exportJSON(api, path.join(task.options.outFolder, startTime))
  return []
}

async function exportJSON (api, cwd) {
  await fs.mkdir(cwd, { recursive: true })
  await writeCollection(path.join(cwd, 'packages.json'), api.package)
  await writeCollection(path.join(cwd, 'repos.json'), api.repo)
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
