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
    if (typeof entry.npm !== 'string') {
      throw new Error(`blessed.json entry#${index} is not a npm repository`)
    }
    return api.createTask({ type: 'blessed', ...entry })
  })
}
