window.__ModuleLoader__.load({
	id: "dsh-sidebar-mode",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const STYLE_ID = "dsh-sidebar-mode-style";
		const CSS = `
.dsh-smode-inline{display:inline-flex;align-items:center;flex:none;margin-right:3px;padding:0 4px;border-radius:6px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,#9aa0a6);opacity:.8;cursor:pointer;user-select:none;transition:background .15s ease,color .15s ease,opacity .15s ease}
.dsh-smode-inline:hover,.dsh-smode-inline[aria-expanded="true"]{background:var(--dsw-alias-bg-layer-2,rgba(128,128,140,.12));color:var(--dsw-alias-label-primary,#e8e8ea);opacity:1}
.dsh-smode-menu{position:fixed;z-index:950;min-width:224px;max-width:320px;box-sizing:border-box;margin:0;padding:6px;border-radius:12px;background:var(--dsw-alias-bg-overlay,#2c2c2e);box-shadow:0 8px 24px rgba(0,0,0,.35);color:var(--dsw-alias-label-primary,#e8e8ea);font-size:13px;line-height:1.45}
.dsh-smode-menu-caption{padding:6px 10px 8px;color:var(--dsw-alias-label-secondary,#8a8f98);font-size:12px}
.dsh-smode-menu-item{display:flex;align-items:flex-start;gap:8px;width:100%;box-sizing:border-box;margin:0;padding:7px 10px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dsh-smode-menu-item:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,140,.12))}
.dsh-smode-menu-item[aria-checked="true"]{color:var(--dsw-alias-brand-primary,#4c9aff)}
.dsh-smode-menu-item .dsh-smode-ico{flex:none;width:14px;text-align:center}
.dsh-smode-menu-item .dsh-smode-txt{flex:1;min-width:0}
.dsh-smode-menu-item .dsh-smode-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-smode-menu-item .dsh-smode-desc{display:block;margin-top:2px;color:var(--dsw-alias-label-secondary,#8a8f98);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-smode-menu-foot{padding:6px 10px 4px;color:var(--dsw-alias-label-secondary,#8a8f98);font-size:11px}
.dsh-smode-menu-err{padding:6px 10px 4px;color:var(--dsw-alias-state-error-primary,#e5534b);font-size:12px;white-space:pre-wrap;word-break:break-word}
`;

		const inject = ["connection"];

		function apply(ctx) {
			const conn = ctx.get("connection");
			const api = conn && conn.api;
			if (!api) return;

			if (typeof document !== "undefined" && document.getElementById(STYLE_ID) === null) {
				const style = document.createElement("style");
				style.id = STYLE_ID;
				style.textContent = CSS;
				document.head.appendChild(style);
			}

			let hostBtn = null;
			let label = null;
			let menu = null;
			let retryObserver = null;
			let classObserver = null;
			let state = { options: [], current: null, error: null };
			let menuOpen = false;
			let disposing = false;
			let lastLoaded = 0;
			let pendingRefresh = null;
			const disposers = [];

			const shortName = (name) => {
				const s = String(name || "").replace(/\s*模式\s*$/, "");
				return s.length > 0 ? s : name;
			};
			const nameOf = (id) => {
				for (const o of state.options) if (o.id === id) return o.name;
				return id;
			};

			// 当前空白会话（新会话页正在展示的那个）
			const currentSession = () => {
				try {
					const svc = ctx.get("sessions");
					if (!svc || !svc.list) return null;
					const snap = svc.list.getSnapshot();
					if (!snap || !snap.current) return null;
					const cur = snap.byId && snap.byId[snap.current];
					if (!cur) return null;
					return { id: cur.id, blank: !!cur.blank, agentPreset: cur.agentPreset === undefined ? null : cur.agentPreset };
				} catch (error) {
					return null;
				}
			};

			const renderLabel = () => {
				if (!label) return;
				if (state.error && !state.current) {
					label.textContent = "!";
					label.title = state.error;
					return;
				}
				const name = state.current ? nameOf(state.current) : "…";
				label.textContent = shortName(name);
				label.title = "新会话默认预设：" + name + "（点击切换）";
			};

			const renderMenu = () => {
				if (!menu) return;
				menu.textContent = "";
				const caption = document.createElement("div");
				caption.className = "dsh-smode-menu-caption";
				caption.textContent = "新会话默认预设（与 设置 → Agent 预设 同步）";
				menu.appendChild(caption);
				if (state.error) {
					const err = document.createElement("div");
					err.className = "dsh-smode-menu-err";
					err.textContent = state.error;
					menu.appendChild(err);
				}
				for (const o of state.options) {
					const item = document.createElement("button");
					item.type = "button";
					item.className = "dsh-smode-menu-item";
					item.setAttribute("role", "menuitemradio");
					item.setAttribute("aria-checked", o.id === state.current ? "true" : "false");
					const ico = document.createElement("span");
					ico.className = "dsh-smode-ico";
					ico.textContent = o.id === state.current ? "✓" : "";
					const txt = document.createElement("span");
					txt.className = "dsh-smode-txt";
					const nm = document.createElement("span");
					nm.className = "dsh-smode-name";
					nm.textContent = o.name;
					txt.appendChild(nm);
					if (o.description) {
						const desc = document.createElement("span");
						desc.className = "dsh-smode-desc";
						desc.textContent = o.description;
						txt.appendChild(desc);
					}
					item.appendChild(ico);
					item.appendChild(txt);
					item.addEventListener("click", () => { select(o.id); });
					menu.appendChild(item);
				}
				const foot = document.createElement("div");
				foot.className = "dsh-smode-menu-foot";
				foot.textContent = "仅影响之后新建的会话";
				menu.appendChild(foot);
			};

			// 本地即时同步：徽章（或别处）给当前空白会话选了预设时，
			// 直接用 agent-preset/selected 事件载荷更新标签——不读会话存储，
			// 避免与产品的 noteAgentPreset 更新时序竞态造成"一步滞后"。
			const applyLocalSessionPreset = (sessionId, agentPreset) => {
				if (disposing || !agentPreset) return;
				// 只关心当前会话的变更
				if (sessionId !== null && sessionId !== undefined) {
					const cur = currentSession();
					if (!cur || cur.id !== sessionId) return;
				}
				if (state.options.length === 0 || state.options.some((o) => o.id === agentPreset)) {
					if (state.current !== agentPreset) {
						state.current = agentPreset;
						state.error = null;
						renderLabel();
						if (menuOpen) renderMenu();
					}
				}
			};

			// 合并刷新：同一时刻只发一个 wire 请求。事件触发走 force（绕过短缓存），
			// 菜单打开走非 force（缓存新鲜时不再扫盘）。
			const refresh = (force) => {
				if (pendingRefresh !== null) return pendingRefresh;
				const now = Date.now();
				if (!force && state.options.length > 0 && now - lastLoaded < 3000) return Promise.resolve();
				pendingRefresh = (async () => {
					try {
						const response = await api.agentPresets.list({});
						if (response.result.ok) {
							const presets = response.result.value.presets || [];
							state.options = presets
								.filter((p) => p.broken === undefined)
								.map((p) => ({
									id: p.id,
									name: p.name === undefined ? p.id : p.name,
									description: p.description === undefined ? null : p.description
								}));
							const def = presets.find((p) => p.isDefault);
							let current = def ? def.id : (presets[0] ? presets[0].id : null);
							// 若当前空白会话已应用过预设（徽章/本按钮选择的），显示它，
							// 与「新会话」页徽章保持一致
							const cur = currentSession();
							if (cur && cur.blank && cur.agentPreset && state.options.some((o) => o.id === cur.agentPreset)) {
								current = cur.agentPreset;
							}
							state.current = current;
							state.error = null;
							lastLoaded = Date.now();
						} else {
							state.error = "读取预设失败：" + ((response.result.error && response.result.error.message) || "未知错误");
						}
					} catch (error) {
						state.error = "读取预设失败：" + String((error && error.message) || error);
					}
					pendingRefresh = null;
					if (!disposing) {
						renderLabel();
						if (menuOpen) renderMenu();
					}
				})();
				return pendingRefresh;
			};

			// 防抖刷新：快速事件（设置文档更新）合并成一次，最后再发
			let refreshTimer = null;
			const debouncedRefresh = (delay) => {
				if (refreshTimer !== null) window.clearTimeout(refreshTimer);
				refreshTimer = window.setTimeout(() => {
					refreshTimer = null;
					refresh(true);
				}, delay);
			};

			// 后台串行写入队列：点击路径零 await，UI 永不阻塞。
			// 每项保持「先应用会话、再写默认」的顺序——徽章因 settings 变更而
			// reload 时读到的会话预设已是新值，快速连点按序落库、最终值正确。
			let writeQueue = Promise.resolve();

			const select = (id) => {
				if (id === state.current) { closeMenu(); return; }
				// 关菜单、更新标签、乐观显示——全部同步瞬间完成
				closeMenu();
				state.current = id;
				state.error = null;
				renderLabel();
				writeQueue = writeQueue.then(async () => {
					try {
						// 先应用会话（徽章 select 同款），失败不阻塞默认写入
						const cur = currentSession();
						if (cur && cur.blank) {
							try {
								await api.agentPresets.select({ sessionId: cur.id, agentPreset: id });
							} catch (error) { /* 应用失败（如会话已开始）跳过 */ }
						}
						const res = await api.settings.update({ ns: "agent-presets", patch: { default: id } });
						if (res.result.ok) {
							lastLoaded = 0;
						} else {
							state.error = "保存失败：" + ((res.result.error && res.result.error.message) || "未知错误");
							refresh(true); // 从源头重读，纠正乐观显示
						}
					} catch (error) {
						state.error = "保存失败：" + String((error && error.message) || error);
						refresh(true);
					}
				});
			};

			const positionMenu = () => {
				if (!hostBtn || !menu) return;
				menu.style.display = "block";
				const rect = hostBtn.getBoundingClientRect();
				const mw = menu.offsetWidth;
				const mh = menu.offsetHeight;
				let left = Math.max(8, Math.min(rect.left, window.innerWidth - mw - 8));
				let top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - mh - 8));
				menu.style.left = left + "px";
				menu.style.top = top + "px";
			};

			const openMenu = () => {
				if (disposing || !menu) return;
				renderMenu();
				positionMenu();
				menuOpen = true;
				if (label) label.setAttribute("aria-expanded", "true");
				document.addEventListener("mousedown", onDocDown, true);
				document.addEventListener("keydown", onKeyDown, true);
				refresh(false); // 后台刷新，不阻塞显示
			};

			const closeMenu = () => {
				if (!menuOpen) return;
				menuOpen = false;
				if (menu) menu.style.display = "none";
				if (label) label.setAttribute("aria-expanded", "false");
				document.removeEventListener("mousedown", onDocDown, true);
				document.removeEventListener("keydown", onKeyDown, true);
			};

			const onDocDown = (event) => {
				if (!menu || !label) return;
				if (menu.contains(event.target) || event.target === label || (hostBtn && hostBtn.contains(event.target))) return;
				closeMenu();
			};
			const onKeyDown = (event) => {
				if (event.key === "Escape") closeMenu();
			};
			const onResize = () => { closeMenu(); };

			const tryMount = () => {
				if (label && label.isConnected) return true;
				const anchor = document.querySelector('[class*="newSession"]');
				if (!anchor) return false;
				hostBtn = anchor;
				label = document.createElement("span");
				label.className = "dsh-smode-inline";
				label.setAttribute("role", "button");
				label.setAttribute("aria-haspopup", "menu");
				label.setAttribute("aria-expanded", "false");
				label.setAttribute("tabindex", "-1");
				label.textContent = "…";
				label.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					if (menuOpen) closeMenu();
					else openMenu();
				});
				anchor.insertBefore(label, anchor.firstChild);
				menu = document.createElement("div");
				menu.className = "dsh-smode-menu";
				menu.setAttribute("role", "menu");
				menu.style.display = "none";
				document.body.appendChild(menu);
				window.addEventListener("resize", onResize);
				const rootEl = anchor.parentElement;
				const applyRail = () => {
					if (!label || !rootEl) return;
					const collapsed = String(rootEl.className || "").indexOf("collapsed") >= 0;
					label.style.display = collapsed ? "none" : "";
				};
				applyRail();
				classObserver = new MutationObserver(applyRail);
				if (rootEl) classObserver.observe(rootEl, { attributes: true, attributeFilter: ["class"] });
				refresh(true);
				return true;
			};

			if (!tryMount()) {
				retryObserver = new MutationObserver(() => {
					if (tryMount()) retryObserver.disconnect();
				});
				retryObserver.observe(document.body, { childList: true, subtree: true });
			}

			// 双向同步：设置面板改默认 → 防抖 wire 刷新；
			// 徽章给会话选预设 → 本地即时同步（不丢快速连点）
			try {
				const remote = ctx.get("remote");
				if (remote && typeof remote.$on === "function") {
					disposers.push(remote.$on("settings/document-updated", (ns) => {
						if (ns === "agent-presets") debouncedRefresh(250);
					}));
					disposers.push(remote.$on("agent-preset/selected", (sessionId, agentPreset) => {
						applyLocalSessionPreset(sessionId, agentPreset);
						if (state.options.length === 0) refresh(true);
					}));
				}
			} catch (error) { /* remote 不可用时退化为打开菜单时刷新 */ }

			return () => {
				disposing = true;
				closeMenu();
				if (refreshTimer !== null) window.clearTimeout(refreshTimer);
				for (const dispose of disposers) { try { dispose(); } catch (error) {} }
				if (retryObserver) retryObserver.disconnect();
				if (classObserver) classObserver.disconnect();
				if (label && label.isConnected) label.remove();
				if (menu && menu.isConnected) menu.remove();
				window.removeEventListener("resize", onResize);
				const style = document.getElementById(STYLE_ID);
				if (style !== null) style.remove();
			};
		}

		module.exports = { name: "sidebar-mode-client", inject, apply };
		return module.exports;
	}
});
