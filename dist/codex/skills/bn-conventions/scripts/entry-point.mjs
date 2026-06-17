// The shared entry-point guard for the Banyan toolchain scripts. Zero-dep node:* only so it ports
// across hosts unchanged.
//
// Compares canonicalized real paths so the guard fires regardless of spaces in the path (no file://
// percent-encoding round-trip) or a symlinked invocation dir. On macOS, /tmp is a symlink to
// /private/tmp: `node /tmp/link.mjs` keeps the symlink in process.argv[1] while import.meta.url
// resolves to the realpath, so a raw `path.resolve(argv[1]) === fileURLToPath(url)` comparison
// fails to match and main() silently never runs. realpathSync canonicalizes both sides, falling
// back to resolve() only when the path does not exist on disk.

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function canonical(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

// True when the importing module is the process entry point (`node <script>`), false when it was
// imported by another module (e.g. a test). Pass `process.argv[1]` and `import.meta.url`.
export function isEntryPoint(argv1, importMetaUrl) {
  if (!argv1) return false;
  return canonical(argv1) === canonical(fileURLToPath(importMetaUrl));
}
