/**
 * dsh-markdown-preview 冒烟测试（Node，无浏览器）。
 * 1) 服务端：mock ctx.connection + workspaceRegistry，验证 /preview 通道注册与
 *    read 端点：.md → markdown、.json/.js → code（含 hljs 高亮 HTML）、.txt → text。
 * 2) 客户端：mock window.__ModuleLoader__ + react，跑 factory + apply，
 *    验证 turnTail 注册与全屏/复制按钮渲染路径。
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// ── 1. 服务端 ──
const server = await import("../lib/index.js");
check("server exports", server.name === "markdown-preview" && Array.isArray(server.inject) && typeof server.apply === "function",
  `name=${server.name}`);

let channelPath = null;
let channelHandler = null;
const serverCtx = {
  effect: (fn) => fn(),
  get: (service) => service === "workspaceRegistry" ? { list: () => [{ path: tmp }] } : void 0,
  systemPrompt: { section: () => {} },
  connection: { rpc: { handle: (path, handler) => { channelPath = path; channelHandler = handler; return () => {}; } } }
};
server.apply(serverCtx);
check("channel registered", channelPath === "/preview", `path=${channelPath}`);

const call = (payload) => channelHandler("read", payload, new AbortController().signal);

{
  const r = await call({ path: "data.json" });
  check("json → code kind", r.ok === true && r.value.kind === "code" && r.value.language === "json",
    `kind=${r.value?.kind} lang=${r.value?.language}`);
  check("code html highlighted", typeof r.value.html === "string" && r.value.html.includes("hljs") && r.value.html.includes("dshmdp-code-pre"),
    "html carries hljs markup");
  check("raw content preserved", r.value.content.includes('"num": 42'));
}
{
  const r = await call({ path: "app.js" });
  check("js → code kind", r.ok === true && r.value.kind === "code" && r.value.language === "javascript",
    `lang=${r.value?.language}`);
  check("js highlighted keywords", r.value.html.includes("hljs-keyword") && r.value.html.includes("hljs-comment"),
    "keyword/comment spans present");
}
{
  const r = await call({ path: "note.md" });
  check("md → markdown kind", r.ok === true && r.value.kind === "markdown" && typeof r.value.html === "string",
    `kind=${r.value?.kind}`);
  check("md fence highlighted", r.value.html.includes("hljs") && r.value.html.includes("language-json"),
    "fenced json block highlighted");
}
{
  const r = await call({ path: "plain.txt" });
  check("txt → text kind", r.ok === true && r.value.kind === "text" && r.value.html === void 0,
    `kind=${r.value?.kind}`);
}
{
  const r = await call({ path: "nope.json" });
  check("missing file errors", r.ok === false && typeof r.error.message === "string");
}

// ── 2. 客户端 ──
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
const modules = {
  "react/jsx-runtime": jsxRuntimeMock,
  "react": reactMock,
  "@deepseek-ai/dsh-client-runtime/client": { isAppendSurfaceEvent: () => true }
};
await import("../lib/client.js");
const client = factory((id) => modules[id]);
check("client factory invoked", typeof client.apply === "function" && typeof client.PreviewRow === "function");

// apply 注册验证
let registeredOptions = null;
{
  const ctx = {
    get: (service) => service === "connection" ? { rpc: { call: () => Promise.resolve({ ok: true }) } } : void 0,
    conversationEvents: { register: () => {} },
    locale: { register: () => () => {}, bind: () => (k) => k },
    slots: {
      register: (options) => { registeredOptions = options; return () => {}; },
      inject: (slot, cb) => { cb(); return () => {}; }
    },
    effect: (fn) => fn(),
    provide: () => {}
  };
  client.apply(ctx);
  check("turnTail registered", registeredOptions !== null && registeredOptions.name === "conversation.chat.turnTail" && typeof registeredOptions.select === "function",
    `priority=${registeredOptions?.priority}`);
}

// 组件渲染：code 分支 + 全屏按钮
{
  const value = {
    path: "data.json", name: "data.json", ext: ".json", kind: "code", language: "json",
    content: '{"a":1}', bytes: 8, truncated: false,
    html: '<pre class="dshmdp-hljs dshmdp-code-pre"><code class="hljs language-json"><span class="hljs-attr">&quot;a&quot;</span></code></pre>'
  };
  const rpc = { call: (ch, ep) => Promise.resolve(ch === "/preview" && ep === "read" ? { ok: true, value } : { ok: true }) };
  const renderRow = () => {
    hookSeq = 0;
    return client.PreviewRow({
      matched: ["data.json"],
      openFile: () => {},
      isLoopback: false,
      useHostDescription: (fn) => fn(undefined),
      rpc,
      t: (k) => k
    });
  };
  renderRow();
  const mounted = renderRow();
  // 点击产物 chip 展开（markdown-preview 无自动展开，需模拟点击）
  const rowDiv = mounted.props.children[1];
  const chip = rowDiv.props.children[0];
  check("chip clickable", chip !== void 0 && typeof chip.props.onClick === "function");
  chip.props.onClick();
  renderRow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const tree = renderRow();
  const rootChildren = tree.props.children;
  const panel = rootChildren.find((c) => c !== void 0 && c.props?.className === "dshmdp_preview");
  check("preview panel rendered", panel !== void 0);
  // panel children: [panelHead, Fragment(done)]
  const panelHead = panel.props.children[0];
  const actions = panelHead.props.children[2];
  const labels = actions.props.children.map((b) => typeof b === "object" && b !== null ? b.props.children : "").filter((x) => typeof x === "string");
  check("fullscreen button present", labels.includes("preview.fullscreen"), `labels=${JSON.stringify(labels)}`);
  const bodyFrag = panel.props.children[1];
  const codeDiv = bodyFrag.props.children.find((c) => c !== void 0 && c.props?.className === "dshmdp_code");
  check("code view rendered", codeDiv !== void 0 && typeof codeDiv.props.dangerouslySetInnerHTML?.__html === "string" && codeDiv.props.dangerouslySetInnerHTML.__html.includes("hljs"));
  // 全屏遮罩未展开时不存在
  const fsOverlay = rootChildren.find((c) => c !== void 0 && c.props?.className === "dshmdp_fs");
  check("fullscreen overlay hidden by default", fsOverlay === void 0);
}

// ── 汇总 ──
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.error("FAILED:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
