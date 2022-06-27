import fs from 'fs/promises'

export async function processInit (api, task) {
  const raw = await fs.readFile(task.options.blessedFile, 'utf-8')
  const blessed = JSON.parse(raw)
  if (!Array.isArray(blessed)) {
    throw new Error('blessed.json expect to contain an array')
  }
  return blessed.map((entry, index) => {
    if (typeof entry !== 'object') {
      throw new Error(`blessed.json entry#${index} is not an object ${entry} [${typeof entry}]`)
    }
    if (typeof entry.npm !== 'string' && typeof entry.repoURL !== 'string') {
      throw new Error(`blessed.json entry#${index} is not an object of type { npm: 'name' [, version: '1.1.0' ] } or { repoURL: '...' }: ${JSON.stringify(entry, null, 2)}`)
    }
    return api.createTask({ type: 'blessed', ...entry })
  })
}
