# dat-garden-rake

A rake to collect all the leaves in the garden.

## About

A helpful script to collect all repositories and packages that have a relationship to the
dat-ecosystem and present them as .json files.

## Usage

Run the dat-garden-rake like below:

```bash
$ dat-garden-rake [...options]

--force-restart ..... Force restarting the run
--skip-restart ...... Never restart the run
--retry ............. removes all errors from existing tasks
--help, -h .......... show this help
--out, -o ........... output folder (default=./out)
--state, -s ......... state folder (default=./state)
--cache ............. cache folder (default=./cache)
--prefer-cache ...... always use the cached data (recommended for development)
--blessed, -b ....... blessed file location (default=./blessed.json)
--concurrency, -x ... max concurrent processes (default=10)
--max-retries, -r ... how often to retry failed tasks (default=2)
--max-depth, -d ..... max depth of dependents to look up (default=5)
--quiet ............. minimal output only.
--skip-times ........ skip times in output (good for updating git data)
--out-mode .......... mode how the output should be written to a folder:
    'history' (default) ... for creating a new folder and maintaining an index.json (good for dev)
    'override' ............ to write the current version to the folder as-is (good for deploy)

--github ............ Github token, falls back to GITHUB_TOKEN environment variable
--gitlab ............ Gitlab token, falls back to GITLAB_TOKEN environment variable
```

## File Structure

```
├─╴ index.mjs ................ Entry point, Kicks off the journey!
├─╴ blessed.json ............. Start-file containing all the projects we want to scrape
│
├─┬ bin
│ └─╴ dat-garden-rake ........ binary, contains all npm process dependencies
│
├─┬ cache .................... (git-ignored) defaut cached responses
│ └─╴ <level-db>
│
├─┬ lib
│ ├─╴ npm.mjs ................ Utils for different NPM-tasks
│ ├─╴ people.mjs ............. Utils for collecting people related to packages/repos
│ ├─╴ repo.mjs ............... Utils for different Repository-tasks
│ ├─╴ reduce.mjs ............. Reduce function to be used in the the finalize task
│ ├─╴ task-queue.mjs ......... [CORE] Multi-purpose, leveldb based task processor!
│ └─╴ util.mjs ............... general purpose functions that have no externalities
│
├─┬ out ...................... (git-ignored) default output responses
│ ├─╴ index.json ............. Lookup for the latest run and a history of previous runs.
│ │
│ └─┬ <start-time>
│   ├─╴ index.json ........... Information about the run (start, blessed input, etc.)
│   ├─╴ organizations.json ... All users/organizations found for projects (combined/normalized)
│   ├─╴ projects.json ........ All projects (repos or npm packages) found
│   │
│   ├─┬ raw
│   │ ├─╴ errors.json ........ Errors that occurred during the run
│   │ ├─╴ packages.json ...... NPM package related information collected during the run
│   │ ├─╴ people.json ........ Lookup table of organizations or individuals linked in packages/repos
│   │ └─╴ repos.json ......... Repository related information collected during the run
│   │
│   └─╴ valuenetwork.json .... Relationships between projects, other projects and organizations
│
├─┬ processor
│ ├─╴ index.mjs .............. Defines all the process-types 
│ ├─╴ init.mjs ............... Init task that is run at the start of the journey!
│ ├─╴ finalize.mjs ........... Task run at the end of the journey. This is always run!
│ └─╴ <task>.mjs ............. Other tasks used during execution, linked in index.mjs
│
└─┬ state .................... (git-ignored) default state information for the current run
  └─╴ <level-db>
```

## Workflow

1. A `task-queue` is started that will process tasks until no more task is left.
    The result of each task execution is written to the `state` and the result
    can add additional tasks!
1. If there is no `start` time stored in the `state`, the first task `processor/init.mjs`
    will be run.
1. If a task throws an error, the `task-queue` will retry its execution.
1. If a task encounters a `rate-limit` the `task-queue` will wait until the limit
    should be lifted.
1. Once no task is left to execute, the `processor/finalize.mjs` task will be run.
    It will format the content of `state` and write it to the output!

## Deduplicated Task scheduling

A `task` is a very simple concept: 

```javascript
async process (api, task) {
  return {
    batch: [] // Data to be run against the level-db (should only contain put ops!)
  }
}
```

And triggering at new task may simply look like:

```javascript
batch: [
  api.createTask({ type: 'task-type', /* ...other info */ })
]
```

But during scraping it is likely that we run into resources (repos/packages/people)
that we have fetched or are currently in the process of fetching! 😳

To reduce (remove) duplicate scheduling and/or processing of tasks this code has
the concept of `resourceTaskProcessor`.

For example `person` (in `processor/person.mjs`0 is a `resourceTaskProcessor`.
You will find calls that look like:

```js
batch: [
  ...person.createTask({ url: 'https://github.com/martinheidegger' })
]
```

what happens here is that the `getTaskDef` identifies a `key` for the task object.
Based on this `key`...

... `createTask` will look if there is already this resource stored at `key`.

... if **one resource** is found an no task is returned `[]`

... if **no resource** is found, it will look if there is another task already
sheduled for this resource and only if not will return an Array with the created task!

A simplified `taskProcessor` exists that does the same thing but is not bound
to a resource in the level-db; just an abstract key.

## Data merging

To collect all information on repositories/packages, multiple tasks may be run.

In order for the tasks to not collide, there is a key-format that gets combined
in the `process/finalize.mjs` task!

It combines level-db keys as follows:

```js
const entries = [
  { key: 'foo', value: { base: 'value' } },
  { key: 'foo#bar', value: 'direct' },
  { key: 'foo#list+1', value: 'a' },
  { key: 'foo#list+2', value: 'b' }
]
const collected = collect(entries)

{
  foo: {
    base: 'value',
    bar: 'direct',
    baz: {
       deep: 1,
       deeper: 2
    },
    list: ['a', 'b']
  }
}
```

It is in the responsibility of the developer to sanitize the fields 😰
Currently it does not support deep hierarchies!

## Important Tidbits

You may be surprised at the complexity of this project. 😅 Here are some of the
important things that explain it.

You can **pause the run at any time** without fearing data loss by simply stopping
the command-line process! Restarting it without a special flag will resume!
In order to do that every task will end with **one** level-db write operation!

Most **API's have a rate limit!** We attempt to not run into them, but if we do
it will restart the tasks!

Trying to look up dependents of our projects is a **very time consuming** task
where the tree is huge.

There are monorepos out there which can cause us to possibly have **multiple packages per repository**.

The API _(particularly githubs API)_ can result in **404 relationships**.

We currently **trust the npm users** to inform on their identity truthfully to
create better links in the data structure. (This may need to be revised).

## License

[MIT](./LICENSE)
