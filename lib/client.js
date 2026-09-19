window.__ModuleLoader__.load({
	id: "dsh-markdown-preview",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region produced-file reading (consumes the official deliverables Turn data)
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
		/**
		* Claim the turn-tail chain when the closing Turn changed files this
		* plugin can preview.
		*
		* The produced-file list is read from the `deliverables` Turn data the
		* official produced-files row publishes; this plugin consumes that
		* derivation instead of registering a competing Conversation Node
		* definition under the same kind. Turns that also declare *presented*
		* files decline here on purpose: those files carry the official row's own
		* host routes and richer surface, so the official entry keeps them.
		* @param owner - turn-tail owner currency for the closing assistant.
		* @returns produced paths as the component's match, or null to decline.
		*/
		function selectPreviewableFiles(owner) {
			const data = owner.turn.data.get("deliverables");
			if (data === void 0) return null;
			if (Array.isArray(data.presented) && data.presented.length > 0) return null;
			const paths = producedForClosing(data, owner.seq);
			return paths.length === 0 ? null : paths;
		}
		/** Trailing path segment, the part that identifies the file at a glance. */
		function basename(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at === -1 ? path : path.slice(at + 1);
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
		//#region host transport
		/** Exact Fetch-route prefix the 0.1.5+ host half registers below `/api`. */
		const ROUTE_PREFIX = "/api/markdown-preview.";
		/** Logical RPC channel the 0.1.0/0.1.1 host half registers. */
		const RPC_CHANNEL = "/preview";
		/**
		* Carrier elected for this page, or undefined before the first call
		* settles. Both carriers answer the same result vocabulary; only their
		* URLs and envelopes differ, because DSH moved route registration between
		* connection generations and each generation understands only its own.
		*/
		let carrier;
		/** Whether one decoded body is this plugin's result vocabulary. */
		function isResult(value) {
			return typeof value === "object" && value !== null && typeof value.ok === "boolean";
		}
		/**
		* POST one endpoint to the exact Fetch route carrier.
		* @returns the decoded result, or undefined when that carrier is absent.
		*/
		async function callRoute(endpoint, payload) {
			try {
				const response = await fetch(`${ROUTE_PREFIX}${endpoint}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ payload })
				});
				if (!response.ok) return void 0;
				const body = await response.json();
				return isResult(body) ? body : void 0;
			} catch {
				return void 0;
			}
		}
		/**
		* POST one endpoint to the logical RPC channel carrier.
		* @returns the decoded result, or undefined when that carrier is absent.
		*/
		async function callChannel(rpc, endpoint, payload) {
			if (rpc === void 0 || typeof rpc.call !== "function") return void 0;
			try {
				const result = await rpc.call(RPC_CHANNEL, endpoint, payload);
				return isResult(result) ? result : void 0;
			} catch {
				return void 0;
			}
		}
		/**
		* Call one host endpoint without knowing which carrier this generation
		* mounted. The elected carrier is tried first; a carrier that answers
		* nothing in this plugin's vocabulary (route absent, channel absent) hands
		* over to the other one, and success re-elects it. A real host verdict —
		* including a failure such as `preview-binary` — is returned as it is and
		* never triggers a switch.
		* @param rpc - connection RPC caller injected by the slot.
		* @param endpoint - `read` | `open` | `capabilities`.
		* @param payload - endpoint-owned request payload.
		* @returns the host result vocabulary.
		*/
		async function invoke(rpc, endpoint, payload) {
			const order = carrier === "channel" ? ["channel", "route"] : ["route", "channel"];
			for (const candidate of order) {
				const result = candidate === "route" ? await callRoute(endpoint, payload) : await callChannel(rpc, endpoint, payload);
				if (result !== void 0) {
					carrier = candidate;
					return result;
				}
			}
			return { ok: false, error: { code: "preview-unreachable", message: "no preview carrier is mounted in this composition" } };
		}
		//#endregion
		//#region styles
		const css = ".dshmdp_root{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 8px;margin-top:16px;font-size:13px;line-height:22px}.dshmdp_label{color:var(--dsw-alias-label-tertiary,#8a919c);grid-area:1/1;white-space:nowrap}.dshmdp_row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;grid-area:1/2}.dshmdp_chip{display:inline-flex;align-items:center;gap:6px;max-width:320px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-secondary,#4b5563);font:inherit;cursor:pointer;border:none;border-radius:6px;margin:0;padding:0 8px;overflow:hidden}.dshmdp_chip>span{text-overflow:ellipsis;overflow:hidden}.dshmdp_chip:hover{color:var(--dsw-alias-label-primary,#111827);text-decoration:underline}.dshmdp_chip[data-open=true]{color:var(--dsw-alias-label-primary,#111827)}.dshmdp_native{color:var(--dsw-alias-label-tertiary,#8a919c);font:inherit;cursor:pointer;background:none;border:none;border-radius:4px;padding:0 4px;flex:none}.dshmdp_native:hover{color:var(--dsw-alias-label-primary,#111827);text-decoration:underline}.dshmdp_more{color:var(--dsw-alias-label-tertiary,#8a919c);white-space:nowrap}.dshmdp_showFolder{grid-area:2/2;justify-self:start;color:var(--dsw-alias-label-tertiary,#8a919c);font:inherit;cursor:pointer;background:none;border:none;border-radius:4px;padding:0 2px;line-height:20px}.dshmdp_showFolder:hover{color:var(--dsw-alias-label-secondary,#4b5563);text-decoration:underline}.dshmdp_preview{grid-column:1/-1;margin-top:4px;border:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));border-radius:8px;padding:10px 14px;max-height:60vh;overflow:auto;font-size:13px;line-height:1.65;background:var(--dsw-alias-surface-raised,var(--dsw-alias-bg-layer-1,#ffffff));color:var(--dsw-alias-label-primary,#0f1115)}.dshmdp_panelHead{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a919c)}.dshmdp_panelName{font-weight:600;color:var(--dsw-alias-label-secondary,#4b5563);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:none;max-width:55%}.dshmdp_panelMeta{flex:none;opacity:.85}.dshmdp_panelActions{margin-left:auto;display:flex;gap:4px;align-items:center}.dshmdp_panelActions button{color:var(--dsw-alias-label-tertiary,#8a919c);font:inherit;font-size:12px;cursor:pointer;background:none;border:none;border-radius:4px;padding:2px 6px}.dshmdp_panelActions button:hover{color:var(--dsw-alias-label-primary,#111827);text-decoration:underline;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.08))}.dshmdp_state{color:var(--dsw-alias-label-tertiary,#8a919c);padding:4px 0}.dshmdp_state[data-error=true]{color:var(--dsw-alias-state-error-primary,#dc2626)}.dshmdp_note{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a919c);margin-bottom:6px}.dshmdp_preview h1,.dshmdp_preview h2,.dshmdp_preview h3,.dshmdp_preview h4,.dshmdp_preview h5,.dshmdp_preview h6{margin:.6em 0 .3em;line-height:1.3}.dshmdp_preview h1{font-size:1.5em}.dshmdp_preview h2{font-size:1.3em}.dshmdp_preview h3{font-size:1.15em}.dshmdp_preview h4{font-size:1.05em}.dshmdp_preview p{margin:.35em 0}.dshmdp_preview ul,.dshmdp_preview ol{margin:.35em 0;padding-left:1.6em}.dshmdp_preview li{margin:.1em 0}.dshmdp_preview pre{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1));border-radius:6px;padding:8px 10px;overflow:auto;margin:.4em 0;font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word}.dshmdp_preview code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.dshmdp_preview :not(pre)>code{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));border-radius:4px;padding:0 4px;font-size:.92em}.dshmdp_preview blockquote{margin:.4em 0;padding:0 0 0 10px;border-left:3px solid var(--dsw-alias-border-l3,rgba(128,128,128,.3));color:var(--dsw-alias-label-tertiary,#6b7280)}.dshmdp_preview a{color:var(--dsw-alias-brand-primary,#3964fe)}.dshmdp_preview hr{border:none;border-top:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));margin:.8em 0}.dshmdp_preview table{border-collapse:collapse;margin:.4em 0;display:block;max-width:100%;overflow:auto}.dshmdp_preview th,.dshmdp_preview td{border:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));padding:3px 8px}.dshmdp_preview th{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.08))}.dshmdp_preview img{max-width:100%;border-radius:6px;margin:.4em 0}.dshmdp_preview .hljs{background:transparent;padding:0}.dshmdp_preview .dshmdp-hljs{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1))}.dshmdp_preview .hljs-keyword,.dshmdp_preview .hljs-selector-tag,.dshmdp_preview .hljs-literal,.dshmdp_preview .hljs-doctag,.dshmdp_preview .hljs-section{color:#cf222e}.dshmdp_preview .hljs-string,.dshmdp_preview .hljs-attr{color:#0a3069}.dshmdp_preview .hljs-number,.dshmdp_preview .hljs-symbol,.dshmdp_preview .hljs-bullet{color:#0550ae}.dshmdp_preview .hljs-comment,.dshmdp_preview .hljs-quote{color:#6e7781;font-style:italic}.dshmdp_preview .hljs-title,.dshmdp_preview .hljs-function .hljs-title,.dshmdp_preview .hljs-name{color:#8250df}.dshmdp_preview .hljs-title.class_,.dshmdp_preview .hljs-class .hljs-title,.dshmdp_preview .hljs-type,.dshmdp_preview .hljs-built_in,.dshmdp_preview .hljs-variable,.dshmdp_preview .hljs-template-variable{color:#953800}.dshmdp_preview .hljs-tag{color:#116329}.dshmdp_preview .hljs-attribute{color:#0550ae}.dshmdp_preview .hljs-meta{color:#0550ae}.dshmdp_preview .hljs-emphasis{font-style:italic}.dshmdp_preview .hljs-strong{font-weight:600}.dshmdp_code{background:#0d1117;border-radius:8px;overflow:auto;margin:.4em 0}.dshmdp_code pre{margin:0;padding:14px 16px;background:transparent;white-space:pre}.dshmdp_code code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e6edf3;background:transparent;font-size:12.5px;line-height:1.55}.dshmdp_code .hljs-keyword,.dshmdp_code .hljs-selector-tag,.dshmdp_code .hljs-literal,.dshmdp_code .hljs-doctag,.dshmdp_code .hljs-section{color:#ff7b72}.dshmdp_code .hljs-string,.dshmdp_code .hljs-attr{color:#a5d6ff}.dshmdp_code .hljs-number,.dshmdp_code .hljs-symbol,.dshmdp_code .hljs-bullet{color:#79c0ff}.dshmdp_code .hljs-comment,.dshmdp_code .hljs-quote{color:#8b949e;font-style:italic}.dshmdp_code .hljs-title,.dshmdp_code .hljs-function .hljs-title,.dshmdp_code .hljs-name{color:#d2a8ff}.dshmdp_code .hljs-title.class_,.dshmdp_code .hljs-class .hljs-title,.dshmdp_code .hljs-type,.dshmdp_code .hljs-built_in{color:#ffa657}.dshmdp_code .hljs-variable,.dshmdp_code .hljs-template-variable{color:#ffa657}.dshmdp_code .hljs-tag{color:#7ee787}.dshmdp_code .hljs-attribute{color:#79c0ff}.dshmdp_code .hljs-meta{color:#79c0ff}.dshmdp_code .hljs-emphasis{font-style:italic}.dshmdp_code .hljs-strong{font-weight:600}.dshmdp_fs{position:fixed;inset:0;z-index:99999;background:var(--dsw-alias-bg-layer-1,#ffffff);display:flex;flex-direction:column}.dshmdp_fsHead{display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.25));font-size:13px;flex:none}.dshmdp_fsBody{flex:1;overflow:auto;padding:20px 28px;font-size:14px;line-height:1.65;color:var(--dsw-alias-label-primary,#0f1115)}.dshmdp_fsBody img{max-width:100%;margin:0 auto;display:block;border-radius:6px}.dshmdp_fsBody pre{white-space:pre-wrap;word-break:break-word}.dshmdp_fsBody .dshmdp_code{max-width:1200px;margin:0 auto}";
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
		* One-shot native-opener capability probe, memoized per page: the answer
		* is a property of the host deployment, not of a row or a turn.
		*/
		let nativeOpenProbe;
		/**
		* Ask the host half whether this deployment can hand a path to a
		* user-visible native desktop. Failure reads as "cannot", which only
		* hides a secondary action.
		* @param rpc - connection RPC caller injected by the slot.
		* @returns whether the native-open action should be offered.
		*/
		function probeNativeOpen(rpc) {
			if (nativeOpenProbe === void 0) {
				nativeOpenProbe = invoke(rpc, "capabilities", {}).then((result) => result?.ok === true && result.value?.canOpenPath === true).catch(() => false);
			}
			return nativeOpenProbe;
		}
		/**
		* Whether the host desktop can open a produced path in the OS default
		* application: loopback sessions only, and only when the host says so.
		* @param isLoopback - whether this browser talks to a loopback host.
		* @param rpc - connection RPC caller.
		* @returns the capability decision for the current render.
		*/
		function useNativeOpen(isLoopback, rpc) {
			const [probed, setProbed] = react.useState(false);
			react.useEffect(() => {
				let live = true;
				probeNativeOpen(rpc).then((value) => {
					if (live) setProbed(value);
				});
				return () => {
					live = false;
				};
			}, [rpc]);
			return isLoopback === true && probed;
		}
		/**
		* The produced-files row with in-browser preview: clicking a chip fetches
		* the file over the /preview channel and renders it inline (Markdown
		* rendered host-side, images as data URLs, everything else plain text); a
		* secondary action opens the file in the OS default application, and the
		* folder link is preserved.
		*
		* This row is a slot-level contribution, not a replacement of the
		* official produced-files row: the bundle patch disables nothing, and the
		* official entry stays registered as this chain seat's fallback.
		*/
		function PreviewRow({ matched: paths, openFile, isLoopback, rpc, t }) {
			const canOpenNative = useNativeOpen(isLoopback, rpc);
			const [expanded, setExpanded] = react.useState(null);
			const [states, setStates] = react.useState({});
			const [copied, setCopied] = react.useState(false);
			const [fullscreen, setFullscreen] = react.useState(false);
			const shown = paths.slice(0, SHOWN_LIMIT);
			const hidden = paths.length - shown.length;
			const toggle = (path) => {
				if (expanded === path) {
					setExpanded(null);
					setFullscreen(false);
					return;
				}
				setExpanded(path);
				if (states[path] !== void 0) return;
				setStates((current) => ({ ...current, [path]: { status: "loading" } }));
				invoke(rpc, "read", { path }).then((result) => {
					// No carrier mounted: hand the path to the platform's own opener
					// instead of reporting a preview failure.
					if (!result.ok && result.error.code === "preview-unreachable") {
						setExpanded(null);
						openFile(path);
						return;
					}
					setStates((current) => {
						if (!result.ok) return { ...current, [path]: { status: "error", message: result.error.message } };
						return { ...current, [path]: { status: "done", value: result.value } };
					});
				}).catch((error) => {
					setStates((current) => ({ ...current, [path]: { status: "error", message: String(error?.message ?? error) } }));
				});
			};
			// Esc 关闭全屏
			react.useEffect(() => {
				if (!fullscreen) return;
				const onKey = (event) => {
					if (event.key === "Escape") setFullscreen(false);
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [fullscreen]);
			const openInApp = (event, path) => {
				event.stopPropagation();
				invoke(rpc, "open", { path }).catch(() => {});
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
				if (value.kind === "code") {
					return (0, react_jsx_runtime.jsx)("div", {
						className: "dshmdp_code",
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
											state !== void 0 && state.status === "done" && (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => {
													setFullscreen(true);
												},
												children: t("preview.fullscreen")
											}),
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
					}),
					fullscreen && expanded !== null && state !== void 0 && state.status === "done" && (0, react_jsx_runtime.jsxs)("div", {
						className: "dshmdp_fs",
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: "dshmdp_fsHead",
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: "dshmdp_panelName",
										children: basename(expanded)
									}),
									(0, react_jsx_runtime.jsx)("span", {
										className: "dshmdp_panelMeta",
										children: formatBytes(state.value.bytes)
									}),
									(0, react_jsx_runtime.jsxs)("span", {
										className: "dshmdp_panelActions",
										children: [
											state.value.content !== void 0 && (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: (event) => {
													copyContent(event, state.value.content);
												},
												children: copied ? t("preview.copied") : t("preview.copy")
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => {
													setFullscreen(false);
												},
												children: t("preview.close")
											})
										]
									})
								]
							}),
							(0, react_jsx_runtime.jsx)("div", {
								className: "dshmdp_fsBody",
								children: renderBody(state.value)
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
			"preview.fullscreen": "全屏",
			"preview.close": "关闭",
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
			"preview.fullscreen": "Fullscreen",
			"preview.close": "Close",
			"preview.collapse": "Collapse",
			"preview.loading": "Loading preview…",
			"preview.error": "Preview failed",
			"preview.truncated": "Large file: showing the first 1 MiB",
			"preview.copy": "Copy content",
			"preview.copied": "Copied"
		};
		//#endregion
		//#region plugin body
		/**
		* Chain seats elect the lowest-priority accepting entry, so any negative
		* priority makes this row win over the official produced-files row while
		* that row stays enabled and registered — the documented slot extension
		* point, not a bundle-patch disable.
		*
		* `-1` is the smallest step that still wins that seat: it beats the
		* official fallback (priority 0) while leaving every other contributor
		* below it room to shadow this row. Specialised rows already sit there —
		* for example a produced-HTML row at -10 keeps the HTML turns it selects
		* for, and this row only runs on the turns that decline. When this row
		* itself declines (no produced files, presented files, or this plugin
		* uninstalled) the official entry renders exactly as before.
		*/
		const PREVIEW_PRIORITY = -1;
		/** Required services for the turn-tail registration and its dictionaries. */
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		/**
		* Client plugin body: register the dictionaries and the turn-tail entry.
		*
		* Nothing official is claimed here: the `deliverables` Conversation Node
		* definition, the `chatFileMentions` provider, and the `deliverables`
		* dictionary namespace all stay with the official produced-files bundle,
		* which the bundle patch leaves enabled. This half only reads that
		* bundle's published Turn data.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const connection = ctx.get("connection");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "markdown-preview: dictionaries");
			ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
				name: "conversation.chat.turnTail",
				priority: PREVIEW_PRIORITY,
				select: selectPreviewableFiles,
				locale: NS,
				inject: () => ({
					rpc: connection.rpc,
					isLoopback: connection.isLoopback
				})
			}, PreviewRow));
		}
		//#endregion
		exports.PreviewRow = PreviewRow;
		exports.apply = apply;
		exports.inject = inject;
		exports.producedForClosing = producedForClosing;
		return module.exports;
	}
});
