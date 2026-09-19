# dsh-markdown-preview

**In-chat preview for produced files in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web.**

By default, clicking a produced-file chip in the DSH Web GUI hands the file to
the operating system's default application (`open` on macOS → Xcode for many
extensions). This plugin makes that click **render the file right in the
conversation** — Markdown is rendered with `markdown-it` + `highlight.js`
server-side, images preview inline, **code files (JSON / JS / TS / Python /
YAML / …) open in a dark syntax-highlighted code view**, and any other text file
shows as plain text. The stock behaviors stay one click away: open in the system
app, or reveal in the folder.

## Features

- **Click a produced-file chip → inline preview**, no native app, no new tab.
- **Markdown rendered properly** (GFM tables, fenced code, blockquotes, links,
  hard line breaks) with **syntax highlighting** in code fences
  (highlight.js common languages).
- **Code-file preview with full syntax highlighting** (v0.3.0): 40+ extensions
  (`.json` `.js` `.ts` `.py` `.yml` `.sh` `.css` `.html` …) render in a dark
  editor-style view with GitHub-Dark token colors, highlighted server-side.
- **Fullscreen viewer** (v0.3.0): one click expands the preview — Markdown,
  image, code, or plain text — to a full-viewport overlay with the toolbar
  kept on top; close with the button or `Esc`.
- **Image preview** (PNG / JPEG / GIF / WebP / SVG) as data URLs — no extra
  route. SVG is safe to inline: browsers never execute scripts inside SVG
  loaded through an `<img>` element.
- Plain-text fallback for every other text file; binary files are sniffed and
  refused with a clear message.
- Panel header with file size, **fullscreen**, **copy content**, **open in
  system app**, and collapse.
- 1 MiB cap for text / 4 MiB for images, with an explicit truncation notice.
- Keeps the stock experience: chips, "+ N files", and "Show in folder" still
  behave as before, and inline code-mentions of produced files stay clickable.
- **Theme-aware preview panel**: background, body text, links, code and error
  colors all use real DSH theme variables (v0.1.1 fixes unreadable text on the
  always-white background in dark mode).

## Install

```sh
dsh plugin --profile web add dsh-markdown-preview
```

Restart `dsh web`. Requires pnpm on PATH (`dsh plugin` forwards to pnpm),
**Node.js >= 20**, and DSH `>= 0.1.1-rc.2 < 0.2.0`.

## Usage

Nothing to configure. After restart, any turn that produced files shows the
familiar produced-files row; clicking a chip toggles the preview panel.

## How it works

This plugin is **purely additive**. Its Bundle Patch inserts one plugin-owned
row and disables, renames, and re-declares nothing: every official component
keeps its own registration and its own entry ID. In particular the official
produced-files bundle stays enabled — this plugin does not take over its
`deliverables` Conversation Node definition, its `chatFileMentions` provider,
its `deliverables` locale namespace, or its host-side file-reference prompt
section.

- **One slot entry, won by priority.** The produced-files row lives on the
  `conversation.chat.turnTail` **chain** seat. A chain seat elects the first
  entry whose selector accepts, in ascending slot priority, which is the slot
  layer's documented extension point ("register at a different priority to
  shadow it"). The client half registers there at priority `-1`: the smallest step that
  beats the official fallback (priority `0`) while leaving every contributor
  below it room to shadow this row — a specialised produced-HTML row at `-10`,
  for instance, keeps the HTML turns it selects for. The official row stays
  registered and renders as before for every turn this plugin declines, and
  whenever this plugin is uninstalled.
- **The file list is read, not recomputed.** The selector reads the
  `deliverables` Turn data that the official row already publishes. Turns that
  also declare *presented* files deliberately decline here, so the official
  row keeps the surface and host routes that own them. This plugin therefore
  expects the official produced-files row to stay enabled — it ships in the
  `dsh-web-app` bundle, and if another layer disables it there is no published
  produced-file list left to preview.
