# dsh-markdown-preview

**In-chat preview for produced files in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web.**

By default, clicking a produced-file chip in the DSH Web GUI hands the file to
the operating system's default application (`open` on macOS → Xcode for many
extensions). This plugin takes over the produced-files row and makes the click
**render the file right in the conversation** — Markdown is rendered with
`markdown-it` + `highlight.js` server-side, images preview inline, **code
files (JSON / JS / TS / Python / YAML / …) open in a dark syntax-highlighted
code view**, and any other text file shows as plain text. The old behaviors
stay one click away: open in the system app, or reveal in the folder.

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

Restart `dsh web`. Requires pnpm on PATH (`dsh plugin` forwards to pnpm) and
DSH `>= 0.1.0-rc.6`.

## Usage

Nothing to configure. After restart, any turn that produced files shows the
familiar produced-files row; clicking a chip toggles the preview panel.

## How it works

- **Host half** (`lib/index.js`): registers a `/preview` RPC channel on
  `ctx.connection` with the `loopback` trust authority (the same
  DNS-rebinding / cross-site fence the `/api` surface uses). `read` returns
  the file — Markdown rendered to **escaped HTML** (`markdown-it` with
  `html:false`, safe-link policy), images as base64 data URLs, **code files
  highlighted server-side** (hljs by extension, 40+ languages), other text
  capped at 1 MiB with a binary NUL-byte sniff. `open` proxies the stock
  `host.openPath` so the native-app action is exactly the official one.
- **Client half** (`lib/client.js`): a standard `dsh.client` bundle. It owns
  the `deliverables` conversation-event kind and the
  `conversation.chat.turnTail` slot (the official `ui-deliverables` row is
  disabled by this bundle's patch; its prompt section and the
  `chatFileMentions` service are re-provided here), so the replacement is
  behavior-compatible, not a DOM hack.
- Rendering happens **on the host**, keeping the browser bundle thin and
  dependency-free.

## Compared to similar plugins

| Plugin | Shape | Difference |
|---|---|---|
| **dsh-markdown-preview (this)** | produced-files row takeover | Click-to-preview exactly where the official row is, zero extra surface |
| `dsh-file-explorer` | right-side file-tree panel | global panel, not the chat row |
| `dsh-file-mentions` | backtick-path mentions + tail chips | collects paths from reply text; official row wins when present |
| `dsh-md-preview` | render tool + web drawer | drawer/HTML export, not the chat row |
| `dsh-web-preview` | side web-preview panel | run/annotate projects, not produced files |

## Security notes

- The channel is loopback-only and behind the connection trust fence.
- Markdown is rendered with `html:false`; raw HTML in a document is escaped,
  and links are limited to `http(s)/mailto/#` by `markdown-it`'s default
  `validateLink`.
- Preview caps and binary sniffing prevent accidental memory/UI abuse; the
  preview is read-only (no write endpoint).

## Uninstall

```sh
dsh plugin --profile web remove dsh-markdown-preview
```

## Development

```sh
git clone https://github.com/GitHubJiKe/dsh-markdown-preview.git
cd dsh-markdown-preview
npm install          # markdown-it + highlight.js for the host half
dsh plugin --profile web add file:$(pwd)
# restart dsh web; the profile symlinks your working copy, so edits to
# lib/ apply after another restart (client bundles are scanned at boot)
```

## License

MIT

## Changelog

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
