// dsh-markdown-preview — host half.
//
// Serves the browser half's preview surface on whichever route carrier the
// running DSH generation exposes (see `apply` below): exact Fetch routes below
// `/api` on 0.1.5+, the logical RPC channel `/preview` on 0.1.0/0.1.1. Both
// carriers call the same handler and are guarded by the connection trust fence.
// Endpoints:
//   read         { path } -> { ok:true, value:{ path, name, ext, kind, content,
//                             bytes, truncated, html?, dataUrl? } }
//                           or { ok:false, error } (missing/binary/too large/io)
//   open         { path } -> hands the path to the host desktop's default
//                             application (native opener).
//   capabilities {}       -> { canOpenPath }, so the browser half can decide
//                             whether to offer that native-open action.
//
// This half is additive. It registers no prompt section and claims no service
// owned by an official bundle: the final-response file-reference guidance and
// the `chatFileMentions` provider both stay with the official produced-files
// bundle, which this plugin does not disable. The browser half only reads the
// Turn data that bundle already publishes.
//
// Rendering runs here, not in the browser: markdown-it + highlight.js produce
// escaped HTML (html:false, safe-link policy), so the client stays thin and
// no raw markdown tooling ships to the page.
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/common";

/** Stable Cordis plugin name. */
const name = "markdown-preview";
/**
* Services required before the /preview channel mounts. `webServer` is
* mandatory on every generation this plugin supports: registering an RPC
* channel installs a prefix route through the reader's own Context, and
* Cordis refuses that route registration when the plugin did not declare the
* HTTP server it writes to. Official connection-route hosts declare the same
* pair.
*/
const inject = ["webServer", "connection"];
/** Text previews cap at 1 MiB; larger files return the leading chunk flagged truncated. */
const MAX_PREVIEW_BYTES = 1024 * 1024;
/** Image previews cap at 4 MiB (base64 inflates ~1.33x on the wire). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Binary sniff window: a NUL byte here means "not text, not previewable". */
const PROBE_BYTES = 8192;
/** Endpoints this half serves on whichever route carrier the generation exposes. */
const ENDPOINTS = ["read", "open", "capabilities"];
/** Exact Fetch-route prefix for the 0.1.5+ Connection generation (`/api` routes only). */
const ROUTE_PREFIX = "/api/markdown-preview.";
/** Logical RPC channel for the 0.1.0/0.1.1 Connection generation. */
const CHANNEL = "/preview";

/**
* Image extensions rendered inline as data URLs. SVG is included and safe:
* browsers never execute scripts inside SVG loaded through an <img> element
* (the client renders image kinds as <img src=dataUrl>), which neutralizes
* the script-injection concern that originally excluded it.
*/
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const IMAGE_MIME = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml"
};
/** Markdown-ish extensions get the rendered view; everything else is plain text. */
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdx"]);
/** Code-file extensions get a server-side highlighted `code` view (hljs). */
const CODE_EXTENSIONS = new Set([
  ".json", ".jsonc", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
  ".py", ".rb", ".go", ".rs", ".java", ".c", ".h", ".cpp", ".hpp", ".cs",
  ".php", ".swift", ".kt", ".sh", ".bash", ".zsh", ".yml", ".yaml",
  ".toml", ".ini", ".css", ".scss", ".less", ".html", ".htm", ".xml",
  ".svg", ".vue", ".sql", ".lua", ".r", ".pl", ".proto", ".graphql",
  ".dockerfile", ".makefile", ".mk"
]);
/** Extension → hljs language alias (common set; unknown languages fall back to plaintext). */
const LANG_BY_EXT = {
  ".json": "json", ".jsonc": "json",
  ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
  ".ts": "typescript", ".tsx": "typescript",
  ".py": "python", ".rb": "ruby", ".go": "go", ".rs": "rust",
  ".java": "java", ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp", ".cs": "csharp",
  ".php": "php", ".swift": "swift", ".kt": "kotlin",
  ".sh": "bash", ".bash": "bash", ".zsh": "bash",
  ".yml": "yaml", ".yaml": "yaml", ".toml": "ini", ".ini": "ini",
  ".css": "css", ".scss": "scss", ".less": "less",
  ".html": "xml", ".htm": "xml", ".xml": "xml", ".svg": "xml", ".vue": "xml",
  ".sql": "sql", ".lua": "lua", ".r": "r", ".pl": "perl",
  ".proto": "plaintext", ".graphql": "graphql",
  ".dockerfile": "plaintext", ".makefile": "makefile", ".mk": "makefile"
};