- **Host half** (`lib/index.js`): serves `read` (file content — Markdown
  rendered to **escaped HTML** with `markdown-it` `html:false` and its
  safe-link policy, images as base64 data URLs, **code files highlighted
  server-side** by extension, other text capped at 1 MiB after a binary
  NUL-byte sniff), `open` (native desktop opener), and `capabilities`. Both
  `read` and `open` resolve workspace-relative paths against the registered
  workspace roots, never the host process cwd.
- **Two route carriers, one contract.** DSH moved route registration between
  connection generations, so the host half mounts whichever carrier the running
  DSH exposes:
  - **0.1.5 and newer** — exact Fetch routes below `/api`
    (`/api/markdown-preview.read|open|capabilities`), the carrier official
    plugins use. Its shared channel applies the same Host/Origin fence and
    browser-authentication policy before dispatch.
  - **0.1.0 / 0.1.1** — the logical RPC channel `/preview`, registered with
    that generation's `loopback` trust authority.

  The browser half elects the carrier on its first call and falls back to the
  other one if a carrier answers nothing in this plugin's vocabulary, so both
  generations work without configuration. Both carriers call the same handler.
- Rendering happens **on the host**, keeping the browser bundle thin and
  dependency-free (it requires only `react`).

## Compatibility and verification

`package.json` declares an exact `dsh.compatibility.dshReleases` matrix. Every
`compatible` entry below was verified by **installing this plugin into a
disposable DSH profile and booting it on an isolated port**, then driving the
plugin's own preview surface over HTTP and confirming that the official
produced-files surface was still mounted:

| DSH release | Compatibility | Install / start / uninstall | Route carrier observed |
|---|---|---|---|
| `0.1.1-rc.2` | compatible | passed | logical `/preview` channel |
| `0.1.5-rc.2` | compatible | passed | exact `/api/markdown-preview.*` routes |
| `0.1.6-alpha.1` | unknown | unknown | not run (see note) |
| `0.1.6-alpha.2` | compatible | passed | exact `/api/markdown-preview.*` routes |

Each run checked: the web service starts with no plugin error and no duplicate
registration; `POST` on the plugin's `capabilities` and `read` endpoints answers
with the expected result; a Markdown file comes back rendered with server-side
`highlight.js`; the official produced-files client is still present in the
served boot manifest and its bundle still returns `200`; this plugin's client
bundle is registered in the boot manifest and served; and the service shuts
down cleanly. `test/mock-test.mjs` covers the same contract offline for both
carriers (68 assertions).

> `0.1.6-alpha.1` is declared `unknown` rather than `compatible` because that
> release cannot be booted cleanly from npm: its caret dependency ranges resolve
> to `0.1.6-alpha.2` internals, and `@deepseek-ai/dsh-app-boot` dropped an export
> that `0.1.6-alpha.1` still imports. The package surfaces this plugin depends on
> were checked statically on that release and match `0.1.6-alpha.2`, but no clean
> install/start/uninstall run was possible, so no run evidence is claimed.

Releases outside the table (for example `0.1.2-alpha.*`, `0.1.3-alpha.*`,
`0.1.5-alpha.*`, `0.1.5-rc.1`) are undeclared, which the registry records as
`unknown`.

## Compared to similar plugins

| Plugin | Shape | Difference |
|---|---|---|
| **dsh-markdown-preview (this)** | wins the produced-files chain seat | Click-to-preview exactly where the official row is; the official row is left enabled as the fallback |
| `dsh-file-explorer` | right-side file-tree panel | global panel, not the chat row |
| `dsh-file-mentions` | backtick-path mentions + tail chips | collects paths from reply text; official row wins when present |
| `dsh-md-preview` | render tool + web drawer | drawer/HTML export, not the chat row |
| `dsh-web-preview` | side web-preview panel | run/annotate projects, not produced files |

## Security notes

