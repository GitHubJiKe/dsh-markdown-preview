/**
 * dsh-markdown-preview 冒烟测试（Node，无浏览器）。
 *
 * 1) 上架契约：bundle patch 必须纯新增（不出现 disabled、entryIds 只有插件自有 ID），
 *    manifest 必须声明 SemVer / Node 与 DSH 兼容范围 / 逐版本 dshReleases。
 * 2) 宿主半：两代路由载体各验一遍 —— 0.1.5+ 的 `/api/markdown-preview.<endpoint>`
 *    精确 Fetch 路由，以及 0.1.0/0.1.1 的 `/preview` 逻辑 RPC 通道。
 * 3) 浏览器半：mock window.__ModuleLoader__ + react + fetch，验证
 *    turn-tail 单条负优先级注册、不触碰官方服务、两代载体自动选举、组件渲染。
 */
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const tmp = await mkdtemp(join(tmpdir(), "dsh-mdpx-test-"));
const jsonPath = join(tmp, "data.json");
const jsPath = join(tmp, "app.js");
const mdPath = join(tmp, "note.md");
const txtPath = join(tmp, "plain.txt");
await writeFile(jsonPath, '{\n  "name": "demo",\n  // comment\n  "num": 42\n}');
await writeFile(jsPath, "const x = 1; // hi\nfunction run() { return x; }\n");
await writeFile(mdPath, "# Title\n\n```json\n{\"a\": 1}\n```\n");
await writeFile(txtPath, "hello plain");

