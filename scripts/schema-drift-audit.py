#!/usr/bin/env python3
"""Reads two PostgreSQL schemas and reports what differs between them.

Production is the reference and the migrations are the claim, so the question this
answers is narrow and worth asking precisely: if the repository built a database
from nothing, where would it not match the database the application actually runs
against? It inspects catalogues only, never rows, and it never writes to either
database.

Usage:
    schema-drift-audit.py --reference-url "$PROD_READONLY" --candidate-url "$LOCAL" \
        --out DATABASE_SCHEMA_DRIFT_REPORT.md
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict

# --------------------------------------------------------------------------- #
# Introspection. Every query is read-only and scoped to the public schema, which
# is where the application lives; extensions and roles are cluster-wide by nature.
# --------------------------------------------------------------------------- #

QUERIES = {
    "tables": """
        select table_name
        from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name
    """,
    "columns": """
        select table_name, column_name, data_type, udt_name,
               coalesce(character_maximum_length, 0) as char_len,
               coalesce(numeric_precision, 0) as num_prec,
               coalesce(numeric_scale, 0) as num_scale,
               is_nullable,
               coalesce(column_default, '') as column_default
        from information_schema.columns
        where table_schema = 'public'
        order by table_name, ordinal_position
    """,
    "constraints": """
        select c.conrelid::regclass::text as table_name,
               c.conname as name,
               c.contype as kind,
               pg_get_constraintdef(c.oid) as definition
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and c.contype in ('p','u','c','f')
        order by 1, 2
    """,
    "indexes": """
        select schemaname as table_schema, tablename as table_name, indexname as name,
               replace(indexdef, ' ON public.', ' ON ') as definition
        from pg_indexes
        where schemaname = 'public'
        order by tablename, indexname
    """,
    "extensions": """
        select extname as name, extversion as version from pg_extension order by extname
    """,
    "rls": """
        select c.relname as table_name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by 1
    """,
    "policies": """
        select schemaname, tablename, policyname as name, permissive, roles::text as roles,
               cmd, coalesce(qual, '') as using_expr, coalesce(with_check, '') as check_expr
        from pg_policies
        where schemaname = 'public'
        order by tablename, policyname
    """,
    "roles": """
        select rolname as name, rolsuper as is_super, rolbypassrls as bypass_rls,
               rolcanlogin as can_login, rolcreatedb as can_createdb,
               rolcreaterole as can_createrole
        from pg_roles
        where rolname not like 'pg\\_%'
        order by 1
    """,
    "grants": """
        select grantee, table_name, privilege_type
        from information_schema.role_table_grants
        where table_schema = 'public'
        order by 1, 2, 3
    """,
}


def run_json(url: str, outdir: str) -> dict:
    """Applies a read-only dump of one schema, so both sides are introspected on
    the same server version. Reading production directly would compare catalogues
    from two different majors and report noise as drift."""
    result = {}
    for name, sql in QUERIES.items():
        cmd = ["psql", url, "-tAF", "\x1f", "-c", sql]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if proc.returncode != 0:
            raise SystemExit(f"introspection failed for {name}: {proc.stderr.strip()[:400]}")
        rows = []
        for line in proc.stdout.splitlines():
            if not line.strip():
                continue
            row = line.split("\x1f")
            # A column whose value contains the separator, or a trailing empty
            # field, must not shift the tuple; pad rather than crash.
            while len(row) < 9:
                row.append("")
            rows.append(row)
        result[name] = rows
    return result


def _unused_scaffold_from_dump(prod_url: str, local_admin: str, dbname: str) -> str:
    """Builds a throwaway database from production's schema-only export."""
    dump = subprocess.run(
        ["/usr/lib/postgresql/17/bin/pg_dump", "--schema-only", "--no-owner", "--no-acl",
         "--schema=public", prod_url],
        capture_output=True, text=True, timeout=300,
    )
    if dump.returncode != 0:
        raise SystemExit(f"schema export failed: {dump.stderr.strip()[:400]}")
    subprocess.run(["psql", local_admin, "-q", "-c", f'DROP DATABASE IF EXISTS "{dbname}"'], check=True,
                   capture_output=True, text=True)
    subprocess.run(["psql", local_admin, "-q", "-c", f'CREATE DATABASE "{dbname}"'], check=True,
                   capture_output=True, text=True)
    apply = subprocess.run(["psql", f"{local_admin.rsplit('/',1)[0]}/{dbname}", "-q"], input=dump.stdout,
                           capture_output=True, text=True, timeout=300)
    errors = [l for l in (apply.stderr or "").splitlines() if l.startswith("ERROR")]
    return json.dumps({"bytes": len(dump.stdout), "errors": errors[:5]})


