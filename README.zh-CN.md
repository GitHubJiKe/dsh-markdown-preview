# dsh-markdown-preview

**DeepSeek Harness Web 产物文件浏览器内预览插件。**

默认情况下，点击 DSH Web 里的产物文件 chip，会把文件交给操作系统默认应用打开（macOS 上 `open` → 很多扩展名落到 Xcode）。本插件让这次点击**直接在聊天内渲染文件**：Markdown 由宿主侧 `markdown-it` + `highlight.js` 渲染，图片内联预览，**代码文件（JSON / JS / TS / Python / YAML …）以深色语法高亮代码视图展示**，其他文本文件以纯文本展示。原有行为仍然一键可达：在系统应用中打开、在文件夹中显示。

## 功能

- **点击产物文件 chip → 聊天内联预览**，不再弹出系统应用、不新开标签页。
- **Markdown 完整渲染**（GFM 表格、围栏代码、引用、链接、硬换行）+ 代码块**语法高亮**（highlight.js 常用语言集）。
- **代码文件全语法高亮预览**（v0.3.0）：40+ 扩展名（`.json` `.js` `.ts` `.py` `.yml` `.sh` `.css` `.html` …）以深色编辑器风格视图展示，GitHub Dark 配色，服务端高亮。
- **全屏查看**（v0.3.0）：一键把预览（Markdown / 图片 / 代码 / 纯文本）展开为铺满视口的浮层，工具栏保留在顶部，按钮或 `Esc` 关闭。
- **图片预览**（PNG / JPEG / GIF / WebP / SVG）以 data URL 内联展示，无需额外路由。SVG 可安全内联：浏览器不会执行 `<img>` 元素中 SVG 的脚本。
- 其他文本文件回退为纯文本；二进制文件通过 NUL 字节嗅探识别并明确拒绝。
- 面板头部：文件大小、**全屏**、**复制内容**、**在系统应用中打开**、收起。
- 文本 1 MiB / 图片 4 MiB 上限，超出显示截断提示。
- 保留原有体验：chips、「+ N 个文件」、「在文件夹中显示」，行内代码提及的产物文件仍然可点击。
- **预览面板自动跟随 DSH 明暗主题**：背景、正文、链接、代码块全部使用主题变量（v0.1.1 修复夜间模式白底浅字问题）。

## 安装

```sh
dsh plugin --profile web add dsh-markdown-preview
```

重启 `dsh web` 生效。需要 PATH 中有 pnpm（`dsh plugin` 会转发给 pnpm）、**Node.js >= 20**、DSH `>= 0.1.1-rc.2 < 0.2.0`。

## 使用

无需配置。重启后，任何产出了文件的回合都会显示熟悉的产物行；点击 chip 即展开/收起预览面板。

## 工作原理

本插件是**纯新增**的。它的 Bundle Patch 只插入一个插件自有行，不禁用、不改名、不重复声明任何官方组件：每个官方组件都保留自己的注册与自己的 entry ID。尤其是官方产物行始终启用——本插件不接管它的 `deliverables` 会话节点定义、`chatFileMentions` 服务、`deliverables` 语言包命名空间，也不接管它在宿主侧的回复文件引用提示词段。

