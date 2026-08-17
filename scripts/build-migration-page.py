"""Regenerate MIGRATION.html, the tracking page for `refactor/sync-cleanup`.

    python scripts/build-migration-page.py

Everything the page counts is read out of the repository, so the numbers cannot
drift from the code the way a hand-maintained table does:

  * the command vocabulary, from `COMMAND_PERMISSIONS` plus the `weather.*`
    names, which are absent from it because they have no handler at all;
  * which commands are reachable, from the `intents` keys under
    `apps/server/src/table-commands/`;
  * which are multi-row, from `MultiRowCommandType`;
  * which tables `apps/web` still reaches through `webCollections`, by grepping
    for the property access.

Only `AHEAD_OF_SERVER` is stated by hand, because "this is single-row by intent
and multi-row by accident" is a judgement about an open issue rather than a fact
in the source. Delete a name from it when #162 lands for that command.

The prose lives in `scripts/migration-page.template.html`. Edit that, not the
generated file.
"""

from __future__ import annotations

import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "scripts" / "migration-page.template.html"
OUT = ROOT / "MIGRATION.html"

DOMAINS = {
    "larvalSurveillance": "Larval surveillance",
    "adultSurveillance": "Adult surveillance",
    "controlOperations": "Control operations",
    "fieldWork": "Field-work support",
    "missionDispatch": "Mission dispatch",
    "publicEngagement": "Public engagement",
    "foundation": "Foundation",
    "organizationSettings": "Organization settings",
    "weather": "Weather",
}
ORDER = list(DOMAINS.values())
COMMAND = r"'((?:" + "|".join(DOMAINS) + r")\.[A-Za-z]+)'"

# Single-row by intent, multi-row until the position column is used as intended.
AHEAD_OF_SERVER = {
    "fieldWork.addRouteItem",
    "fieldWork.addAssignmentItem",
    "missionDispatch.addMissionItem",
    "missionDispatch.addMissionItemFromRequestedControlAction",
}


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def vocabulary() -> set[str]:
    """Every command name. `weather.*` is in the domain union but not in the
    permission map, because nothing serves it — see the page's own note."""
    names = set(re.findall(COMMAND, read("apps/server/src/command-permissions.ts")))
    weather = read("packages/domain/src/weather/shared.ts")
    body = weather.split("export type WeatherCommandType =")[1].split(";")[0]
    return names | set(re.findall(r"'(weather\.[A-Za-z]+)'", body))


def reachable() -> set[str]:
    found: set[str] = set()
    for path in sorted((ROOT / "apps/server/src/table-commands").glob("*.ts")):
        if path.name in {"dispatch.ts", "shared.ts", "index.ts"}:
            continue
        found |= set(re.findall(COMMAND, path.read_text(encoding="utf-8")))
    return found


def multi_row() -> set[str]:
    src = read("packages/domain/src/command-vocabulary.ts")
    body = src.split("export type MultiRowCommandType =")[1].split("/** A command a single-row")[0]
    return set(re.findall(COMMAND, body))


def tables() -> list[dict]:
    """Every table the web app has a collection for, with both halves of its
    migration: does the server accept it by command, and has apps/web stopped
    reaching it through the old seam.

    The universe is `lib/collections/`, one module per table, and *not*
    `createWebCollections`. It used to be the latter, which made the page shrink
    as the work landed: a table that came fully off the old seam was deleted from
    the declarations, so it dropped out of the list and out of the denominator
    with it. The dial read 19/50 where it had read 19/52, and the two tables that
    had just been finished were the ones missing."""
    src = read("apps/web/src/sync/collections.ts")
    # The old seam's property name per table, for the ones it still declares.
    props = {
        table: prop
        for prop, table in re.findall(
            r"const (\w+) = createCollection\(\s*electricShapeCollectionOptions<\w+>\(\{\s*table: '([^']+)'",
            src,
        )
    }

    # One module per table, named for it. `mutate` and `transact` are the two
    # that are not a table.
    every = sorted(
        path.stem
        for path in (ROOT / "apps/web/src/lib/collections").glob("*.ts")
        if path.stem not in {"mutate", "transact"}
    )

    mapped: set[str] = set()
    for path in (ROOT / "apps/server/src/table-commands").glob("*.ts"):
        text = path.read_text(encoding="utf-8")
        mapped |= set(re.findall(r"table:\s*'([a-z_]+)'", text))
        # The catalog factories take the table as a positional argument.
        mapped |= set(re.findall(r"^		'([a-z_]+)',$", text, re.M))

    def live_properties() -> set[str]:
        out = subprocess.run(
            ["git", "grep", "-oh", "-E", r"webCollections\.[A-Za-z]+"],
            cwd=ROOT, capture_output=True, text=True,
        ).stdout.split()
        tests = subprocess.run(
            ["git", "grep", "-oh", "-E", r"webCollections\.[A-Za-z]+", "--", "apps/web/src/tests"],
            cwd=ROOT, capture_output=True, text=True,
        ).stdout.split()
        strip = lambda xs: {x.split(".", 1)[1] for x in xs}
        return strip(out) - strip(tests)

    live = live_properties()
    return [
        # A table the old seam no longer declares cannot be reached through it.
        {"table": table, "server": table in mapped, "client": props.get(table) not in live}
        for table in every
    ]