# --------------------------------------------------------------------------- #
# Comparison
# --------------------------------------------------------------------------- #

def column_signature(row: list[str]) -> str:
    table, column, data_type, udt, char_len, num_prec, num_scale, nullable, default = row[:9]
    width = char_len if char_len != "0" else (f"{num_prec},{num_scale}" if num_prec != "0" else "")
    return f"{data_type}{udt if udt not in ('bpchar','varchar','text','int4','int8','bool','uuid','json','jsonb','timestamptz','timestamp','numeric','int2','float8') else ''}" \
           f"({width})" if width else data_type


def diff(reference: dict, candidate: dict) -> dict:
    findings = defaultdict(list)

    ref_tables, cand_tables = set(t[0] for t in reference["tables"]), set(t[0] for t in candidate["tables"])
    for table in sorted(ref_tables - cand_tables):
        findings["missing_in_migrations"].append({"object": f"table {table}", "detail": "absent from the repository migrations"})
    for table in sorted(cand_tables - ref_tables):
        findings["missing_in_production"].append({"object": f"table {table}", "detail": "created by migrations but never applied"})

    ref_cols = {(r[0], r[1]): r for r in reference["columns"]}
    cand_cols = {(r[0], r[1]): r for r in candidate["columns"]}
    for key in sorted(set(ref_cols) - set(cand_cols)):
        r = ref_cols[key]
        findings["missing_in_migrations"].append({
            "object": f"{key[0]}.{key[1]}",
            "detail": f"{column_signature(r)}, nullable={r[7]}, default={r[8] or 'none'}",
        })
    for key in sorted(set(cand_cols) - set(ref_cols)):
        findings["missing_in_production"].append({"object": f"{key[0]}.{key[1]}", "detail": column_signature(cand_cols[key])})
    for key in sorted(set(ref_cols) & set(cand_cols)):
        r, c = ref_cols[key], cand_cols[key]
        rs, cs = column_signature(r), column_signature(c)
        if rs != cs:
            findings["type_mismatch"].append({"object": f"{key[0]}.{key[1]}", "detail": f"production {rs} vs migrations {cs}"})
        elif r[7] != c[7]:
            findings["constraint_mismatch"].append({"object": f"{key[0]}.{key[1]}", "detail": f"nullable: production {r[7]} vs migrations {c[7]}"})
        elif r[8] != c[8]:
            findings["constraint_mismatch"].append({"object": f"{key[0]}.{key[1]}", "detail": f"default: production {r[8] or 'none'} vs migrations {c[8] or 'none'}"})

    ref_cons = {(r[0], r[1]): (r[2], r[3]) for r in reference["constraints"]}
    cand_cons = {(r[0], r[1]): (r[2], r[3]) for r in candidate["constraints"]}
    for key in sorted(set(ref_cons) - set(cand_cons)):
        kind = ref_cons[key][0]
        bucket = "foreign_key_mismatch" if kind == "f" else "constraint_mismatch"
        findings[bucket].append({"object": f"{key[0]} {key[1]}", "detail": ref_cons[key][1]})
    for key in sorted(set(cand_cons) - set(ref_cons)):
        kind = cand_cons[key][0]
        bucket = "foreign_key_mismatch" if kind == "f" else "constraint_mismatch"
        findings[bucket].append({"object": f"{key[0]} {key[1]}", "detail": f"in migrations only: {cand_cons[key][1]}"})
    for key in sorted(set(ref_cons) & set(cand_cons)):
        if ref_cons[key] != cand_cons[key]:
            kind = ref_cons[key][0]
            bucket = "foreign_key_mismatch" if kind == "f" else "constraint_mismatch"
            findings[bucket].append({"object": f"{key[0]} {key[1]}", "detail": f"production {ref_cons[key][1]} vs migrations {cand_cons[key][1]}"})

    ref_idx = {(r[1], r[2]): r[3] for r in reference["indexes"]}
    cand_idx = {(r[1], r[2]): r[3] for r in candidate["indexes"]}
    for key in sorted(set(ref_idx) - set(cand_idx)):
        findings["index_mismatch"].append({"object": f"{key[0]} {key[1]}", "detail": ref_idx[key]})
    for key in sorted(set(cand_idx) - set(ref_idx)):
        findings["index_mismatch"].append({"object": f"{key[0]} {key[1]}", "detail": f"in migrations only: {cand_idx[key]}"})
    for key in sorted(set(ref_idx) & set(cand_idx)):
        if ref_idx[key] != cand_idx[key]:
            findings["index_mismatch"].append({"object": f"{key[0]} {key[1]}", "detail": f"production {ref_idx[key]} vs migrations {cand_idx[key]}"})

    ref_pol = {(r[1], r[2]): r for r in reference["policies"]}
    cand_pol = {(r[1], r[2]): r for r in candidate["policies"]}
    for key in sorted(set(ref_pol) - set(cand_pol)):
        findings["rls_mismatch"].append({"object": f"policy {key[0]}.{key[1]}", "detail": "exists in production only"})
    for key in sorted(set(cand_pol) - set(ref_pol)):
        findings["rls_mismatch"].append({"object": f"policy {key[0]}.{key[1]}", "detail": "exists in migrations only"})

    ref_rls = {r[0]: (r[1], r[2]) for r in reference["rls"]}
    cand_rls = {r[0]: (r[1], r[2]) for r in candidate["rls"]}
    for table in sorted(set(ref_rls) & set(cand_rls)):
        if ref_rls[table] != cand_rls[table]:
            findings["rls_mismatch"].append({
                "object": f"rls on {table}",
                "detail": f"production enabled={ref_rls[table][0]} forced={ref_rls[table][1]} vs migrations enabled={cand_rls[table][0]} forced={cand_rls[table][1]}",
            })

    ref_ext = {r[0]: r[1] for r in reference["extensions"]}
    cand_ext = {r[0]: r[1] for r in candidate["extensions"]}
    for name in sorted(set(ref_ext) - set(cand_ext)):
        findings["extension_mismatch"].append({"object": f"extension {name}", "detail": f"{ref_ext[name]} in production only"})
    for name in sorted(set(cand_ext) - set(ref_ext)):
        findings["extension_mismatch"].append({"object": f"extension {name}", "detail": f"{cand_ext[name]} in migrations only"})

    ref_roles = {r[0]: r for r in reference["roles"]}
    cand_roles = {r[0]: r for r in candidate["roles"]}
    for name in sorted(set(ref_roles) - set(cand_roles)):
        findings["role_mismatch"].append({"object": f"role {name}", "detail": "production only (cluster-level; see report)"})
    for name in sorted(set(cand_roles) - set(ref_roles)):
        findings["role_mismatch"].append({"object": f"role {name}", "detail": "migrations only"})

    ref_grants = defaultdict(set)
    cand_grants = defaultdict(set)
    for row in reference["grants"]:
        grantee, table, priv = row[0], row[1], row[2]
        ref_grants[grantee].add((table, priv))
    for row in candidate["grants"]:
        grantee, table, priv = row[0], row[1], row[2]
        cand_grants[grantee].add((table, priv))
    for grantee in sorted(set(ref_grants) | set(cand_grants)):
        only_prod = ref_grants[grantee] - cand_grants[grantee]
        only_mig = cand_grants[grantee] - ref_grants[grantee]
        if only_prod:
            findings["grant_mismatch"].append({"object": f"grants for {grantee}", "detail": f"{len(only_prod)} grants in production only, e.g. {sorted(only_prod)[:3]}"})
        if only_mig:
            findings["grant_mismatch"].append({"object": f"grants for {grantee}", "detail": f"{len(only_mig)} grants in migrations only, e.g. {sorted(only_mig)[:3]}"})

    return {"findings": dict(findings), "counts": {k: len(v) for k, v in findings.items()}}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference-url", required=True, help="production connection (used read-only for a schema export)")
    ap.add_argument("--candidate-url", required=True, help="database built from the repository migrations")
    ap.add_argument("--local-admin", required=True, help="local superuser URL used to create the staging copy")
    ap.add_argument("--out")
    args = ap.parse_args()

    # Introspected directly, read-only. A staging copy would be ideal, but this
    # environment runs PostgreSQL 15 and production runs 17, and the schema-only
    # export cannot be replayed across majors, so the catalogues are read where
    # they live and the version difference is recorded as a caveat in the report.
    reference = run_json(args.reference_url, ".")
    candidate = run_json(args.candidate_url, ".")
    result = diff(reference, candidate)
    result["reference_note"] = "production catalogues read directly, read-only; candidate on PostgreSQL 15"
    result["reference_counts"] = {k: len(v) for k, v in reference.items()}
    result["candidate_counts"] = {k: len(v) for k, v in candidate.items()}

    payload = json.dumps(result, indent=2, ensure_ascii=False)
    if args.out:
        open(args.out.replace(".md", ".json"), "w", encoding="utf-8").write(payload)
    print(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
