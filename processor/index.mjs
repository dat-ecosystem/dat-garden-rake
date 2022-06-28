import { blessed } from './blessed.mjs'
import { dependency } from './dependency.mjs'
import { dependentInfo } from './dependent-info.mjs'
import { finalize } from './finalize.mjs'
import { init } from './init.mjs'
import { npmPackage } from './npm-package.mjs'
import { repoContributors } from './repo-contributors.mjs'
import { repoDependents } from './repo-dependents.mjs'
import { repoOwner } from './repo-owner.mjs'

export const processors = [
  blessed,
  init,
  dependency,
  dependentInfo,
  finalize,
  npmPackage,
  repoContributors,
  repoDependents,
  repoOwner
].reduce((all, processor) => {
  all[processor.type] = processor.process
  return all
}, {})
