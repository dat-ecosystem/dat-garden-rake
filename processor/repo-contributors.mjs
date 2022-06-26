/* global Headers */
import { normalizePeople } from '../lib/people.mjs'
import { getGithubRepo, getGitlabRepo, githubURL, gitlabURL } from '../lib/repo.mjs'
import { addURLToError, getMaybe, RateLimitError } from '../lib/util.mjs'

export async function processRepoContributors (api, task) {
  const { repoURL } = task
  const key = `${repoURL}#contributors`
  let contributors = await getMaybe(api.repo, key)
  if (contributors) {
    return []
  }
  if (repoURL.startsWith(gitlabURL)) {
    contributors = await loadGitlabContributors(repoURL)
  }
  if (repoURL.startsWith(githubURL)) {
    contributors = await loadGithubContributors(repoURL)
  }
  if (!contributors) {
    throw new Error(`Can not load repo contributors for ${repoURL}`)
  }
  contributors = normalizePeople({
    contributor: contributors
  })
  return [
    { type: 'put', sublevel: api.repo, key, value: contributors }
  ]
}

async function loadGitlabContributors (repoURL) {
  const glRepo = getGitlabRepo(repoURL)
  const members = await fetchJSON(`https://gitlab.com/api/v4/projects/${encodeURIComponent(glRepo)}/members/all`, {
    headers: new Headers({
      'PRIVATE-TOKEN': process.env.GITLAB_TOKEN
    })
  })
  return members.map(member => ({ gitlab: member }))
}

async function loadGithubContributors (repoURL) {
  const ghRepo = getGithubRepo(repoURL)
  const contributors = await fetchJSON(`https://api.github.com/repos/${ghRepo}/contributors`, {
    headers: new Headers({
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${process.env.GITHUB_TOKEN}`
    })
  })
  return contributors.map(contributor => ({ github: contributor }))
}

async function fetchJSON (url, headers) {
  try {
    const res = await fetch(url, headers)
    const txt = await res.text()
    if (res.status === 429) {
      // Too many requests
      throw new RateLimitError(url, res.headers.get('x-ratelimit-reset'))
    }
    if (res.status !== 200) {
      throw new Error(`[HTTPStatus=${res.status}] ${txt}`)
    }
    try {
      return JSON.parse(txt)
    } catch (err) {
      throw new Error(`JSON parse error: ${err.message}\n${txt}`)
    }
  } catch (err) {
    throw addURLToError(url, err)
  }
}
