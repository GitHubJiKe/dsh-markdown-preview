window.__ModuleLoader__.load({
	id: "dsh-markdown-preview",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _client_runtime = require("@deepseek-ai/dsh-client-runtime/client");
		//#region produced-path accumulation (owns the "deliverables" Turn kind)
		/**
		* Paths a call view reports having created or changed, by render intent
		* rather than tool name: a diff card, or a generic card whose kind is
		* `edit`. Everything else produces nothing to open.
		*/
		function producedPaths(view) {
			if (view === null) return [];
			if (view.card === "diff") return (view.locations ?? []).map((location) => location.path);
			if (view.card === "generic" && view.kind === "edit") return (view.locations ?? []).map((location) => location.path);
			return [];
		}
		/**
		* Files produced by one Turn data value, in first-seen order, deduped.
		* @param data - engine-published deliverables data for one Turn.
		* @param seq - closing Assistant seq; later Tool settlements are excluded.
		*/
		function producedForClosing(data, seq = Number.POSITIVE_INFINITY) {
			if (data === void 0) return [];
			const paths = [];
			const seen = /* @__PURE__ */ new Set();
			for (const produced of data.produced) {
				if (produced.seq > seq || seen.has(produced.path)) continue;
				seen.add(produced.path);
				paths.push(produced.path);
			}
			return paths;
		}
		/** Claim the turn-tail chain only when its closing turn produced files. */
		function selectProducedFiles(owner) {
			const paths = producedForClosing(owner.turn.data.get("deliverables"), owner.seq);
			return paths.length === 0 ? null : paths;
		}
		/** Turn-local successful mutation accumulator; publishes the deliverables location. */
		const deliverablesDefinition = {
			kind: "deliverables",
			match: (event) => {
				if (event.type === "turn/start") return {
					id: String(event.data.turn),
					role: "start"
				};
				if (event.type === "tool/call") return {
					id: String(event.data.turn),
					role: "update"
				};
				if (event.type === "tool/result" && (0, _client_runtime.isAppendSurfaceEvent)(event)) return {
					id: String(event.data.turn),
					role: "update"
				};
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "turn/start") throw new Error("deliverables start requires turn/start");
				return {
					turn: match.event.data.turn,
					calls: /* @__PURE__ */ new Map(),
					produced: []
				};
			},
			update: (context, match) => {
				if (match.event.type === "tool/call") {
					const calls = new Map(context.state.calls);
					calls.set(String(match.event.data.callId), match.view?.for === "call" ? match.view.view : null);
					return {
						...context.state,
						calls
					};
				}
				if (match.event.type !== "tool/result") return context.state;
				if (match.event.data.message.content[0].isError === true) return context.state;
				const callId = String(match.event.data.message.source.callId);
				const additions = producedPaths(context.state.calls.get(callId) ?? null).map((path) => ({
					seq: match.event.seq,
					path
				}));
				return additions.length === 0 ? context.state : {
					...context.state,
					produced: [...context.state.produced, ...additions]
				};
			},
			buildLocationData: (context, scope) => scope !== "turn" || context.state === void 0 ? null : {
				kind: "turn",
				turn: context.state.turn,
				key: "deliverables",
				value: { produced: context.state.produced }
			}
		};
		/** Trailing path segment, the part that identifies the file at a glance. */
		function basename(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at === -1 ? path : path.slice(at + 1);
		}
		/** The single produced path whose basename is exactly `value`, else undefined. */
		function onlyPathWithBasename(paths, value) {
			const matches = paths.filter((path) => basename(path) === value);
			return matches.length === 1 ? matches[0] : void 0;
		}
		/**
		* File-mention vocabulary over one turn's produced paths: an inline-code
		* token opens the file it names through the chat view's opener.
		*/
		function producedFileMentions(paths, openFile, label) {
			return { resolve(value) {
				const path = paths.includes(value) ? value : onlyPathWithBasename(paths, value);
				if (path === void 0) return void 0;
				return {
					open: () => {
						openFile(path);
					},
					label: label(path),
					title: path
				};
			} };
		}
		//#endregion
		//#region helpers
		/** Escape raw text (plain-text previews and code fallbacks). */
		function escapeHtml(text) {
			return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
		}
		/** Compact byte formatting: 1.2 KB / 3.4 MB. */
		function formatBytes(bytes) {
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
			return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		}
		//#endregion
		//#region styles
		const css = ".dshmdp_root{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 8px;margin-top:16px;font-size:13px;line-height:22px}.dshmdp_label{color:var(--dsw-alias-label-tertiary,#8a919c);grid-area:1/1;white-space:nowrap}.dshmdp_row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;grid-area:1/2}.dshmdp_chip{display:inline-flex;align-items:center;gap:6px;max-width:320px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-secondary,#4b5563);font:inherit;cursor:pointer;border:none;border-radius:6px;margin:0;padding:0 8px;overflow:hidden}.dshmdp_chip>span{text-overflow:ellipsis;overflow:hidden}.dshmdp_chip:hover{color:var(--dsw-alias-label-primary,#111827);text-decoration:underline}.dshmdp_chip[data-open=true]{color:var(--dsw-alias-label-primary,#111827)}.dshmdp_native{color:var(--dsw-alias-label-tertiary,#8a919c);font:inherit;cursor:pointer;background:none;border:none;border-radius:4px;padding:0 4px;flex:none}.dshmdp_native:hover{color:var(--dsw-alias-label-primary,#111827);text-decoration:underline}.dshmdp_more{color:var(--dsw-alias-label-tertiary,#8a919c);white-space:nowrap}.dshmdp_showFolder{grid-area:2/2;justify-self:start;color:var(--dsw-alias-label-tertiary,#8a919c);font:inherit;cursor:pointer;background:none;border:none;border-radius:4px;padding:0 2px;line-height:20px}.dshmdp_showFolder:hover{color:var(--dsw-alias-label-secondary,#4b5563);text-decoration:underline}.dshmdp_preview{grid-column:1/-1;margin-top:4px;border:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));border-radius:8px;padding:10px 14px;max-height:60vh;overflow:auto;font-size:13px;line-height:1.65;background:var(--dsw-alias-surface-raised,#ffffff)}.dshmdp_panelHead{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a919c)}.dshmdp_panelName{font-weight:600;color:var(--dsw-alias-label-secondary,#4b5563);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:none;max-width:55%}.dshmdp_panelMeta{flex:none;opacity:.85}.dshmdp_panelActions{margin-left:auto;display:flex;gap:4px;align-items:center}.dshmdp_panelActions button{color:var(--dsw-alias-label-tertiary,#8a919c);font:inherit;font-size:12px;cursor:pointer;background:none;border:none;border-radius:4px;padding:2px 6px}.dshmdp_panelActions button:hover{color:var(--dsw-alias-label-primary,#111827);text-decoration:underline;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.08))}.dshmdp_state{color:var(--dsw-alias-label-tertiary,#8a919c);padding:4px 0}.dshmdp_state[data-error=true]{color:var(--dsw-alias-danger,#dc2626)}.dshmdp_note{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a919c);margin-bottom:6px}.dshmdp_preview h1,.dshmdp_preview h2,.dshmdp_preview h3,.dshmdp_preview h4,.dshmdp_preview h5,.dshmdp_preview h6{margin:.6em 0 .3em;line-height:1.3}.dshmdp_preview h1{font-size:1.5em}.dshmdp_preview h2{font-size:1.3em}.dshmdp_preview h3{font-size:1.15em}.dshmdp_preview h4{font-size:1.05em}.dshmdp_preview p{margin:.35em 0}.dshmdp_preview ul,.dshmdp_preview ol{margin:.35em 0;padding-left:1.6em}.dshmdp_preview li{margin:.1em 0}.dshmdp_preview pre{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1));border-radius:6px;padding:8px 10px;overflow:auto;margin:.4em 0;font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word}.dshmdp_preview code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.dshmdp_preview :not(pre)>code{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));border-radius:4px;padding:0 4px;font-size:.92em}.dshmdp_preview blockquote{margin:.4em 0;padding:0 0 0 10px;border-left:3px solid var(--dsw-alias-border-l3,rgba(128,128,128,.3));color:var(--dsw-alias-label-tertiary,#6b7280)}.dshmdp_preview a{color:var(--dsw-alias-accent,#3964fe)}.dshmdp_preview hr{border:none;border-top:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));margin:.8em 0}.dshmdp_preview table{border-collapse:collapse;margin:.4em 0;display:block;max-width:100%;overflow:auto}.dshmdp_preview th,.dshmdp_preview td{border:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));padding:3px 8px}.dshmdp_preview th{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.08))}.dshmdp_preview img{max-width:100%;border-radius:6px;margin:.4em 0}.dshmdp_preview .hljs{background:transparent;padding:0}.dshmdp_preview .dshmdp-hljs{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1))}";
		const tagId = "dsh-markdown-preview/Preview.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-markdown-preview";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region PreviewRow
		/** At most six chips compete for the one-line summary; every other path stays counted. */
		const SHOWN_LIMIT = 6;
		/**
		* The produced-files row with in-browser preview: clicking a chip fetches
		* the file over the /preview channel and renders it inline (Markdown
		* rendered host-side, images as data URLs, everything else plain text); a
		* secondary action opens the file in the OS default application, and the
		* folder link is preserved.
		*/
		function PreviewRow({ matched: paths, openFile, isLoopback, useHostDescription, rpc, t }) {
			const hostCanOpenPath = useHostDescription((description) => description?.canOpenPath === true);
			const canOpenNative = isLoopback && hostCanOpenPath;
			const [expanded, setExpanded] = react.useState(null);
			const [states, setStates] = react.useState({});
			const [copied, setCopied] = react.useState(false);
			const shown = paths.slice(0, SHOWN_LIMIT);
			const hidden = paths.length - shown.length;
			const toggle = (path) => {
				if (rpc === void 0) {
					openFile(path);
					return;
				}
				if (expanded === path) {
					setExpanded(null);
					return;
				}
				setExpanded(path);
				if (states[path] !== void 0) return;
				setStates((current) => ({ ...current, [path]: { status: "loading" } }));
				rpc.call("/preview", "read", { path }).then((result) => {
					setStates((current) => {
						if (!result.ok) return { ...current, [path]: { status: "error", message: result.error.message } };
						return { ...current, [path]: { status: "done", value: result.value } };
					});
				}).catch((error) => {
					setStates((current) => ({ ...current, [path]: { status: "error", message: String(error?.message ?? error) } }));
				});
			};
			const openInApp = (event, path) => {
				event.stopPropagation();
				rpc?.call("/preview", "open", { path }).catch(() => {});
			};
			const copyContent = (event, value) => {
				event.stopPropagation();
				if (typeof navigator === "undefined" || navigator.clipboard === void 0) return;
				navigator.clipboard.writeText(value).then(() => {
					setCopied(true);
					setTimeout(() => {
						setCopied(false);
					}, 1500);
				}).catch(() => {});
			};
			const state = expanded === null ? void 0 : states[expanded];
			const renderBody = (value) => {
				if (value.kind === "image") {
					return (0, react_jsx_runtime.jsx)("div", {
						children: (0, react_jsx_runtime.jsx)("img", {
							src: value.dataUrl,
							alt: value.name
						})
					});
				}
				if (value.kind === "markdown") {
					return (0, react_jsx_runtime.jsx)("div", {
						dangerouslySetInnerHTML: { __html: value.html ?? escapeHtml(value.content ?? "") }
					});
				}
				return (0, react_jsx_runtime.jsx)("pre", {
					children: escapeHtml(value.content ?? "")
				});
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "dshmdp_root",
				children: [
					(0, react_jsx_runtime.jsx)("span", {
						className: "dshmdp_label",
						children: t("produced.label")
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "dshmdp_row",
						children: [
							shown.map((path) => (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dshmdp_chip",
								"data-open": expanded === path ? "true" : void 0,
								title: path,
								"aria-label": t("produced.open", { name: path }),
								onClick: () => {
									toggle(path);
								},
								children: [
									(0, react_jsx_runtime.jsx)("span", { children: basename(path) }),
									canOpenNative && (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dshmdp_native",
										title: t("preview.openInApp"),
										onClick: (event) => {
											openInApp(event, path);
										},
										children: "⧉"
									})
								]
							}, path)),
							hidden > 0 && (0, react_jsx_runtime.jsx)("span", {
								className: "dshmdp_more",
								children: hidden === 1 ? t("produced.moreOne") : t("produced.more", { count: String(hidden) })
							})
						]
					}),
					hidden > 0 && canOpenNative && (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dshmdp_showFolder",
						onClick: () => {
							openFile(".");
						},
						children: t("produced.showInFolder")
					}),
					expanded !== null && (0, react_jsx_runtime.jsxs)("div", {
						className: "dshmdp_preview",
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: "dshmdp_panelHead",
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: "dshmdp_panelName",
										children: basename(expanded)
									}),
									state !== void 0 && state.status === "done" && (0, react_jsx_runtime.jsx)("span", {
										className: "dshmdp_panelMeta",
										children: formatBytes(state.value.bytes)
									}),
									(0, react_jsx_runtime.jsxs)("span", {
										className: "dshmdp_panelActions",
										children: [
											state !== void 0 && state.status === "done" && (state.value.content !== void 0 ? (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: (event) => {
													copyContent(event, state.value.content);
												},
												children: copied ? t("preview.copied") : t("preview.copy")
											}) : null),
											canOpenNative && (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: (event) => {
													openInApp(event, expanded);
												},
												children: t("preview.openInApp")
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => {
													setExpanded(null);
												},
												children: t("preview.collapse")
											})
										]
									})
								]
							}),
							state === void 0 || state.status === "loading" ? (0, react_jsx_runtime.jsx)("div", {
								className: "dshmdp_state",
								children: t("preview.loading")
							}) : state.status === "error" ? (0, react_jsx_runtime.jsx)("div", {
								className: "dshmdp_state",
								"data-error": "true",
								children: `${t("preview.error")}: ${state.message}`
							}) : (0, react_jsx_runtime.jsxs)(react.Fragment, {
								children: [
									state.value.truncated && (0, react_jsx_runtime.jsx)("div", {
										className: "dshmdp_note",
										children: t("preview.truncated")
									}),
									renderBody(state.value)
								]
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region locales
		/** `markdown-preview` namespace dictionaries. */
		const NS = "markdown-preview";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"produced.label": "产物",
			"produced.moreOne": "+ 1 个文件",
			"produced.more": "+ {count} 个文件",
			"produced.open": "打开 {name}",
			"produced.showInFolder": "在文件夹中显示",
			"preview.openInApp": "在系统应用中打开",
			"preview.collapse": "收起",
			"preview.loading": "正在加载预览…",
			"preview.error": "预览失败",
			"preview.truncated": "文件较大，仅显示前 1 MiB",
			"preview.copy": "复制内容",
			"preview.copied": "已复制"
		};
		/** English dictionary (same key set). */
		const en = {
			"produced.label": "Produced",
			"produced.moreOne": "+ 1 file",
			"produced.more": "+ {count} files",
			"produced.open": "Open {name}",
			"produced.showInFolder": "Show in folder",
			"preview.openInApp": "Open in system app",
			"preview.collapse": "Collapse",
			"preview.loading": "Loading preview…",
			"preview.error": "Preview failed",
			"preview.truncated": "Large file: showing the first 1 MiB",
			"preview.copy": "Copy content",
			"preview.copied": "Copied"
		};
		//#endregion
		//#region plugin body
		/** Required services for the turn-tail registration and its dictionaries. */
		const inject = [
			"slots",
			"locale",
			"conversationEvents",
			"connection"
		];
		/**
		* Client plugin body: register the dictionaries, the events definition,
		* the turn-tail entry, and the file-mention service.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const connection = ctx.get("connection");
			ctx.conversationEvents.register(deliverablesDefinition);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "markdown-preview: dictionaries");
			ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
				name: "conversation.chat.turnTail",
				select: selectProducedFiles,
				locale: NS,
				inject: () => ({
					rpc: connection.rpc,
					isLoopback: connection.isLoopback,
					hooks: { hostDescription: connection.hostDescription }
				})
			}, PreviewRow));
			const t = ctx.locale.bind(NS);
			ctx.provide("chatFileMentions", { forClosing(owner) {
				const paths = selectProducedFiles(owner);
				if (paths === null) return void 0;
				return producedFileMentions(paths, owner.openFile, (path) => t("produced.open", { name: path }));
			} });
		}
		//#endregion
		exports.PreviewRow = PreviewRow;
		exports.apply = apply;
		exports.inject = inject;
		exports.producedForClosing = producedForClosing;
		return module.exports;
	}
});
