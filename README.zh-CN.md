# dsh-markdown-preview

**DeepSeek Harness Web 产物文件浏览器内预览插件。**

默认情况下，点击 DSH Web 里的产物文件 chip，会把文件交给操作系统默认应用打开（macOS 上 `open` → 很多扩展名落到 Xcode）。本插件接管产物行，让**点击直接在聊天内渲染文件**：Markdown 由宿主侧 `markdown-it` + `highlight.js` 渲染，图片内联预览，**代码文件（JSON / JS / TS / Python / YAML …）以深色语法高亮代码视图展示**，其他文本文件以纯文本展示。原行为仍然一键可达：在系统应用中打开、在文件夹中显示。

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

重启 `dsh web` 生效。需要 PATH 中有 pnpm（`dsh plugin` 会转发给 pnpm），DSH 版本 `>= 0.1.0-rc.6`。

## 使用

无需配置。重启后，任何产出了文件的回合都会显示熟悉的产物行；点击 chip 即展开/收起预览面板。

## 工作原理

- **宿主侧**（`lib/index.js`）：在 `ctx.connection` 上注册 `/preview` RPC 通道，使用 `loopback` 信任权限（与 `/api` 相同的 DNS-rebinding / 跨站围栏）。`read` 返回文件内容——Markdown 渲染为**转义后的 HTML**（`markdown-it` 开 `html:false`、安全链接策略），图片转 base64 data URL，**代码文件按扩展名服务端 hljs 高亮（40+ 语言）**，其他文本 1 MiB 截断并做 NUL 字节二进制嗅探；`open` 代理官方 `host.openPath`，系统应用打开与官方行为完全一致。
- **浏览器侧**（`lib/client.js`）：标准 `dsh.client` bundle。拥有 `deliverables` 会话事件类型与 `conversation.chat.turnTail` 插槽（本 bundle 的 patch 禁用了官方 `ui-deliverables` 行，并补回其提示词段与 `chatFileMentions` 服务），因此是行为兼容的原生接管，而非 DOM hack。
- 渲染发生在**宿主进程**，浏览器 bundle 保持轻量、零依赖。

## 与相似插件对比

| 插件 | 形态 | 区别 |
|---|---|---|
| **dsh-markdown-preview（本插件）** | 接管官方产物行 | 就在官方产物行的位置点击即预览，不增加任何新界面 |
| `dsh-file-explorer` | 右侧文件树面板 | 全局面板，非聊天内 |
| `dsh-file-mentions` | 反引号路径提及 + 尾部 chips | 从回复文本收集路径；官方产物行存在时不接管 |
| `dsh-md-preview` | 渲染工具 + web 抽屉 | 抽屉/独立 HTML 导出，非聊天内 |
| `dsh-web-preview` | 侧边 web 预览面板 | 运行/标注项目，非产物文件 |

## 安全说明

- 通道仅限 loopback，位于连接信任围栏之后。
- Markdown 以 `html:false` 渲染：文档中的原始 HTML 会被转义，链接仅允许 `http(s)/mailto/#`（`markdown-it` 默认 `validateLink`）。
- 预览大小上限 + 二进制嗅探避免内存/UI 滥用；预览只读（无写入端点）。

## 卸载

```sh
dsh plugin --profile web remove dsh-markdown-preview
```

## 开发

```sh
git clone https://github.com/GitHubJiKe/dsh-markdown-preview.git
cd dsh-markdown-preview
npm install          # 宿主侧依赖 markdown-it + highlight.js
dsh plugin --profile web add file:$(pwd)
# 重启 dsh web；profile 以 symlink 指向你的工作副本，
# 修改 lib/ 后再次重启即生效（客户端 bundle 在启动时扫描）
```

## License

MIT

## 变更记录

- **v0.3.0**（2026-08-17）：代码文件语法高亮 + 全屏查看。`read` 现在以新的 `code` 类型返回 40+ 代码扩展名（`.json` `.js` `.ts` `.py` `.yml` `.sh` `.css` `.html` …），服务端 hljs 高亮并以深色编辑器风格视图渲染（GitHub Dark 配色）；markdown 围栏代码块也补上了真实 token 配色（此前 hljs 样式仅透明背景）。面板头部新增**全屏**按钮：预览（Markdown / 图片 / 代码 / 纯文本）展开为固定铺满视口的浮层，工具栏保留，按钮或 `Esc` 退出。
- **v0.2.0**（2026-08-16）：SVG 预览支持 + 工作区相对路径解析。`.svg` 加入内联图片集（安全：`<img>` 不执行内嵌脚本）；相对产物路径改为按已注册工作区根解析，而非宿主进程 cwd，修复工作区相对文件 ENOENT。
- **v0.1.1**（2026-08-15）：修复深色主题下预览文字不可读——预览面板此前使用不存在的 `--dsw-alias-surface-raised` 变量导致背景恒为白色，而正文颜色继承聊天区（夜间为浅色）。现在背景/文字/链接/错误色全部改用主题真实存在的变量（`--dsw-alias-bg-layer-1`、`--dsw-alias-label-primary`、`--dsw-alias-brand-primary`、`--dsw-alias-state-error-primary`），预览面板自动跟随明暗主题。
- **v0.1.0**（2026-08-15）：首发。