def e(value: object) -> str:
    return html.escape(str(value), quote=True)


def meter(done: int, total: int, tone: str) -> str:
    pct = 0 if total == 0 else round(done / total * 100)
    return (
        f'<div class="meter" role="img" aria-label="{done} of {total}">'
        f'<span class="meter-fill is-{tone}" style="inline-size:{pct}%"></span></div>'
    )


def vocabulary_grid(names: set[str], reach: set[str], multi: set[str]) -> str:
    by_domain: dict[str, list[str]] = {}
    for name in names:
        by_domain.setdefault(name.split(".")[0], []).append(name)

    parts = []
    for key, label in DOMAINS.items():
        rows = sorted(by_domain.get(key, []))
        hit = sum(1 for name in rows if name in reach)
        tone = "done" if hit == len(rows) else ("todo" if hit == 0 else "partial")
        flagged = sum(1 for n in rows if n in multi or n in AHEAD_OF_SERVER or key == "weather")
        items = []
        for name in rows:
            short = name.split(".")[1]
            flag = "multi" if name in multi else ("ahead" if name in AHEAD_OF_SERVER else ("open" if key == "weather" else "single"))
            unreached = "" if name in reach else " unreached"
            mark = "" if name in reach else '<span class="pending" title="No intent map yet">·</span>'
            items.append(f'<li class="row {flag}{unreached}"><code>{e(short)}</code>{mark}</li>')
        parts.append(
            f'<section class="domain" data-flagged="{flagged}" data-open="{len(rows) - hit}">'
            f'<h3>{e(label)}<span class="tally"><b>{hit}</b>/{len(rows)}</span></h3>'
            f"{meter(hit, len(rows), tone)}"
            f'<ul class="rows">{"".join(items)}</ul></section>'
        )
    return "\n".join(parts)


def table_rows(rows: list[dict]) -> str:
    # Each chip's own words say which way it went. A label naming only the
    # category — "intent map" on every row, whether or not there is one — reads
    # correctly in colour and backwards in plain text, which is what a screen
    # reader and a copied table both get.
    def chip(ok: bool, yes: str, no: str) -> str:
        return f'<span class="chip is-{"yes" if ok else "no"}">{yes if ok else no}</span>'

    out = []
    for row in sorted(rows, key=lambda r: (not (r["server"] and r["client"]), r["table"])):
        state = "done" if row["server"] and row["client"] else ("partial" if row["server"] or row["client"] else "todo")
        out.append(
            f'<tr data-state="{state}">'
            f'<td><code>{e(row["table"])}</code></td>'
            f'<td>{chip(row["server"], "intent map", "no map")}</td>'
            f'<td>{chip(row["client"], "migrated", "on webCollections")}</td>'
            f"</tr>"
        )
    return "\n".join(out)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def main() -> None:
    names, reach, multi = vocabulary(), reachable() & vocabulary(), multi_row()
    rows = tables()
    replacements = {
        "{{VOCAB}}": vocabulary_grid(names, reach, multi),
        "{{TABLES}}": table_rows(rows),
        "{{TOTAL_CMDS}}": len(names),
        "{{REACH_CMDS}}": len(reach),
        "{{CMD_METER}}": meter(len(reach), len(names), "partial"),
        "{{TBL_TOTAL}}": len(rows),
        "{{TBL_DONE}}": sum(1 for r in rows if r["server"] and r["client"]),
        "{{SRV_TBL}}": sum(1 for r in rows if r["server"]),
        "{{CLI_TBL}}": sum(1 for r in rows if r["client"]),
        "{{SRV_METER}}": meter(sum(1 for r in rows if r["server"]), len(rows), "partial"),
        "{{CLI_METER}}": meter(sum(1 for r in rows if r["client"]), len(rows), "todo"),
        "{{HEAD}}": git("rev-parse", "--short", "HEAD"),
        "{{AHEAD_COUNT}}": len(git("rev-list", "main..HEAD").splitlines()),
    }
    page = TEMPLATE.read_text(encoding="utf-8")
    for token, value in replacements.items():
        page = page.replace(token, str(value))
    OUT.write_text(page, encoding="utf-8", newline="\n")
    print(
        f"{OUT.name}: {len(reach)}/{len(names)} commands · "
        f"{replacements['{{SRV_TBL}}']}/{len(rows)} tables mapped · "
        f"{replacements['{{CLI_TBL}}']}/{len(rows)} off webCollections"
    )


if __name__ == "__main__":
    main()
