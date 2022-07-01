import fs from 'fs/promises'

export const init = {
  type: 'init',
  async process (api, task) {
    const raw = await fs.readFile(task.options.blessedFile, 'utf-8')
    const blessed = JSON.parse(raw)
    if (!Array.isArray(blessed)) {
      throw new Error('blessed.json expect to contain an array')
    }
    return {
      batch: blessed.map((entry, index) => {
        if (typeof entry !== 'string') {
          throw new Error(`blessed.json entry#${index} is not a string ${entry} [${typeof entry}]`)
        }
        return api.createTask({ type: 'blessed', blessed: entry })
      })
    }
  }
}
