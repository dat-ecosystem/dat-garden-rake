# dat-garden-rake

A rake to collect all the leaves in the garden.

## About

A helpful script to collect all repositories and packages that have a relationship to the
dat-ecosystem and present them as .json files.

## Usage

Run the dat-garden-rake like below:

```bash
$ dat-garden-rake [...options]

--clear, -c ......... clears the current state
--help, -h .......... show this help
--out, -o ........... output folder (will create sub-directory with timestamp from start) (default=./out)
--state, -s ......... state folder (default=./state)
--blessed, -b ....... blessed file location (default=./blessed.json)
--concurrency, -x ... max concurrent processes (default=10)
--max-retries, -r ... how often to retry failed tasks

Note: to get the full output you need to supply a GITHUB_TOKEN and GITLAB_TOKEN to access the respective
API.
```

It will take a while but eventually 

## License

[MIT](./LICENSE)