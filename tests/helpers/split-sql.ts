/**
 * Split a migration file into statements without breaking on the semicolons that
 * live inside `DO $$ ... $$` bodies, function bodies or string literals.
 *
 * A naive split on ";" produced fragments like "DO $$ BEGIN IF ... END IF" and
 * comparing those fragments to themselves still passed, which is exactly how a
 * broken registry can look green. Both the registry generator and its drift test
 * use this function so they cannot disagree.
 */
export function splitSql(raw: string): string[] {
  const withoutComments = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  if (withoutComments.includes("--> statement-breakpoint")) {
    return withoutComments
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  const statements: string[] = [];
  let current = "";
  let inSingle = false;
  let dollarTag: string | null = null;

  for (let index = 0; index < withoutComments.length; index += 1) {
    const char = withoutComments[index];

    if (dollarTag) {
      current += char;
      if (withoutComments.startsWith(dollarTag, index)) {
        current += dollarTag.slice(1);
        index += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }

    if (inSingle) {
      current += char;
      if (char === "'") inSingle = false;
      continue;
    }

    if (char === "'") {
      inSingle = true;
      current += char;
      continue;
    }

    if (char === "$") {
      const match = /^\$[A-Za-z_]*\$/.exec(withoutComments.slice(index));
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        index += dollarTag.length - 1;
        continue;
      }
    }

    if (char === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}
