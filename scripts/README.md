# scripts/

Development and maintenance scripts. The PowerShell scripts require
[PowerShell 7+](https://github.com/PowerShell/PowerShell) (`pwsh`) and run on
macOS, Linux, and Windows — install via `brew install --cask powershell`
(macOS), your package manager (Linux), or `winget install Microsoft.PowerShell`
(Windows). Only this dev loop needs `pwsh`; the plugin itself (`plugin/`) never
uses it.

| Script | Purpose |
| --- | --- |
| `smoke.ps1` | End-to-end smoke test: builds the fixture sandbox, installs the plugin into it, asserts the clean test baseline is green, and runs `/bn-hello` headlessly to prove the load path. |
| `fixture-init.ps1` | Materializes `test/fixture-repo/` into a throwaway git sandbox with a clean `main` branch and a `seeded-bugs` overlay branch. Refuses to delete targets outside `tmp/`. |
| `dev-install.ps1` | Copies or symlinks the plugin into a sandbox project so a `claude` session loads it without a marketplace round-trip. Prints the in-target plugin path. |
| `vendor.ps1` | Drift reporter for assets vendored from compound-engineering: compares local files against the pinned upstream SHA recorded in `vendor/vendor-map.json`. |
| `validate-frontmatter.py` | Runs the plugin-packaged `.banyan/solutions/` frontmatter parser-safety validator. |

Typical dev loop:

```
pwsh scripts/smoke.ps1                 # full check
pwsh scripts/fixture-init.ps1 -Force   # just rebuild the sandbox
pwsh scripts/vendor.ps1 -Status        # check vendored files for drift
```
