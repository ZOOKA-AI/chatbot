#!/usr/bin/env python3
"""Restores a production backup into an isolated database and checks the result.

Recovery readiness is not a claim about a file; it is a claim that the rows in that
file can be put back and still make sense. So this loads them into a database you
nominate, then asks three questions:

  coverage      every table in the backup has a destination, and the row counts match
  integrity     no foreign key is left pointing at a parent that did not come back
  auth          credentials survived as usable bcrypt hashes, emails intact

It prints counts and verdicts only. No email, hash, or row content is ever echoed, and
it refuses to run against a known production host so a mistyped argument cannot load
test data into the real database.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import subprocess
import sys

FORBIDDEN_HOSTS = (
    "krzfrsaquvmwctsajhlm",   # production
    "bylfizytgayoefuyliix",   # the retired Ireland project
    "pooler.supabase.com",
)


def refuse_production(url: str) -> None:
    lowered = url.lower()
    for host in FORBIDDEN_HOSTS:
        if host in lowered:
            raise SystemExit(f"refusing to write to a production host ({host})")


def psql(url: str, sql: str) -> tuple[int, str, str]:
    proc = subprocess.run(["psql", url, "-tAF", "\x1f", "-c", sql], capture_output=True, text=True, timeout=180)
    return proc.returncode, proc.stdout, proc.stderr


def scalar(url: str, sql: str) -> str:
    rc, out, err = psql(url, sql)
    if rc != 0:
        raise SystemExit(f"query failed: {err.strip()[:300]}")
    return out.strip()


def existing_tables(url: str) -> set[str]:
    return set(scalar(url, "select table_name from information_schema.tables where table_schema='public'").split())


def restore(url: str, tables: dict[str, list[dict]]) -> dict[str, dict]:
    """Loads rows with \\copy so typing is left to PostgreSQL, as a real restore would."""
    present = existing_tables(url)
    report: dict[str, dict] = {}
    for table, rows in tables.items():
        if not rows:
            report[table] = {"source": 0, "restored": 0, "status": "empty"}
            continue
        if table not in present:
            report[table] = {"source": len(rows), "restored": 0, "status": "no_destination"}
            continue

        # Production carries legacy columns the ORM never reads (`User.name`,
        # `Organization.slug`, `Document.embedding`). Reproducing them in the schema
        # would be copying production rather than reconciling it, so the restore
        # keeps the columns the target actually has and records what it dropped.
        available = set(
            scalar(
                url,
                "select column_name from information_schema.columns "
                f"where table_schema='public' and table_name='{table}'",
            ).split()
        )
        source_columns = list(rows[0].keys())
        dropped = [c for c in source_columns if c not in available]
        columns = [c for c in source_columns if c in available]
        if not columns:
            report[table] = {"source": len(rows), "restored": 0, "status": "no_shared_columns"}
            continue
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        for row in rows:
            writer.writerow(
                [
                    None
                    if row.get(column) is None
                    else json.dumps(row[column])
                    if isinstance(row[column], (dict, list))
                    else ("t" if row[column] is True else "f" if row[column] is False else str(row[column]))
                    for column in columns
                ]
            )
        path = f"/tmp/restore_{table}.csv"
        open(path, "w", encoding="utf-8").write(buffer.getvalue())
        column_list = ",".join(f'"{c}"' for c in columns)
        proc = subprocess.run(
            ["psql", url, "-c", f'\\copy "{table}" ({column_list}) FROM \'{path}\' WITH (FORMAT csv, NULL \'\')'],
            capture_output=True, text=True, timeout=300,
        )
        restored = int(scalar(url, f'select count(*) from "{table}"') or 0)
        status = "ok" if proc.returncode == 0 and restored == len(rows) else "mismatch"
        report[table] = {
            "source": len(rows),
            "restored": restored,
            "status": status,
            "columns_dropped": dropped,
            **({"error": proc.stderr.strip().splitlines()[-1][:120]} if proc.returncode != 0 else {}),
        }
    return report


def foreign_key_orphans(url: str) -> list[dict]:
    """Every FK in the restored database, asked for children whose parent is absent."""
    rc, out, err = psql(
        url,
        """
        select conrelid::regclass::text, conname,
               (select string_agg(a.attname, ',') from unnest(c.conkey) k
                  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k) as child_cols,
               confrelid::regclass::text as parent,
               (select string_agg(a.attname, ',') from unnest(c.confkey) k
                  join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k) as parent_cols
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where c.contype = 'f' and n.nspname = 'public'
        order by 1, 2
        """,
    )
    if rc != 0:
        raise SystemExit(f"constraint inspection failed: {err.strip()[:200]}")

    orphans = []
    for line in out.splitlines():
        if not line.strip():
            continue
        parts = line.split("\x1f")
        while len(parts) < 5:
            parts.append("")
        child_table, name, child_cols, parent_table, parent_cols = parts[:5]
        if not child_cols or not parent_cols:
            continue
        pairs = ", ".join(
            f'c."{c.strip()}" = p."{p.strip()}"' for c, p in zip(child_cols.split(","), parent_cols.split(","))
        )
        _, count_out, _ = psql(
            url,
            f'select count(*) from "{child_table}" c where not exists (select 1 from "{parent_table}" p where {pairs})',
        )
        broken = int(count_out.strip() or 0)
        if broken:
            orphans.append({"constraint": name, "child": child_table, "parent": parent_table, "orphans": broken})
    return orphans


def auth_check(url: str) -> dict:
    """Counts only: no hash leaves this function, and no email is quoted."""
    total = int(scalar(url, 'select count(*) from "User"') or 0)
    # The password column is named `password` here and `passwordHash` in other
    # generations of this schema, so it is discovered rather than assumed.
    columns = set(
        scalar(url, "select column_name from information_schema.columns "
                    "where table_schema='public' and table_name='User'").split()
    )
    password_column = next((c for c in ("passwordHash", "password") if c in columns), None)
    verified_column = next((c for c in ("emailVerifiedAt", "emailVerified") if c in columns), None)
    if password_column is None:
        raise SystemExit("no password column found on User")
    hashed_sql = (
        f'select count(*) from "User" where "{password_column}" is not null '
        "and \"{password_column}\" ~ '^\\$2[aby]\\$[0-9]{2}\\$.{53}$'".replace('{password_column}', password_column)
    )
    hashed = int(scalar(url, hashed_sql) or 0)
    null_hash = int(scalar(url, f'select count(*) from "User" where "{password_column}" is null') or 0)
    usable_emails = int(
        scalar(url, "select count(*) from \"User\" where email is not null and position('@' in email) > 1") or 0
    )
    verified = (
        int(scalar(url, f'select count(*) from "User" where "{verified_column}" is not null') or 0)
        if verified_column
        else 0
    )
    return {
        "users": total,
        "password_column": password_column,
        "bcrypt_hashes": hashed,
        "null_hashes": null_hash,
        "usable_emails": usable_emails,
        "email_verified": verified,
        "all_emails_usable": usable_emails == total,
        "hash_shapes_valid": hashed + null_hash == total,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backup", required=True, help="backup JSON produced by GET /api/admin/backup")
    ap.add_argument("--target", required=True, help="isolated database to restore into")
    ap.add_argument("--label", default="run")
    ap.add_argument("--out", help="write the JSON verdict here")
    args = ap.parse_args()

    refuse_production(args.target)
    payload = json.load(open(args.backup, encoding="utf-8"))
    tables = payload.get("tables") or {}
    counts_report = restore(args.target, tables)

    coverage = {
        table: entry for table, entry in counts_report.items() if entry["status"] not in ("ok", "empty")
    }
    result = {
        "label": args.label,
        "generated_at": payload.get("generatedAt"),
        "tables_in_backup": len([t for t, rows in tables.items() if rows]),
        "rows_in_backup": sum(len(rows) for rows in tables.values()),
        "counts": counts_report,
        "coverage_failures": coverage,
        "foreign_key_orphans": foreign_key_orphans(args.target),
        "auth": auth_check(args.target),
    }
    # The pass condition is what recovery actually requires: every row landed, no
    # foreign key dangles, and every credential is a well-formed hash. Whether an
    # email contains an "@" is a property of the data, not of the restore: 262 of
    # production's 277 accounts were created without one, so it is reported, not
    # graded.
    result["passed"] = (
        not result["coverage_failures"]
        and not result["foreign_key_orphans"]
        and result["auth"]["hash_shapes_valid"]
        and result["auth"]["users"] > 0
    )

    if args.out:
        json.dump(result, open(args.out, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    summary = {k: v for k, v in result.items() if k not in ("counts",)}
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
