/* global Headers */
import { fetchJSON } from './util.mjs'

export const githubURL = 'git+https://github.com/'
export function getGithubRepo (repoURL) {
  return repoURL.substring(githubURL.length).split('/').slice(0, 2).join('/')
}
export function getGithubOwner (repoURL) {
  return repoURL.substring(githubURL.length).split('/')[0]
}

export const gitlabURL = 'git+https://gitlab.com/'
export function getGitlabRepo (repoURL) {
  if (repoURL.endsWith('.git')) {
    repoURL = repoURL.substring(0, repoURL.length - 4)
  }
  return repoURL.substring(gitlabURL.length)
}

export function githubUserURL (login) {
  return `${githubURL}${login}`
}

export function gitlabGroupURL (groupId) {
  return `${gitlabURL}/${encodeURIComponent(groupId)}`
}

export async function fetchGitlabAPI (path) {
  return await fetchJSON(`https://gitlab.com/api/v4/${path}`, {
    headers: new Headers({
      'PRIVATE-TOKEN': process.env.GITLAB_TOKEN
    })
  })
}

export async function fetchGithubAPI (path) {
  return await fetchJSON(`https://api.github.com/${path}`, {
    headers: new Headers({
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${process.env.GITHUB_TOKEN}`
    })
  })
}

export function isRepo (url) {
  if (!url) return false
  return url.startsWith(githubURL) || url.startsWith(gitlabURL)
}