- The preview surface sits behind the connection trust fence on both carriers:
  the `/preview` channel is registered `loopback`-only, and the `/api` exact
  routes inherit the shared channel's Host/Origin fence plus browser
  authentication.
- Markdown is rendered with `html:false`; raw HTML in a document is escaped,
  and links are limited to `http(s)/mailto/#` by `markdown-it`'s default
  `validateLink`.
- Preview caps and binary sniffing prevent accidental memory/UI abuse; the
  preview is read-only (no write endpoint).
- `open` only ever hands a path to the deployment's own native desktop opener;
  it never executes the file. `capabilities` is consulted first, so the action
  is hidden on deployments without a native desktop.

## Uninstall

```sh
dsh plugin --profile web remove dsh-markdown-preview
```

Removing the plugin leaves nothing behind: the Bundle Patch inserted only its
own row, and the official produced-files row was never disabled.

## Development

```sh
git clone https://github.com/GitHubJiKe/dsh-markdown-preview.git
cd dsh-markdown-preview
npm install          # markdown-it + highlight.js for the host half
npm test             # offline smoke test (bundle contract + both carriers)
dsh plugin --profile web add file:$(pwd)
# restart dsh web; client bundle changes need a page refresh, host changes
# need a restart
```

To test the host contract against several DSH releases without touching a live
profile, point `DSH_HOME` at a scratch directory, create a profile there whose
`dsh.profile.bundles` list ends with `dsh-markdown-preview`, and boot it on a
spare port with `--no-open`.

## License

MIT

## Changelog

- **v0.4.0** (2026-09-19): **Additive slot contribution + dual-generation
  support.** The Bundle Patch no longer disables the official produced-files
  row; the plugin now registers a single entry on the
  `conversation.chat.turnTail` chain seat at priority `-1` and reads the
  `deliverables` Turn data that official row publishes, so nothing official is
  disabled, replaced, or re-implemented. The host half now mounts whichever
  route carrier the running DSH exposes — exact `/api/markdown-preview.*` Fetch
  routes on 0.1.5+, the `/preview` logical RPC channel on 0.1.0/0.1.1 — and
  resolves the native opener through either the ApiProxy gateway or the Session
  Controller. `dsh.compatibility` now declares an exact per-release matrix, a
  DSH range, `profiles: ["web"]`, and per-release install/start/uninstall
  evidence; `engines.node` is declared as `>=20`. Turns that also declare
  *presented* files decline the chain so the official row keeps them.
- **v0.3.0** (2026-08-17): Code-file syntax highlighting + fullscreen viewer.
  `read` now serves 40+ code extensions (`.json` `.js` `.ts` `.py` `.yml`
  `.sh` `.css` `.html` …) as a new `code` kind with server-side hljs
  highlighting rendered in a dark editor-style view (GitHub-Dark token
  colors); markdown fenced code blocks also gained real token colors (they
  previously had transparent-only hljs styling). The panel header adds a
  **fullscreen** action: the preview — markdown, image, code, or plain text —
  opens in a fixed full-viewport overlay that keeps the toolbar (copy /
  collapse replaced by close) and exits via button or `Esc`.
- **v0.2.0** (2026-08-16): SVG preview support + workspace-relative path
  resolution. `.svg` joins the inline image set (safe: `<img>` never runs
  embedded scripts), and relative produced-file paths now resolve against the
  registered workspace roots instead of the host process cwd, fixing ENOENT
  for workspace-relative files.
- **v0.1.1** (2026-08-15): Fix unreadable preview text in dark mode. The panel
  used the non-existent `--dsw-alias-surface-raised` variable, so its background
  was always white while body text inherited the chat area's light dark-mode
  color. Background/text/link/error colors now use real theme variables
  (`--dsw-alias-bg-layer-1`, `--dsw-alias-label-primary`,
  `--dsw-alias-brand-primary`, `--dsw-alias-state-error-primary`), so the panel
  follows light/dark themes automatically.
- **v0.1.0** (2026-08-15): Initial release.
