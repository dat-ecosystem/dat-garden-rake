import { fetchGitlabAPI, gitlabGroupURL } from '../lib/repo.mjs'
import { resourceTaskProcessor } from '../lib/util.mjs'

export const gitlabGroup = resourceTaskProcessor(
  'gitlab-group',
  api => api.people,
  (_api, type, { group }) => ({
    key: gitlabGroupURL(group),
    task: { type, group }
  }),
  async (_api, _db, task) => {
    // https://docs.gitlab.com/ee/api/groups.html#details-of-a-group
    const group = await fetchGitlabAPI(`groups/${encodeURIComponent(task.group)}`)
    return {
      value: {
        type: 'gitlab',
        user: group.path_with_namespace,
        name: group.name,
        company: null,
        description: group.description,
        email: null,
        location: null,
        twitter: null,
        html_url: group.web_url,
        avatar_url: group.avatar_url
      },
      batch: []
    }
  }
)
