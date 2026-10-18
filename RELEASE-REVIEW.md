# Release review

This directory is an independent local copy of the cell scene's import dependencies. The original project has not been edited. The release uses fresh Git history and a GitHub no-reply commit identity; original history and personal runtime data are excluded.

## Completed cleanup

- Included the cell entry point and its source dependencies, rather than copying every scene.
- Excluded environment files, credentials, browser profiles, logs, conversations, notes, generated outputs, saved worlds, models, recovery data, backups, screenshots, and original Git history.
- Removed the donation wallet, QR code, payment UI, and blockchain connection.
- Removed the account-connected browser integration and external scene navigation.
- Preserves all 693 authored simulated memory nodes, 303 pathways, 554 associations and the experience profile in `src/cell/default-brain.json`, with neutral identity and service-independent routing, validated through the runtime and scanned for credential and machine-identity patterns. Minimal and empty alternative graphs are provided under `examples/`.
- Isolated browser storage keys and the development port from the original project.
- Disabled AI dialogue by default; removed unconfigured provider service controls.
- Included only sound files referenced by the sound manifest and water scene. Removed ID3v2 and ID3v1 metadata containers from copied MP3 files.
- Added ignore rules and a repeatable privacy check. Personal cleanup provenance is kept outside this repository.

## Before a public release

- Choose the source-code license and confirm ownership of the code being licensed.
- Review redistribution rights for the included provider-generated sounds, source water audio, fonts, and fictional franchise names. Font license texts are included. Sound provenance has not been established sufficiently to claim an open-source asset license.
- Decide whether to keep or rename fictional franchise branding and character names.
- Review all source, visible text, and audio for personal information or identifying references that pattern matching cannot detect. The automated scan is a first pass, not an anonymity guarantee.
- Verify the optional API or OAuth integration against your chosen service and registered client; no live account compatibility is claimed. Choose the desired public backend architecture.
- Run `npm run privacy:check` after adding files, and inspect `git status --short --untracked-files=all` before the first commit.
- Use the desired public or GitHub no-reply identity when making the first commit. The initial package uses the account?s GitHub no-reply identity.

Do not copy the original `.git`, runtime data, or private configuration into this directory. No public upload has been made.

## Local verification

- Dependency installation and production build passed.
- The selected cell tests plus provider, graph, context-budget and cancellation regression tests passed; see [the independent review](docs/REVIEW-RESULTS.md) for findings and fixes.
- Browser smoke check passed: feed starts, computer opens/closes, water mode enters/exits, and WebGL canvases render. No page errors, failed HTTP responses, or external network requests were observed during that check with AI disabled.
- The privacy scanner passed on publication candidates. A separate synthetic fixture confirmed secret/path/email detection and redacted output.
- All 160 source files recorded at copy time still matched their original hashes afterward.
- A private local text-agent profile was tested through the scene. Other services, live OAuth registration, and asset redistribution rights remain to be verified.
- Two additional agents independently reviewed the package and the authoring/integration instructions. Technical findings were addressed. Dependency audit reports zero known vulnerabilities.

## GitHub package

Prepared as Cyberdyne T800 Agent Embodiment Project. Saved sessions, API credentials, private test adapters and browser undo data are excluded from both the repository and source ZIP. The default fictional biography remains included. The local test service has been disconnected. GitHub creation uses private visibility while source licensing and bundled sound rights remain unresolved.
