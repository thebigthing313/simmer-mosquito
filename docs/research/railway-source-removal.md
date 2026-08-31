# Removing the Railway repo watcher without breaking `railway up --ci`

Answers [#370](https://github.com/thebigthing313/simmer-mosquito/issues/370).

Sources are Railway's own documentation, the Railway CLI source at
`railwayapp/cli@master`, and read-only queries against the `simmer` Railway
project through the MCP and `railway environment config --json`. Nothing was
changed, nothing was deployed, and `railway up` was not run. Where a claim rests
on inference rather than a documented statement, it says so.

## The short answer

Yes. A service with no source accepts `railway up`, and that is the documented
way to deploy a local directory. The watcher comes off with one CLI command per
service:

```sh
railway service source disconnect --service <service> --project <project-id>
```

It removes the GitHub source for the whole service, in every environment at
once. It does not touch build settings, deploy settings, variables, networking,
or the running deployment. `RAILWAY_DOCKERFILE_PATH` is a service variable and
is not part of the source. The `server` service's Railpack build and start
commands are service configuration and are not part of the source either.

`railway up` uploads the working tree, not a git ref. Neither MCP server exposes
a disconnect, so this step is CLI or dashboard.

## What the watcher is costing today

Four services carry a repo source, read back from the live project on
2026-08-31:

| Service | Environment | `source` |
| --- | --- | --- |
| `server` (`a4cb8b10`) | staging | `repo: thebigthing313/simmer-mosquito`, `branch: staging`, `checkSuites: false` |
| `server` (`a4cb8b10`) | production | same repo, `branch: main` |
| `web` (`ed6339fd`) | staging | same repo, `branch: staging` |
| `web` (`ed6339fd`) | production | same repo, `branch: main` |
| `admin` (`15fde491`) | staging only | same repo, `branch: staging` |
| `admin-prod` (`3c778ef6`) | production only | same repo, `branch: main` |

`server` and `web` are one service each spanning both environments. `admin` and
`admin-prod` are two separate services, one per environment. So there are four
service ids to disconnect, not six.

The doubling is visible in the deployment history. Railway's deployment `meta`
records where a deploy came from. A watcher deploy carries the commit:

```json
{ "reason": "deploy",
  "commitHash": "38ecac74801eea756e8e9458277156569a628bcc",
  "commitMessage": "Merge pull request #368 ...",
  "branch": "staging" }
```

A `railway up` deploy carries nothing but `{"reason": "deploy"}`. On the `web`
service in staging the last six deployments alternate between the two shapes,
one pair per merge, and the watcher deploy of `38ecac74` was created at
15:43:25Z while the workflow's upload for the same merge landed at 15:47:00Z.
The watcher wins by about four minutes, which is the `verify` and `migrate` jobs
running.

## Does `railway up --ci` work with no source

Yes, and it is the documented flow. Railway's services page, under "Deploying
from a local directory", says to create an **Empty Service**, link the project,
and `railway up`, choosing that empty service as the target
(<https://docs.railway.com/services#deploying-from-a-local-directory>). An empty
service has no source by definition, so a source is not a precondition for
accepting an upload.

The CLI says the same thing from the other direction. `railway up`'s help text
ends with:

> To switch a locally uploaded service to GitHub autodeploys, run
> `railway service source connect --repo owner/repo --branch main --service api`.

That sentence only makes sense if "locally uploaded service" is a normal state
with no source attached (`src/commands/up.rs`, the `after_help` string).

The upload endpoint itself carries no source parameter. `upload_deploy_tarball`
in `src/controllers/upload.rs` POSTs the gzipped tarball to:

```
https://backboard.{hostname}/project/{project_id}/environment/{environment_id}/up?serviceId=...
```

Project, environment, service, and an optional message. There is no repo,
branch, or commit in the request, so there is nothing for the backend to
validate a source against.

I did not test this against a service that *had* a source and then lost one, as
opposed to one that never had one. The tarball path is identical either way, so
I do not think the distinction exists, but it is the one claim here I could only
settle by deploying.

## If a source were required, would a dead branch or `checkSuites` work

It is not required, so neither is needed. Both are worth recording because both
are wrong for a different reason.

`checkSuites` is Railway's **Wait for CI** flag. The CLI prompt names it
outright: "Wait for GitHub check suites before deploying?"
(`src/commands/environment/changes/source.rs`). Turning it on does not stop
auto-deploys. Per
<https://docs.railway.com/deployments/github-autodeploys#wait-for-ci>, the
deployment moves to `WAITING` while workflows run, becomes `SKIPPED` if any
workflow fails, and "proceed[s] as usual" when they all pass. `railway-deploy.yml`
passes on every green merge, so `checkSuites: true` would turn three immediate
unverified builds into three delayed verified ones, still on top of the
workflow's own three uploads. It halves nothing.

Pointing the source at a branch that never receives pushes is not documented as
a way to disable anything. Railway's documented control is the **Disable**
button in service settings, on the same page: "Click **Disable** to stop
deploying automatically on new commits." That toggle is not exposed by the CLI
or by either MCP server, so it is a dashboard-only action, and it leaves a
source in place that a future project member can re-enable by clicking
**Enable**. Disconnecting is the state you can read back and assert on.

There is a third lever the ticket does not mention, and it is the only one that
works per environment: **watch paths**. They are gitignore-style patterns, and
Railway skips a deployment whose changed files match none of them
(<https://docs.railway.com/deployments/monorepo#watch-paths>, and the autodeploy
troubleshooting section, "If deployments are skipped due to watch paths, update
watch paths to include the changed files"). A pattern that can never match would
leave the source connected and produce a `SKIPPED` deployment instead of a
build. It is settable through the MCP `update-service` tool with an
`environmentId`. I am reading "no build" from the `SKIPPED` status rather than
from a sentence saying so, so treat that as inference. It is a worse answer than
disconnecting anyway: it keeps a live watcher whose only defence is a pattern
somebody will eventually "fix".

## Does disconnecting reset the build config

No. Source and build configuration are separate fields on the service instance,
and the disconnect mutation touches only the source.

The mutation the CLI sends takes an id and nothing else
(`src/gql/mutations/strings/ServiceDisconnect.graphql`):

```graphql
mutation ServiceDisconnect($id: String!) {
  serviceDisconnect(id: $id) { id name }
}
```

The connect mutation is equally narrow: `ServiceConnectInput` carries `repo`,
`branch`, and `image`, and nothing else. The environment configuration document
confirms the shape. `railway environment config --json` returns each service
instance as sibling keys:

```json
"a4cb8b10-88c7-4ae9-a326-de83c73fc564": {
  "source":     { "repo": "...", "branch": "staging", "checkSuites": false },
  "networking": { ... },
  "variables":  { ... },
  "deploy":     { ... },
  "build":      { "builder": "RAILPACK", "buildCommand": "pnpm --filter @simmer-mosquito/server build", "buildEnvironment": "V3" }
}
```

`build` and `deploy` are not nested under `source`. The MCP `update-service`
tool draws the same line from the other side: it changes build command, start
command, Dockerfile path and watch patterns, and its description says "Scaling
(replicas/regions) and source changes are not handled by this tool."

Per service, that means:

- **`server`.** `build.buildCommand` is `pnpm --filter @simmer-mosquito/server build`
  and `deploy.startCommand` is `pnpm --filter @simmer-mosquito/server start`,
  both on the service instance in both environments. Neither is derived from the
  source. Note that the live config has no install command field, so
  `docs/deployment.md`'s "install, build, and start commands" describes two
  settings and a Railpack default, not three settings.
- **`web`, `admin`, `admin-prod`.** `RAILWAY_DOCKERFILE_PATH` is a *variable*
  (`apps/web/Dockerfile`, `apps/admin/Dockerfile`), which
  <https://docs.railway.com/builds/dockerfiles#custom-dockerfile-path> confirms
  is the supported mechanism. Variables live under `variables` in the same
  document and are untouched by a source change. Their `build.buildCommand` is
  already the empty string and their `builder` is `RAILPACK`, which is correct:
  Railway builds the Dockerfile the variable names, from the root of whatever
  source directory it was handed. For an upload, that root is the tarball.

The repo has no `railway.json` or `railway.toml`, so no config-as-code file is
in play. Do not add one to harden this: config as code is deprecated, new
services cannot opt into it, and existing files stop working on 2026-12-01
(<https://docs.railway.com/config-as-code>). The successor is Infrastructure as
Code, `.railway/railway.ts`, which is a separate decision from this one.

## Does `railway up` upload the working tree or the git ref

The working tree. `create_deploy_tarball` in `src/controllers/upload.rs` walks
the project directory, honours `.railwayignore` and (unless `--no-gitignore`)
`.gitignore`, explicitly skips any path component named `.git` or
`node_modules`, and gzips the result. That byte blob is the entire request body.
No commit sha, branch name, or remote is sent.

`up.rs` does call `detect_github_remote` and `detect_current_branch`, but only
in the interactive `--new` path and only to print a line, under a comment that
says "we deploy from local tarball". The workflow's `railway up --ci` never
reaches that code.

Two consequences for `railway-deploy.yml`:

1. `actions/checkout@v7` puts the exact pushed commit in the runner's working
   directory, so the upload is that commit's content. The deploy is
   commit-accurate even though the commit id never travels.
2. The commit id never travels, which is why upload deploys show
   `{"reason": "deploy"}` and no `commitHash` in deployment metadata. After the
   disconnect, no Railway deployment for these services will name a commit. The
   `--message` flag exists for exactly this, and
   `railway up --message "$GITHUB_SHA"` would put the sha back in the deployment
   record. That is a workflow change, not part of this question, but it is the
   cheap mitigation for the one thing the watcher was giving for free.

Also worth knowing: `.git` being excluded means the build container has no git
metadata. Nothing in `apps/web`, `apps/admin`, or `apps/server` reads git at
build time (versions come from `package.json`), so this changes nothing today.

## The safe sequence

The unit of work is the service, not the service-environment. `serviceDisconnect`
takes a service id and the MCP's connect tool states it "applies to the service
in all environments", so disconnecting `server` stops the watcher on `staging`
and `main` in the same call. There is no documented way to unset a source for
one environment only, so a staged rollout that disconnects staging first and
production later is not available. Plan for both environments to change at once.

1. **Snapshot both environments before touching anything.** This is the rollback
   material and it is read-only:

   ```sh
   railway environment config --json --environment staging    > staging-before.json
   railway environment config --json --environment production > production-before.json
   ```

   The output contains resolved variable values including secrets, so keep it
   out of the repo.

2. **Pick the moment.** Do it right after a green `railway-deploy.yml` run on
   both branches, so every service is already on the deployment you want it on
   and nothing is mid-build.

3. **Disconnect, one service at a time**, checking the config in between:

   ```sh
   railway service source disconnect --project 19be964d-b309-46e1-8f6d-a1fbcf05095e --service server
   railway service source disconnect --project 19be964d-b309-46e1-8f6d-a1fbcf05095e --service web
   railway service source disconnect --project 19be964d-b309-46e1-8f6d-a1fbcf05095e --service admin
   railway service source disconnect --project 19be964d-b309-46e1-8f6d-a1fbcf05095e --service admin-prod
   ```

   Start with `admin` and `admin-prod`, which are per-environment services and
   the smallest blast radius, then `web`, then `server`.

4. **Verify after each.** `railway environment config --json` should show the
   service with no `source` key and with `build`, `deploy`, `variables`, and
   `networking` unchanged against the snapshot. The MCP `get-service-config`
   reads the same thing.

5. **Prove the upload path once, deliberately**, before trusting it on a merge.
   Re-run `railway-deploy.yml` by `workflow_dispatch` against `staging` from the
   `staging` branch. That exercises `railway up --ci` on all three staging
   services with no source present. Watch that `server` still builds with the
   Railpack build command and that `web` and `admin` still pick up their
   Dockerfiles.

6. **Rollback**, if any of that goes wrong, is the inverse command:

   ```sh
   railway service source connect --project <id> --service server \
     --repo thebigthing313/simmer-mosquito --branch staging
   ```

   That restores one branch. Because the branch is per environment, restoring
   `server` and `web` correctly means reconnecting and then setting the
   production instance's branch back to `main`, which is why step 1's snapshot
   matters.

### What you give up

- **Deploy Latest Commit.** The command-palette action deploys "the latest
  commit from the currently connected GitHub branch"
  (<https://docs.railway.com/deployments/github-autodeploys#disable-automatic-deployments>).
  With no branch connected it has nothing to deploy. The replacement is a
  `workflow_dispatch` run of `railway-deploy.yml`.
- **Commit provenance on deployments**, unless the workflow starts passing
  `--message`, as above.
- Rollback to a *commit* from the dashboard. Redeploying a previous *deployment*
  still works: `railway redeploy`, and the MCP `redeploy` tool, act on a
  deployment id and never consult the source.

One thing I could not verify without acting: whether `serviceDisconnect` leaves
the currently running deployment untouched. Railway deployments are immutable
snapshots and the mutation returns only `id` and `name`, so I expect no restart,
but the dashboard route definitely differs here. A source change made in the UI
lands in staged changes, and "Clicking 'Deploy' will deploy all of the changes at
once. Any services that are affected will be redeployed"
(<https://docs.railway.com/deployments/staged-changes>). Alt-clicking Deploy
commits without redeploying. That is one more reason to use the CLI.

## MCP or dashboard

The CLI. Neither MCP server can do this:

- `connect-service-source` connects a repo or an image. There is no matching
  disconnect tool.
- `update-service`, on both servers, says source changes are out of scope.
- The `railway` MCP server has no source tool at all.

The MCP is still the right tool for everything around the change:
`get-service-config` and `list-deployments` for the before and after check,
`list-services` for the ids. The dashboard can do it too, through Settings ->
Service Source, but it routes through staged changes and may redeploy on apply.
The CLI at 4.56.0 is already installed and authenticated in this workspace.
