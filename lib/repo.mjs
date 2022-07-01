/* global Headers */
import { repoContributors } from '../processor/repo-contributors.mjs'
import { repoOwner } from '../processor/repo-owner.mjs'

export const githubRepoURL = 'git+https://github.com/'
export function getGithubRepo (repoURL) {
  return repoURL.substring(githubRepoURL.length).split('/').slice(0, 2).join('/')
}
export function getGithubOwner (repoURL) {
  return repoURL.substring(githubRepoURL.length).split('/')[0]
}

export const gitlabRepoURL = 'git+https://gitlab.com/'
export function getGitlabRepo (repoURL) {
  if (repoURL.endsWith('.git')) {
    repoURL = repoURL.substring(0, repoURL.length - 4)
  }
  return repoURL.substring(gitlabRepoURL.length)
}

export async function fetchGitlabAPI (api, path, opts) {
  return await api.fetchJSON(`https://gitlab.com/api/v4/${path}`, {
    headers: new Headers({
      'PRIVATE-TOKEN': api.opts.token.gitlab
    })
  }, opts)
}

export async function fetchGithubAPI (api, path, opts) {
  return await api.fetchJSON(`https://api.github.com/${path}`, {
    headers: new Headers({
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${api.opts.token.github}`
    })
  }, opts)
}

export function isRepo (url) {
  if (!url) return false
  return url.startsWith(githubRepoURL) || url.startsWith(gitlabRepoURL)
}

export async function createRepoTasks (api, repoTask) {
  return [
    ...await repoContributors.createTask(api, repoTask),
    ...await repoOwner.createTask(api, repoTask)
  ]
}
