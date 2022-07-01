import { execa } from 'execa'
import fs from 'fs/promises'
import pkg from '../package.json' assert { type: 'json' }

export const init = {
  type: 'init',
  async process (api, task) {
    const raw = await fs.readFile(task.options.blessedFile, 'utf-8')
    const blessed = JSON.parse(raw)
    if (!Array.isArray(blessed)) {
      throw new Error('blessed.json expect to contain an array')
    }
    const [commit, status] = (await Promise.all([
      execa('git', ['rev-parse', 'HEAD']),
      execa('git', ['status', '--short'])
    ])).map(res => res.stdout)
    return {
      batch: [
        { type: 'put', sublevel: api.meta, key: 'crawler', value: `${pkg.name}@${pkg.version}` },
        { type: 'put', sublevel: api.meta, key: 'maxDepth', value: api.opts.maxDepth },
        { type: 'put', sublevel: api.meta, key: 'maxRetries', value: api.opts.maxRetries },
        { type: 'put', sublevel: api.meta, key: 'git#commit', value: commit },
        { type: 'put', sublevel: api.meta, key: 'git#status', value: status },
        ...blessed.map((entry, index) => {
          if (typeof entry !== 'string') {
            throw new Error(`blessed.json entry#${index} is not a string ${entry} [${typeof entry}]`)
          }
          return api.createTask({ type: 'blessed', blessed: entry })
        })
      ]
    }
  }
}