// ── 0. Bundle Patch / manifest 上架契约 ──
{
  const patch = await readFile(join(root, "cordis.patch.yml"), "utf8");
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const ids = [...patch.matchAll(/(?:^|\n)\s*- id:\s*['"]?([A-Za-z0-9][A-Za-z0-9._-]{0,95})['"]?\s*(?:\n|$)/g)].map((m) => m[1]);
  check("patch declares exactly one plugin-owned entry ID",
    ids.length === 1 && ids[0] === "markdown-preview", `ids=${JSON.stringify(ids)}`);
  check("patch disables no official row", /disabled:\s*true/i.test(patch) === false);
  check("patch impersonates no protected namespace",
    /\bname:\s*['"]?@deepseek-ai\//i.test(patch) === false);
  check("patch inserts the plugin by its package name",
    /name:\s*'dsh-markdown-preview'/.test(patch));
  check("manifest declares the bundle patch and a bumped SemVer",
    manifest.dsh?.bundle?.patch === "./cordis.patch.yml" && /^\d+\.\d+\.\d+$/.test(manifest.version), `v${manifest.version}`);
  const releases = manifest.dsh?.compatibility?.dshReleases ?? {};
  const statuses = new Set(Object.values(releases));
  check("manifest declares exact dshReleases statuses",
    Object.keys(releases).length > 0 && [...statuses].every((s) => ["compatible", "incompatible", "unknown"].includes(s)),
    JSON.stringify(releases));
  check("at least one declared release is compatible", Object.values(releases).includes("compatible"));
  check("manifest declares a Node range and a DSH range",
    typeof manifest.engines?.node === "string" && typeof manifest.dsh?.compatibility?.dsh === "string",
    `node=${manifest.engines?.node} dsh=${manifest.dsh?.compatibility?.dsh}`);
  check("manifest keeps a resolvable lifecycle-free package",
    ["preinstall", "install", "postinstall", "prepare"].every((s) => manifest.scripts?.[s] === undefined));
}

// ── 1. 宿主半：两代路由载体 ──
const server = await import("../lib/index.js");
check("server exports", server.name === "markdown-preview" && Array.isArray(server.inject) && typeof server.apply === "function",
  `name=${server.name}`);
check("server injects webServer + connection (no official prompt section is re-registered)",
  JSON.stringify(server.inject) === JSON.stringify(["webServer", "connection"]), `inject=${JSON.stringify(server.inject)}`);

let channelPath = null;
let channelHandler = null;
let routes = [];
const makeServerCtx = (services = {}) => {
  channelPath = null;
  routes = [];
  return {
    effect: (fn) => fn(),
    get: (service) => (service === "workspaceRegistry" ? { list: () => [{ path: tmp }] } : services[service]),
    connection: {
      rpc: { handle: (path, handler) => { channelPath = path; channelHandler = handler; return () => {}; } },
      ...(services.exactRoutes === true ? {
        fetch: {
          register: (route) => {
            routes.push(route);
            return () => {};
          }
        }
      } : {})
    }
  };
};

// 1a. 0.1.0/0.1.1 载体：逻辑 RPC 通道
server.apply(makeServerCtx({}));
check("legacy carrier: logical RPC channel mounted, no exact routes",
  channelPath === "/preview" && routes.length === 0, `path=${channelPath} routes=${routes.length}`);

const call = (endpoint, payload, services = {}) => {
  server.apply(makeServerCtx(services));
  return channelHandler(endpoint, payload, new AbortController().signal);
};

// 1b. 0.1.5+ 载体：/api 下的精确 Fetch 路由
server.apply(makeServerCtx({ exactRoutes: true }));
check("modern carrier: exact routes only, no logical channel",
  channelPath === null && routes.length === 3 && routes.every((r) => r.path.startsWith("/api/markdown-preview.") && r.methods.includes("POST")),
  `routes=${JSON.stringify(routes.map((r) => r.path))}`);

const callRoute = async (endpoint, payload, services = {}) => {
  server.apply(makeServerCtx({ ...services, exactRoutes: true }));
  const route = routes.find((r) => r.path === `/api/markdown-preview.${endpoint}`);
  if (route === void 0) throw new Error(`no exact route for ${endpoint}`);
  const response = await route.fetch(new Request(`http://127.0.0.1:3080${route.path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload })
  }));
  return response.json();
};

for (const [label, run] of [["channel", (endpoint, payload, services) => call(endpoint, payload, services)],
  ["route", (endpoint, payload, services) => callRoute(endpoint, payload, services)]]) {
  {
    const r = await run("read", { path: "data.json" });
    check(`${label}: json → code kind`, r.ok === true && r.value.kind === "code" && r.value.language === "json",
      `kind=${r.value?.kind} lang=${r.value?.language}`);
    check(`${label}: code html highlighted`,
      typeof r.value.html === "string" && r.value.html.includes("hljs") && r.value.html.includes("dshmdp-code-pre"));
    check(`${label}: raw content preserved`, r.value.content.includes('"num": 42'));
  }
  {
    const r = await run("read", { path: "app.js" });
    check(`${label}: js → code kind`, r.ok === true && r.value.kind === "code" && r.value.language === "javascript",
      `lang=${r.value?.language}`);
    check(`${label}: js highlighted keywords`,
      r.value.html.includes("hljs-keyword") && r.value.html.includes("hljs-comment"));
  }
  {
    const r = await run("read", { path: "note.md" });
    check(`${label}: md → markdown kind`, r.ok === true && r.value.kind === "markdown" && typeof r.value.html === "string");
    check(`${label}: md fence highlighted`, r.value.html.includes("hljs") && r.value.html.includes("language-json"));
  }
  {
    const r = await run("read", { path: "plain.txt" });
    check(`${label}: txt → text kind`, r.ok === true && r.value.kind === "text" && r.value.html === void 0);
  }
  {
    const r = await run("read", { path: "nope.json" });
    check(`${label}: missing file errors`, r.ok === false && typeof r.error.message === "string");
  }
  {
    const r = await run("read", {});
    check(`${label}: missing path is a bad request`, r.ok === false && r.error.code === "bad-request");
  }
  if (label === "channel") {
    const r = await run("bogus", {});
    check("channel: an endpoint the channel does not own is refused", r.ok === false && r.error.code === "bad-request");
  } else {
    check("route: only the three endpoints are mounted, so an unknown one cannot route here",
      routes.map((r) => r.path).sort().join(",") === "/api/markdown-preview.capabilities,/api/markdown-preview.open,/api/markdown-preview.read");
    const response = await routes[0].fetch(new Request("http://127.0.0.1:3080/api/markdown-preview.read", { method: "POST", body: "not json" }));
    const body = await response.json();
    check("route: a malformed body still answers in this plugin's vocabulary",
      body.ok === false && body.error.code === "bad-request", JSON.stringify(body));
  }
  {
    const legacy = await run("capabilities", {}, {
      apiProxy: { host: { describe: () => Promise.resolve({ result: { ok: true, value: { canOpenPath: true } } }) } }
    });
    check(`${label}: capabilities reads the legacy ApiProxy gateway`, legacy.ok === true && legacy.value.canOpenPath === true);
  }
  {
    const modern = await run("capabilities", {}, {
      sessionController: { canOpenWorkspacePath: () => true, openWorkspacePath: () => Promise.resolve() }
    });
    check(`${label}: capabilities reads the Session Controller`, modern.ok === true && modern.value.canOpenPath === true);
  }
  {
    const none = await run("capabilities", {});
    check(`${label}: capabilities degrades to false with no opener`, none.ok === true && none.value.canOpenPath === false);
  }
  {
    const seen = [];
    const r = await run("open", { path: "data.json" }, {
      apiProxy: { host: { openPath: (request) => { seen.push(request.payload.path); return Promise.resolve({ result: { ok: true, value: { opened: true } } }); } } }
    });
    check(`${label}: open uses the legacy ApiProxy opener`, r.ok === true && seen[0] === jsonPath);
  }
  {
    const seen = [];
    const r = await run("open", { path: "data.json" }, {
      sessionController: { openWorkspacePath: (request) => { seen.push(request.path); return Promise.resolve(); } }
    });
    check(`${label}: open uses the Session Controller opener`, r.ok === true && seen[0] === jsonPath);
  }
  {
    const r = await run("open", { path: "data.json" });
    check(`${label}: open reports an unavailable opener`, r.ok === false && r.error.code === "internal");
  }
}

// ── 2. 浏览器半 ──
globalThis.window = {
  __ModuleLoader__: { load: (desc) => { if (desc.id === "dsh-markdown-preview") factory = desc.factory; } },
  addEventListener: () => {},
  removeEventListener: () => {}
};
globalThis.document = {
  querySelector: () => null,
  head: { appendChild: () => {} },
  createElement: () => ({ dataset: {}, set textContent(v) {} })
};
let factory = null;
let hookSeq = 0;
const reactState = new Map();
const reactMock = {
  useState: (init) => {
    const key = hookSeq++;
    if (!reactState.has(key)) reactState.set(key, init);
    return [reactState.get(key), (next) => reactState.set(key, typeof next === "function" ? next(reactState.get(key)) : next)];
  },
  useRef: (init) => ({ current: init }),
  useEffect: (fn) => { try { fn(); } catch { /* effect smoke */ } },
  Fragment: "Fragment"
};
const cleanChildren = (c) => Array.isArray(c) ? c.flat(Infinity).filter((x) => x !== false && x !== null && x !== void 0) : c;
const jsxRuntimeMock = {
  jsx: (type, props) => ({ type, props: { ...props, children: cleanChildren(props.children) } }),
  jsxs: (type, props) => ({ type, props: { ...props, children: cleanChildren(props.children) } })
};
const modules = { "react/jsx-runtime": jsxRuntimeMock, "react": reactMock };
await import("../lib/client.js");
check("client factory invoked without the removed runtime package", typeof factory === "function");
const client = factory((id) => {
  if (!Object.hasOwn(modules, id)) throw new Error(`client requires an unregistered module: ${id}`);
  return modules[id];
});
check("client exports", typeof client.apply === "function" && typeof client.PreviewRow === "function");

// apply 注册验证 + 不得触碰官方表面
let registeredOptions = null;
const forbidden = (label) => () => { throw new Error(`client touched ${label}`); };
{
  const ctx = {
    get: (service) => service === "connection" ? { rpc: { call: () => Promise.resolve({ ok: true }) }, isLoopback: true } : void 0,
    locale: { register: () => () => {}, bind: () => (k) => k },
    slots: {
      register: (options) => { registeredOptions = options; return () => {}; },
      inject: (slot, cb) => { cb(); return () => {}; }
    },
    effect: (fn) => fn(),
    get conversationEvents() { return { register: forbidden("conversationEvents.register") }; },
    provide: forbidden("ctx.provide"),
    systemPrompt: forbidden("ctx.systemPrompt")
  };
  client.apply(ctx);
  check("turnTail registered",
    registeredOptions !== null && registeredOptions.name === "conversation.chat.turnTail" && typeof registeredOptions.select === "function");
  check("turnTail wins the seat from the official fallback (priority 0)",
    typeof registeredOptions.priority === "number" && registeredOptions.priority < 0, `priority=${registeredOptions?.priority}`);
  check("turnTail defers to specialised rows below it (e.g. a produced-HTML row at -10)",
    registeredOptions.priority > -10, `priority=${registeredOptions?.priority}`);
  check("client injects no conversationEvents service",
    JSON.stringify(client.inject) === JSON.stringify(["slots", "locale", "connection"]), `inject=${JSON.stringify(client.inject)}`);
}

// select 接管/让位规则
{
  const select = registeredOptions.select;
  const owner = (data, seq = 9) => ({ turn: { data: { get: (key) => (key === "deliverables" ? data : void 0) } }, seq });
  check("select declines turns without deliverables data", select(owner(void 0)) === null);
  check("select declines turns that produced nothing", select(owner({ produced: [] })) === null);
  check("select accepts produced files",
    JSON.stringify(select(owner({ produced: [{ seq: 1, path: "a.md" }, { seq: 2, path: "a.md" }, { seq: 3, path: "b.md" }] }))) === JSON.stringify(["a.md", "b.md"]));
  check("select excludes settlements after the closing seq",
    JSON.stringify(select(owner({ produced: [{ seq: 1, path: "a.md" }, { seq: 12, path: "late.md" }] }, 9))) === JSON.stringify(["a.md"]));
  check("select declines presented-file turns so the official row keeps them",
    select(owner({ produced: [{ seq: 1, path: "a.md" }], presented: [{ path: "a.md" }] })) === null);
}

// 组件：两代载体各跑一遍读取路径
const codeValue = {
  path: "data.json", name: "data.json", ext: ".json", kind: "code", language: "json",
  content: '{"a":1}', bytes: 8, truncated: false,
  html: '<pre class="dshmdp-hljs dshmdp-code-pre"><code class="hljs language-json"><span class="hljs-attr">&quot;a&quot;</span></code></pre>'
};
/** Install one transport pair: whatever the stub answers, the other side stays silent. */
const installTransport = (mode) => {
  const routeCalls = [];
  const channelCalls = [];
  globalThis.fetch = (input, init) => {
    const url = String(input);
    routeCalls.push(url);
    if (mode !== "route") return Promise.resolve(new Response("not found", { status: 404 }));
    const endpoint = url.slice(url.lastIndexOf(".") + 1);
    const value = endpoint === "capabilities" ? { canOpenPath: true } : codeValue;
    return Promise.resolve(Response.json({ ok: true, value }));
  };
  const rpc = {
    call: (channel, endpoint, payload) => {
      channelCalls.push(`${channel}/${endpoint}`);
      if (mode !== "channel") return Promise.reject(new Error("channel unavailable"));
      return Promise.resolve({ ok: true, value: endpoint === "capabilities" ? { canOpenPath: true } : codeValue });
    }
  };
  return { rpc, routeCalls, channelCalls };
};

for (const mode of ["route", "channel"]) {
  reactState.clear();
  const { rpc, routeCalls, channelCalls } = installTransport(mode);
  const renderRow = () => {
    hookSeq = 0;
    return client.PreviewRow({ matched: ["data.json"], openFile: () => {}, isLoopback: true, rpc, t: (k) => k });
  };
  renderRow();
  const mounted = renderRow();
  const chip = mounted.props.children[1].props.children[0];
  chip.props.onClick();
  renderRow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const tree = renderRow();
  const panel = tree.props.children.find((c) => c !== void 0 && c.props?.className === "dshmdp_preview");
  check(`${mode} carrier: click renders the preview panel`, panel !== void 0);
  const head = panel?.props.children[0];
  const labels = head.props.children[2].props.children
    .map((b) => (typeof b === "object" && b !== null ? b.props.children : "")).filter((x) => typeof x === "string");
  check(`${mode} carrier: fullscreen + copy + native-open actions present`,
    labels.includes("preview.fullscreen") && labels.includes("preview.copy") && labels.includes("preview.openInApp"),
    `labels=${JSON.stringify(labels)}`);
  check(`${mode} carrier: only this carrier was used`,
    mode === "route" ? channelCalls.length === 0 && routeCalls.length > 0 : routeCalls.every((u) => u.startsWith("/api/")) && channelCalls.length > 0,
    `route=${routeCalls.length} channel=${channelCalls.length}`);
  check(`${mode} carrier: code view rendered`,
    panel.props.children[1].props.children.some((c) => c !== void 0 && c.props?.className === "dshmdp_code"));
}

// 无任何载体时回落到平台自带打开器
{
  reactState.clear();
  const { rpc } = installTransport("none");
  const opened = [];
  const renderRow = () => {
    hookSeq = 0;
    return client.PreviewRow({ matched: ["data.json"], openFile: (p) => opened.push(p), isLoopback: false, rpc, t: (k) => k });
  };
  renderRow();
  const chip = renderRow().props.children[1].props.children[0];
  chip.props.onClick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  renderRow();
  check("no carrier: the platform opener takes over", opened.includes("data.json"), `opened=${JSON.stringify(opened)}`);
  const tree = renderRow();
  check("no carrier: no native-open action on a non-loopback session",
    tree.props.children.some((c) => c !== void 0 && c.props?.className === "dshmdp_preview") === false);
}

// ── 汇总 ──
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.error("FAILED:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
