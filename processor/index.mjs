import { processBlessed } from './blessed.mjs'
import { processDependency } from './dependency.mjs'
import { processDependentInfo } from './dependent-info.mjs'
import { processFinalize } from './finalize.mjs'
import { processInit } from './init.mjs'
import { processRepoContributors } from './repo-contributors.mjs'
import { processRepoDependents } from './repo-dependents.mjs'

export const processors = {
  blessed: processBlessed,
  init: processInit,
  dependency: processDependency,
  'dependent-info': processDependentInfo,
  finalize: processFinalize,
  'repo-contributors': processRepoContributors,
  'repo-dependents': processRepoDependents
}