- **一个插槽条目，靠优先级取胜。** 产物行位于 `conversation.chat.turnTail` **chain** 座位。chain 座位按优先级升序选取第一个 `select` 接受的条目，这是插槽层文档化的扩展点（"register at a different priority to shadow it"）。浏览器侧以优先级 `-1` 注册——这是刚好压过官方兜底行（优先级 `0`）的最小步长，同时给优先级更低的其他贡献者留出遮蔽本行的空间（例如 -10 的 HTML 产物专行会保留它选中的 HTML 回合）。官方行保持注册，在本插件让位的所有回合（以及卸载本插件后）照常渲染。
- **文件列表是读取的，不是重算的。** 选择器读取官方产物行已经发布的 `deliverables` 回合数据。同时声明了 *presented* 文件的回合会主动让位，把属于官方行的界面与宿主路由留给官方行。因此本插件要求官方产物行保持启用——它由 `dsh-web-app` bundle 提供；若被其他层禁用，就没有已发布的产物列表可供预览。
- **宿主侧**（`lib/index.js`）提供 `read`（文件内容——Markdown 渲染为**转义后的 HTML**，`markdown-it` 开 `html:false` 并使用其安全链接策略；图片转 base64 data URL；**代码文件按扩展名服务端高亮**；其他文本经 NUL 字节嗅探后 1 MiB 截断）、`open`（系统默认应用打开）、`capabilities`（宿主是否支持原生打开）。`read` 与 `open` 的相对路径都按已注册工作区根解析，绝不用宿主进程 cwd。
- **两代路由载体，一套契约。** DSH 在连接层换代时更换了路由注册方式，因此宿主侧按当前 DSH 暴露的载体二选一挂载：
  - **0.1.5 及以上**：`/api` 下的精确 Fetch 路由（`/api/markdown-preview.read|open|capabilities`），即官方插件使用的载体；共享通道在分发前应用同样的 Host/Origin 围栏与浏览器鉴权策略。
  - **0.1.0 / 0.1.1**：`/preview` 逻辑 RPC 通道，按该代的 `loopback` 信任权限注册。

  浏览器侧在首次调用时选举载体，若某载体返回的响应不属于本插件的结果词汇表则自动改用另一个，两代都无需配置；两个载体调用同一个处理函数。
- 渲染发生在**宿主进程**，浏览器 bundle 保持轻量、几乎零依赖（只 require `react`）。

## 兼容性与验证证据

`package.json` 通过 `dsh.compatibility.dshReleases` 逐版本精确声明。下表中每个 `compatible` 都经过**在一次性 DSH Profile 中安装本插件并在隔离端口启动**的实测，随后用 HTTP 直接驱动插件自己的预览面，并确认官方产物界面仍然挂载：

| DSH 版本 | 兼容性 | 安装 / 启动 / 卸载 | 实测到的路由载体 |
|---|---|---|---|
| `0.1.1-rc.2` | compatible | passed | `/preview` 逻辑通道 |
| `0.1.5-rc.2` | compatible | passed | `/api/markdown-preview.*` 精确路由 |
| `0.1.6-alpha.1` | unknown | unknown | 未实跑（见下方说明） |
| `0.1.6-alpha.2` | compatible | passed | `/api/markdown-preview.*` 精确路由 |

每轮实测检查项：Web 服务启动无插件报错、无重复注册；`capabilities` 与 `read` 端点在 HTTP 上返回预期结果；Markdown 文件返回带服务端 `highlight.js` 的渲染结果；官方产物客户端仍出现在启动清单中且其 bundle 仍返回 `200`；本插件客户端 bundle 出现在启动清单中且可正常获取；服务可干净退出。`test/mock-test.mjs` 离线覆盖同一套契约（两代载体共 68 条断言）。

> `0.1.6-alpha.1` 声明为 `unknown` 而非 `compatible`：该版本无法从 npm 干净启动——它的 caret 依赖范围会解析到 `0.1.6-alpha.2` 的内部包，而 `@deepseek-ai/dsh-app-boot` 删除了 `0.1.6-alpha.1` 仍在导入的导出。本插件依赖的包表面在该版本上做了静态核对，与 `0.1.6-alpha.2` 一致，但无法完成干净的安装/启动/卸载实测，因此不主张任何实跑证据。

表中未列出的版本（例如 `0.1.2-alpha.*`、`0.1.3-alpha.*`、`0.1.5-alpha.*`、`0.1.5-rc.1`）未声明，商城会记为 `unknown`。

## 与相似插件对比

| 插件 | 形态 | 区别 |
|---|---|---|
| **dsh-markdown-preview（本插件）** | 赢得产物 chain 座位 | 就在官方产物行的位置点击即预览，官方行保持启用作为兜底 |
| `dsh-file-explorer` | 右侧文件树面板 | 全局面板，非聊天内 |
| `dsh-file-mentions` | 反引号路径提及 + 尾部 chips | 从回复文本收集路径；官方产物行存在时不接管 |
| `dsh-md-preview` | 渲染工具 + web 抽屉 | 抽屉/独立 HTML 导出，非聊天内 |
| `dsh-web-preview` | 侧边 web 预览面板 | 运行/标注项目，非产物文件 |