/**
* markdown-it with a safe profile: raw HTML is escaped to text (html:false),
* autolinking is off, and the built-in validateLink keeps hrefs to
* http/https/mailto/# only. `breaks: true` renders hard line breaks — the
* writing workflow this plugin targets (scripts, articles) relies on them.
* Code fences go through highlight.js (common language set) with escaped
* fallback for unknown languages.
*/
const md = new MarkdownIt({
	html: false,
	linkify: false,
	breaks: true,
	highlight(code, lang) {
		if (lang !== "" && hljs.getLanguage(lang)) {
			try {
				return `<pre class="dshmdp-hljs"><code class="hljs language-${md.utils.escapeHtml(lang)}">${hljs.highlight(code, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
			} catch {
				/* fall through to the escaped fallback */
			}
		}
		return `<pre class="dshmdp-hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`;
	}
});

/** RPC error shape the wire vocabulary expects. */
function rpcError(code, message, details = {}) {
	return { ok: false, error: { code, message, details } };
}
/** Workspace roots known to the host, for resolving relative produced paths. */
function workspaceRoots(ctx) {
	const registry = ctx.get("workspaceRegistry");
	const workspaces = typeof registry?.list === "function" ? registry.list() : [];
	return workspaces.map((workspace) => workspace?.path).filter((path) => typeof path === "string" && path !== "");
}

/**
* Validate + absolutize one path payload value. Absolute paths pass through;
* relative paths (produced-file references are workspace-relative) resolve
* against the session workspace root(s), never the host process cwd — the
* web service runs from the profile directory, so cwd-based resolution used
* to surface as ENOENT for every workspace-relative produced file.
*/
function targetPath(ctx, payload) {
	const raw = typeof payload === "object" && payload !== null ? payload.path : void 0;
	if (typeof raw !== "string" || raw === "") return void 0;
	if (raw.includes("\0")) return void 0;
	if (isAbsolute(raw)) return resolve(raw);
	const bases = workspaceRoots(ctx);
	const roots = bases.length > 0 ? bases : [process.cwd()];
	for (const root of roots) {
		const candidate = resolve(root, raw);
		if (existsSync(candidate)) return candidate;
	}
	return resolve(roots[0], raw);
}

/**
* Read one file for in-browser preview: Markdown rendered server-side,
* images as data URLs, everything else as capped plain text.
* @param path - absolute host path.
* @param signal - caller/connection lifetime; abort terminates the read.
* @returns the preview value.
*/
async function readPreview(path, signal) {
	const info = await stat(path, { signal });
	if (!info.isFile()) throw Object.assign(new Error("not a file"), { code: "preview-not-a-file" });
	const ext = extname(path).toLowerCase();
	if (IMAGE_EXTENSIONS.has(ext)) {
		if (info.size > MAX_IMAGE_BYTES) throw Object.assign(new Error("image is too large to preview"), { code: "preview-too-large" });
		const buffer = await readFile(path, { signal });
		return {
			path,
			name: basename(path),
			ext,
			kind: "image",
			bytes: buffer.length,
			truncated: false,
			dataUrl: `data:${IMAGE_MIME[ext]};base64,${buffer.toString("base64")}`
		};
	}
	const limited = info.size > MAX_PREVIEW_BYTES;
	let buffer = await readFile(path, { signal });
	if (buffer.length > MAX_PREVIEW_BYTES) buffer = buffer.subarray(0, MAX_PREVIEW_BYTES);
	if (buffer.subarray(0, PROBE_BYTES).includes(0)) throw Object.assign(new Error("binary file is not previewable"), { code: "preview-binary" });
	const content = buffer.toString("utf8");
	const isMarkdown = MARKDOWN_EXTENSIONS.has(ext);
	if (isMarkdown) {
		return {
			path,
			name: basename(path),
			ext,
			kind: "markdown",
			content,
			bytes: buffer.length,
			truncated: limited,
			html: md.render(content)
		};
	}
	if (CODE_EXTENSIONS.has(ext)) {
		const language = LANG_BY_EXT[ext] ?? "";
		let html;
		if (language !== "" && language !== "plaintext" && hljs.getLanguage(language)) {
			try {
				html = `<pre class="dshmdp-hljs dshmdp-code-pre"><code class="hljs language-${language}">${hljs.highlight(content, { language, ignoreIllegals: true }).value}</code></pre>`;
			} catch {
				html = `<pre class="dshmdp-hljs dshmdp-code-pre"><code>${md.utils.escapeHtml(content)}</code></pre>`;
			}
		} else {
			html = `<pre class="dshmdp-hljs dshmdp-code-pre"><code>${md.utils.escapeHtml(content)}</code></pre>`;
		}
		return {
			path,
			name: basename(path),
			ext,
			kind: "code",
			language,
			content,
			bytes: buffer.length,
			truncated: limited,
			html
		};
	}
	return {
		path,
		name: basename(path),
		ext,
		kind: "text",
		content,
		bytes: buffer.length,
		truncated: limited
	};
}

/**
* Resolve this composition's "open a path on the host desktop" backend.
*
* DSH moved that seam: the 0.1.0/0.1.1 generation exposes it as the ApiProxy
* gateway's `host.openPath` remote, and the 0.1.5+ generation moved it to the
* Session Controller's `openWorkspacePath`. Both are resolved lazily on each
* call, so this plugin mounts on either generation without declaring an inject
* its composition cannot satisfy.
* @param ctx - owning plugin context.
* @returns an opener returning the wire result, or undefined when none exists.
*/
function openBackend(ctx) {
	const apiProxy = ctx.get("apiProxy");
	if (typeof apiProxy?.host?.openPath === "function") {
		return async (path, signal) => {
			const response = await apiProxy.host.openPath({ rpcId: "markdown-preview-open", payload: { path } }, signal);
			return response.result;
		};
	}
	const controller = ctx.get("sessionController");
	if (typeof controller?.openWorkspacePath === "function") {
		return async (path, signal) => {
			await controller.openWorkspacePath({ path }, signal);
			return { ok: true, value: { opened: true } };
		};
	}
	return void 0;
}

/**
* Report whether this deployment can hand a produced path to a user-visible
* native desktop, so the browser half can hide an action that cannot work.
* @param ctx - owning plugin context.
* @param signal - caller lifetime.
* @returns the capability value.
*/
async function capabilities(ctx, signal) {
	const controller = ctx.get("sessionController");
	if (typeof controller?.canOpenWorkspacePath === "function") {
		try {
			return { canOpenPath: controller.canOpenWorkspacePath() === true };
		} catch {
			return { canOpenPath: false };
		}
	}
	const apiProxy = ctx.get("apiProxy");
	if (typeof apiProxy?.host?.describe === "function") {
		const response = await apiProxy.host.describe({ rpcId: "markdown-preview-capabilities", payload: {} }, signal);
		return { canOpenPath: response?.result?.ok === true && response.result.value?.canOpenPath === true };
	}
	return { canOpenPath: false };
}

/**
* Channel handler: dispatch one /preview endpoint to its worker.
* @param ctx - owning plugin context (host services resolved lazily per call).
* @returns the ConnectionRpcHandler.
*/
function createHandler(ctx) {
	return async (endpoint, payload, signal) => {
		try {
			if (endpoint === "read") {
				const path = targetPath(ctx, payload);
				if (path === void 0) return rpcError("bad-request", "path is required");
				return { ok: true, value: await readPreview(path, signal) };
			}
			if (endpoint === "open") {
				const path = targetPath(ctx, payload);
				if (path === void 0) return rpcError("bad-request", "path is required");
				const open = openBackend(ctx);
				if (open === void 0) return rpcError("internal", "no host desktop opener is available in this composition");
				return await open(path, signal);
			}
			if (endpoint === "capabilities") return { ok: true, value: await capabilities(ctx, signal) };
			return rpcError("bad-request", `unknown /preview endpoint ${JSON.stringify(endpoint)}`);
		} catch (error) {
			if (signal.aborted) return rpcError("cancelled", "preview aborted");
			const code = error?.code === "preview-not-a-file" || error?.code === "preview-binary" || error?.code === "preview-too-large" ? error.code : "internal";
			return rpcError(code, error instanceof Error ? error.message : String(error));
		}
	};
}

/**
* Plugin body: mount the /preview surface on whichever route carrier this
* Connection generation exposes, owned by this plugin's effect so unload
* removes it.
*
* DSH changed that carrier. The 0.1.0/0.1.1 line mounts a logical RPC channel
* (`ctx.connection.rpc.handle`, whose third argument is that generation's
* channel trust policy: loopback-only). The 0.1.5+ line keeps `rpc.handle` in
* its public types but its route registration writes through a Context that
* does not carry `webServer`, so a third-party plugin cannot use it; that
* generation's supported carrier is an exact Fetch route below `/api`
* (`ctx.connection.fetch.register`), which the shared channel fences with the
* same Host/Origin and browser-authentication policy before dispatch.
* @param ctx - host plugin context.
*/
function apply(ctx) {
	const handler = createHandler(ctx);
	if (typeof ctx.connection?.fetch?.register === "function") {
		for (const endpoint of ENDPOINTS) {
			ctx.effect(() => ctx.connection.fetch.register({
				path: `${ROUTE_PREFIX}${endpoint}`,
				methods: ["POST"],
				requestBody: "buffered",
				fetch: async (request) => {
					let payload;
					try {
						payload = (await request.json())?.payload;
					} catch {
						payload = void 0;
					}
					return Response.json(await handler(endpoint, payload, request.signal));
				}
			}), `markdown-preview: ${endpoint} exact route`);
		}
		return;
	}
	ctx.effect(() => ctx.connection.rpc.handle(CHANNEL, handler, { authority: "loopback" }), "markdown-preview: /preview channel");
}

export { apply, inject, name };
