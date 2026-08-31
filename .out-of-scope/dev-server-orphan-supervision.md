# Killing the dev server when its runner dies

`pnpm dev:server` forks the server entry and nothing in our code makes the child
exit when the runner is force-terminated. Adding something that does, a Windows
job object or an IPC `disconnect` handler on the server entry, is out of scope.

The runner clears a stale listener on the next start instead, in
`ensurePortIsFree`, and that stays the answer.

## Why this is out of scope

Not because the cleanup is preferable in principle. Because the orphan it would
prevent has never been reproduced, and both attempts to build the prevention
measured it not happening.

The reported symptom was real. #309 saw `pnpm dev:server` log
`Killing stale process 24592 still listening on port 3000` and bind. But no
sequence anyone has run produces that state:

- While verifying #311, the runner was force-killed on its own
  (`taskkill /PID <runner> /F`, no `/T`) and the child exited with it.
- While building the `disconnect` handler for #331, the same thing was measured
  three times on Windows 11 with Node 22.16.0. A parent forks the server entry
  over an IPC channel, the server binds, and `process.kill(pid, 'SIGKILL')` ends
  the parent alone, which on Windows is `TerminateProcess` aimed at that pid:

  ```
  booted: parent 31572 true | child 26880 true | listening true
  +1s parent=false child=false listening=false
  ```

  The forked server is gone inside a second and the port is free, with the
  handler and without it. The child's own stdout shows it never reached the
  handler, so Node or the OS ends it first and there is nothing for our code to
  do.

That measurement is what rules the work out. A `disconnect` handler on Windows
is dead code: it does not run. A job object would need a native addon or a
PowerShell shell-out, neither of which a test can exercise without testing the
fake, and it would be guarding a case nobody can produce. Either one ships as a
fix for something that cannot be observed, which is the state #331 warned about
in its own body before it happened one layer down.

## What this does not cover

**A reproduction reopens it.** If a kill turns up that leaves the child holding
the port, the work becomes ordinary: the fixture and the process-level
integration test written during #331 are on
`fix/issue-331-dev-server-disconnect` and are most of it. What is needed first
is a sequence, not code.

The candidates nobody has measured, in rough order of how likely they look:

- the runner's restart flow, where an old child may be disconnected but not yet
  dead when the runner ends;
- a child whose parent already exited normally earlier, so it is genuinely
  parentless before anything kills anything;
- the layers above the runner. It is nx's child, spawned rather than forked, so
  it has no IPC channel of its own to lose, and `pnpm dev` puts `mprocs` above
  that again. A runner that outlives nx keeps its own child alive, correctly.

**Other platforms are a different question.** On Linux and macOS a force-killed
parent leaves the child running and reparented, so a `disconnect` handler would
fire and would prevent an orphan there. Nobody has reported one, and no CI run
has confirmed it either. That would be its own issue with its own reproduction,
not this one.

**`ensurePortIsFree` is not redundant.** It covers a port held by anything else:
a hand-started server, a second checkout, an unrelated process. Do not remove it
on the strength of a fix that replaces one of its cases.

## Prior requests

- #331 "The forked dev server can outlive a force-killed runner on Windows"
- #311 split it out, having covered the runner's supervision rules with tests
  and left the platform mechanism alone