## 安全说明

- 预览面在两代载体上都位于连接信任围栏之后：`/preview` 通道仅注册 `loopback`；`/api` 精确路由继承共享通道的 Host/Origin 围栏与浏览器鉴权。
- Markdown 以 `html:false` 渲染：文档中的原始 HTML 会被转义，链接仅允许 `http(s)/mailto/#`（`markdown-it` 默认 `validateLink`）。
- 预览大小上限 + 二进制嗅探避免内存/UI 滥用；预览只读（无写入端点）。
- `open` 只把路径交给部署自身的原生桌面打开器，绝不执行文件；会先查询 `capabilities`，没有原生桌面的部署不会显示该操作。

## 卸载

```sh
dsh plugin --profile web remove dsh-markdown-preview
```

卸载不留残留：Bundle Patch 只插入了自己的行，官方产物行从未被禁用。

## 开发

```sh
git clone https://github.com/GitHubJiKe/dsh-markdown-preview.git
cd dsh-markdown-preview
npm install          # 宿主侧依赖 markdown-it + highlight.js
npm test             # 离线冒烟测试（上架契约 + 两代载体）
dsh plugin --profile web add file:$(pwd)
# 重启 dsh web；客户端 bundle 改动刷新页面即可，宿主侧改动需重启
```

若要在多个 DSH 版本上核对宿主契约而不碰线上 Profile：把 `DSH_HOME` 指向一个临时目录，在其中创建 `dsh.profile.bundles` 以 `dsh-markdown-preview` 结尾的 Profile，再用 `--no-open` 在空闲端口启动。

## License

MIT

## 变更记录

- **v0.4.0**（2026-09-19）：**纯新增插槽贡献 + 双代支持。** Bundle Patch 不再禁用官方产物行；插件改为在 `conversation.chat.turnTail` chain 座位以优先级 `-1` 注册单一条目，并读取官方产物行已发布的 `deliverables` 回合数据，因此不再禁用、替换或重实现任何官方组件。宿主侧按当前 DSH 暴露的载体二选一挂载——0.1.5+ 用 `/api/markdown-preview.*` 精确 Fetch 路由，0.1.0/0.1.1 用 `/preview` 逻辑 RPC 通道——原生打开则依次探测 ApiProxy 网关或 Session Controller。`dsh.compatibility` 现在逐版本精确声明，并给出 DSH 范围、`profiles: ["web"]` 与逐版本的安装/启动/卸载证据；`engines.node` 声明为 `>=20`。同时声明了 *presented* 文件的回合会主动让位给官方行。
- **v0.3.0**（2026-08-17）：代码文件语法高亮 + 全屏查看。`read` 现在以新的 `code` 类型返回 40+ 代码扩展名（`.json` `.js` `.ts` `.py` `.yml` `.sh` `.css` `.html` …），服务端 hljs 高亮并以深色编辑器风格视图渲染（GitHub Dark 配色）；markdown 围栏代码块也补上了真实 token 配色（此前 hljs 样式仅透明背景）。面板头部新增**全屏**按钮：预览（Markdown / 图片 / 代码 / 纯文本）展开为固定铺满视口的浮层，工具栏保留，按钮或 `Esc` 退出。
- **v0.2.0**（2026-08-16）：SVG 预览支持 + 工作区相对路径解析。`.svg` 加入内联图片集（安全：`<img>` 不执行内嵌脚本）；相对产物路径改为按已注册工作区根解析，而非宿主进程 cwd，修复工作区相对文件 ENOENT。
- **v0.1.1**（2026-08-15）：修复深色主题下预览文字不可读——预览面板此前使用不存在的 `--dsw-alias-surface-raised` 变量导致背景恒为白色，而正文颜色继承聊天区（夜间为浅色）。现在背景/文字/链接/错误色全部改用主题真实存在的变量（`--dsw-alias-bg-layer-1`、`--dsw-alias-label-primary`、`--dsw-alias-brand-primary`、`--dsw-alias-state-error-primary`），预览面板自动跟随明暗主题。
- **v0.1.0**（2026-08-15）：首发。
