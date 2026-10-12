// src__hud 06 — classlist
// Lines 1191-3169 of readable/src__hud.pretty.js (statement-aligned).
export class HUD {
  constructor(rootEl) {
    this.parent = rootEl || document.body;
    this.onUiSound = null;
    this._timers = new Set();
    this._round = 0;
    this._points = 0;
    this._health = 1;
    this._settings = { ...SETTING_DEFAULTS };
    this._ammoKey = "";
    this._perkKey = "";
    this._puKey = "";
    this._navs = {};
    // co-op state
    this._localSlot = null;
    this._known = new Map(); // name -> slot (for colouring names in feed text)
    this._team = new Map(); // id -> row element
    this._marks = new Map(); // id -> marker element
    this._chatActive = false;
    this.onChatSend = null;
    this._lobbyCb = {};
    this._name = "";
    this._injectHead();
    this._buildTextures();
    this._build();
    this._onKey = this._onKey.bind(this);
    window.addEventListener("keydown", this._onKey, true);
  }

  // ------------------------------------------------------------ setup
  _injectHead() {
    if (!document.getElementById("ub-hud-style")) {
      if (!document.querySelector(`link[href="${FONT_HREF}"]`)) {
        const pc = document.createElement("link");
        pc.rel = "preconnect";
        pc.href = "https://fonts.gstatic.com";
        pc.crossOrigin = "";
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = FONT_HREF;
        document.head.append(pc, l);
      }
      const st = document.createElement("style");
      st.id = "ub-hud-style";
      st.textContent = CSS + CSS_COOP;
      document.head.appendChild(st);
    }
  }

  _buildTextures() {
    const tx = {};
    try {
      tx.noise = texNoise(192, 5);
      tx.paper = texPaper(7);
      tx.smear = texSmear("150,14,10", 3);
      tx.smearDark = texSmear("0,0,0", 9, 512, 80, true);
      tx.splat = [11, 23, 37, 51, 68].map((sd) => texSplatter(sd));
    } catch (e) {
      console.warn("[hud] texture generation failed", e);
      tx.splat = [];
    }
    this._tx = tx;
  }

  _build() {
    const R = (this.root = h("div", "ub-root"));
    const tx = this._tx;
    const u = (d) => (d ? `url(${d})` : "none");
    R.style.setProperty("--tx-noise", u(tx.noise));
    R.style.setProperty("--tx-paper", u(tx.paper));
    R.style.setProperty("--tx-smear", u(tx.smear));
    R.style.setProperty("--tx-smear-dark", u(tx.smearDark));
    R.insertAdjacentHTML("beforeend", DEFS);

    // ---- fx layer (under hud)
    const fx = (this.fx = h("div", "ub-fx off"));
    this.elHurt = h("div", "ub-hurt");
    this.elHurtSp = h("div", "ub-hurt-sp");
    if (tx.splat.length) {
      [
        [0, 100, 0],
        [100, 0, 2],
        [100, 100, 4],
      ].forEach(([x, y, i]) => {
        const b = h("b");
        b.style.left = x + "%";
        b.style.top = y + "%";
        b.style.backgroundImage = `url(${tx.splat[i]})`;
        b.style.transform = `translate(-50%,-50%) rotate(${i * 67}deg)`;
        this.elHurtSp.appendChild(b);
      });
    }
    this.elDmg = h("div");
    this.elDmg.style.cssText = "position:absolute;inset:0";
    this.elFlash = h("div", "ub-flash");
    this.elDowned = h("div", "ub-downed");
    this.elDowned.innerHTML = `<div class="ub-bleed"><svg viewBox="-40 -40 80 80"><circle r="34" class="bg"/><circle r="34" class="ring" pathLength="1" stroke-dasharray="1 1"/></svg><div class="lbl">BLEEDING OUT</div><div class="sub">Hold on, soldier...</div></div>`;
    this.elRing = this.elDowned.querySelector(".ring");
    fx.append(
      this.elHurt,
      this.elHurtSp,
      this.elDmg,
      this.elFlash,
      this.elDowned,
    );

    // ---- hud layer
    const hud = (this.hud = h("div", "ub-hud off"));
    hud.append(h("div", "ub-corner-shade l"), h("div", "ub-corner-shade r"));
    const bl = h("div", "ub-bl");
    this.elPerks = h("div", "ub-perks");
    this.elRound = h("div", "ub-round");
    bl.append(this.elPerks, this.elRound);

    const br = h("div", "ub-br");
    const pw = h("div", "ub-points-wrap");
    this.elPops = h("div", "ub-pops");
    this.elPoints = h("div", "ub-points", "0");
    this.elMedic = h("span", "", MEDIC_SVG).firstChild;
    pw.append(this.elMedic, this.elPops, this.elPoints);
    this.elPW = pw;
    this.elTeam = h("div", "ub-team");
    const am = h("div", "ub-ammo");
    this.elWName = h("div", "ub-wname", "");
    const row = h("div", "ub-ammo-row");
    this.elMag = h("span", "ub-mag", "0");
    this.elRes = h("span", "ub-res", "0");
    row.append(this.elMag, h("span", "ub-slash", "/"), this.elRes);
    this.elTicks = h("div", "ub-ticks");
    this.elNades = h("div", "ub-nades");
    am.append(this.elWName, row, this.elTicks, this.elNades);
    br.append(this.elTeam, pw, am);

    this.elPU = h("div", "ub-pu");
    this.elCross = h("div", "ub-cross");
    this.elCross.innerHTML =
      '<i class="v t"></i><i class="v b"></i><i class="hz l"></i><i class="hz r"></i><i class="dot"></i>';
    this._cl = [...this.elCross.querySelectorAll("i")];
    this.elHit = h(
      "div",
      "ub-hit",
      '<svg viewBox="-20 -20 40 40"><path d="M-6-6 L-14-14 M6-6 L14-14 M-6 6 L-14 14 M6 6 L14 14"/></svg>',
    );
    this.elHint = h("div", "ub-hint");
    this.elPrompt = h("div", "ub-prompt");
    this.elBanner = h("div", "ub-banner");
    this.elMsg = h("div", "ub-msg");
    this._buildCoopHud();
    hud.append(
      this.elMarks,
      this.elSpec,
      bl,
      br,
      this.elPU,
      this.elCross,
      this.elHit,
      this.elHint,
      this.elRevive,
      this.elPrompt,
      this.elBanner,
      this.elMsg,
      this.elFeed,
      this.elChat,
      this.elNet,
      this.elSB,
    );
    this.crosshair(0, true);

    // ---- screens
    this._buildLoading();
    this._buildMenu();
    this._buildPause();
    this._buildGameOver();
    this._buildSheets();
    this._buildCoopScreens();

    R.append(
      fx,
      hud,
      this.scrMenu,
      this.scrLobby,
      this.scrPause,
      this.scrGo,
      this.scrCoop,
      this.scrSettings,
      this.scrControls,
      this.scrConn,
      this.scrErr,
      this.scrLoading,
    );
    this.parent.appendChild(R);
  }

  _sound(name) {
    try {
      this.onUiSound && this.onUiSound(name);
    } catch (e) {
      /* never throw */
    }
  }
  _after(ms, fn) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      fn();
    }, ms);
    this._timers.add(id);
    return id;
  }

  // ------------------------------------------------------------ nav (keyboard + mouse)
  _makeNav(name, items, opts = {}) {
    const nav = { items, index: 0, ...opts };
    items.forEach((it) => {
      it.addEventListener("mouseenter", () => {
        const i = nav.items.indexOf(it);
        if (nav.enabled === false || i < 0) return;
        if (nav.index !== i) {
          this._sound("ui_hover");
        }
        this._select(nav, i);
      });
      it.addEventListener("click", (e) => {
        const i = nav.items.indexOf(it);
        if (nav.enabled === false || i < 0) return;
        if (it._noClick) return;
        e.preventDefault();
        this._select(nav, i);
        this._activate(nav);
      });
    });
    this._navs[name] = nav;
    return nav;
  }
  _select(nav, i, fromKey = false) {
    const n = nav.items.length;
    if (!n) return;
    nav.index = (i + n) % n;
    nav.items.forEach((it, k) =>
      it.classList.toggle("is-sel", k === nav.index),
    );
    if (nav.onSelect) nav.onSelect(nav.items[nav.index], nav.index, fromKey);
    const it = nav.items[nav.index];
    if (fromKey) {
      const ae = document.activeElement;
      if (it._input) it._input.focus({ preventScroll: true });
      else if (
        ae &&
        ae.tagName === "INPUT" &&
        ae.type !== "range" &&
        this.root.contains(ae)
      )
        ae.blur();
    }
  }
  _activate(nav) {
    const it = nav.items[nav.index];
    if (!it || it.classList.contains("dis")) return;
    this._sound("ui_click");
    it._act && it._act();
  }
  _currentNav() {
    const on = (el) => el && el.classList.contains("on");
    if (on(this.scrLoading)) return null;
    if (on(this.scrErr)) return this._navs.error;
    if (on(this.scrConn)) return this._navs.conn;
    if (on(this.scrSettings)) return this._navs.settings;
    if (on(this.scrControls)) return this._navs.controls;
    if (on(this.scrCoop)) return this._navs.coop;
    if (on(this.scrGo)) return this._navs.gameover;
    if (on(this.scrLobby)) return this._navs.lobby;
    if (on(this.scrPause)) return this._navs.pause;
    if (on(this.scrMenu)) return this._navs.menu;
    return null;
  }
  _onKey(e) {
    const nav = this._currentNav();
    if (!nav) return;
    const k = e.key;
    const tg = e.target;
    if (tg && tg.tagName === "INPUT" && tg.type !== "range") {
      // typing into a text field: only navigation keys are ours
      if (k === "ArrowUp" || k === "ArrowDown" || k === "Tab") {
        this._select(
          nav,
          nav.index + (k === "ArrowUp" || (k === "Tab" && e.shiftKey) ? -1 : 1),
          true,
        );
        this._sound("ui_hover");
        e.preventDefault();
      } else if (k === "Enter") {
        this._activate(nav);
        e.preventDefault();
      } else if (k === "Escape" && nav.back) {
        tg.blur();
        this._sound("ui_click");
        nav.back();
        e.preventDefault();
      }
      return;
    }
    if (nav.onAnyKey && nav.onAnyKey(e)) {
      e.preventDefault();
      return;
    }
    if (nav.enabled === false) return;
    const vert = nav.horizontal
      ? ["ArrowLeft", "ArrowRight"]
      : ["ArrowUp", "ArrowDown"];
    if (k === vert[0] || (!nav.horizontal && (k === "w" || k === "W"))) {
      this._select(nav, nav.index - 1, true);
      this._sound("ui_hover");
      e.preventDefault();
    } else if (k === vert[1] || (!nav.horizontal && (k === "s" || k === "S"))) {
      this._select(nav, nav.index + 1, true);
      this._sound("ui_hover");
      e.preventDefault();
    } else if (
      (k === "ArrowLeft" ||
        k === "ArrowRight" ||
        k === "a" ||
        k === "d" ||
        k === "A" ||
        k === "D") &&
      nav.onLR
    ) {
      nav.onLR(
        nav.items[nav.index],
        k === "ArrowLeft" || k === "a" || k === "A" ? -1 : 1,
      );
      e.preventDefault();
    } else if (k === "Enter" || k === " ") {
      this._activate(nav);
      e.preventDefault();
    } else if ((k === "Escape" || k === "Backspace") && nav.back) {
      this._sound("ui_click");
      nav.back();
      e.preventDefault();
    }
  }
  _item(label, act, cls = "ub-item") {
    const b = h(
      "button",
      cls,
      `<span class="smear"></span><span class="lbl">${esc(label)}</span>`,
    );
    b.type = "button";
    b.tabIndex = -1;
    b._act = act;
    return b;
  }

  // ------------------------------------------------------------ loading
  _buildLoading() {
    const L = (this.scrLoading = h("div", "ub-screen ub-loading"));
    L.innerHTML = `<div class="ub-grain"></div><div class="ub-vig"></div>
      <div class="inner">
        <div class="ub-load-title">UNBURIED</div>
        <div class="ub-load-sub">BLACKWALD BUNKER</div>
        <div class="ub-fuse"><div class="rope"></div><div class="cov"></div><div class="burnt"></div><div class="spark">${Array.from(
          { length: 7 },
          (_, i) =>
            `<i style="--dx:${(Math.cos(i * 1.9) * 26 - 8).toFixed(0)}px;--dy:${(-10 - Math.abs(Math.sin(i * 2.3)) * 22).toFixed(0)}px;animation-delay:${(i * 0.1).toFixed(2)}s"></i>`,
        ).join("")}</div></div>
        <div class="ub-load-row"><span class="st">Loading...</span><span class="ub-load-pct">0%</span></div>
        <div class="ub-load-flav"></div>
      </div>`;
    this._ld = {
      burnt: L.querySelector(".burnt"),
      cov: L.querySelector(".cov"),
      spark: L.querySelector(".spark"),
      st: L.querySelector(".st"),
      pct: L.querySelector(".ub-load-pct"),
      flav: L.querySelector(".ub-load-flav"),
    };
  }
  showLoading(progress = 0, text) {
    const p = clamp01(progress),
      L = this._ld;
    const pc = `${(p * 100).toFixed(1)}%`;
    L.burnt.style.width = pc;
    L.cov.style.width = pc;
    L.spark.style.left = pc;
    L.pct.textContent = `${Math.round(p * 100)}%`;
    if (text != null) L.st.textContent = text;
    if (!this.scrLoading.classList.contains("on")) {
      this.scrLoading.classList.add("on");
      let i = Math.floor(Math.random() * FLAVOUR.length);
      L.flav.textContent = FLAVOUR[i];
      clearInterval(this._flavInt);
      this._flavInt = setInterval(() => {
        L.flav.classList.add("fade");
        setTimeout(() => {
          i = (i + 1) % FLAVOUR.length;
          L.flav.textContent = FLAVOUR[i];
          L.flav.classList.remove("fade");
        }, 600);
      }, 4200);
    }
  }
  hideLoading() {
    this.scrLoading.classList.remove("on");
    clearInterval(this._flavInt);
  }

  // ------------------------------------------------------------ main menu
  _buildMenu() {
    const M = (this.scrMenu = h("div", "ub-screen ub-menu"));
    M.innerHTML = `<div class="shade"></div><div class="ub-grain"></div><div class="ub-vig"></div>
      <div class="panel">
        <div class="ub-kicker">A ROUND-BASED SURVIVAL</div>
        <h1 class="ub-title">UNBURIED</h1>
        <div class="ub-subtitle"><span class="rule"></span>BLACKWALD BUNKER<span class="rule"></span></div>
        <nav class="ub-items"></nav>
        <div class="ub-desc"></div>
        <div class="ub-foot"><span><span class="ub-key">↑</span><span class="ub-key">↓</span> Select</span><span><span class="ub-key">Enter</span> Confirm</span></div>
      </div>
      <div class="ub-ver">WINTER 1944 · BUILD 1.0</div>`;
    const list = M.querySelector(".ub-items"),
      desc = M.querySelector(".ub-desc");
    const defs = [
      [
        "Solo",
        "Hold the bunker alone. Survive the night.",
        () => this._menuCb.onPlay && this._menuCb.onPlay(),
      ],
      [
        "Co-op",
        "Up to four soldiers online. Host a room or join with a code.",
        () => this.showCoop(),
      ],
      [
        "Settings",
        "Sensitivity, field of view, audio, graphics.",
        () => this._openSettingsFrom("menu"),
      ],
      [
        "Controls",
        "Field manual: movement, weapons, equipment.",
        () => this.showControls(),
      ],
    ];
    const items = defs.map(([l, , a]) => this._item(l, a));
    items.forEach((b) => list.appendChild(b));
    this._coopItem = items[1];
    this._makeNav("menu", items, {
      onSelect: (_, i) => {
        desc.textContent = defs[i][1];
      },
    });
    this._menuCb = {};
  }
  showMenu(cb = {}) {
    this._menuCb = cb || {};
    if (typeof this._menuCb.name === "string" && this._menuCb.name)
      this._setName(this._menuCb.name, false);
    this._coopItem.classList.toggle(
      "dis",
      !this._menuCb.onHost && !this._menuCb.onJoin,
    );
    this.scrMenu.classList.add("on");
    this._select(this._navs.menu, 0);
  }
  hideMenu() {
    this.scrMenu.classList.remove("on");
    this._closeSheets();
    this.hideCoop();
  }

  _openSettingsFrom(where) {
    const cb = where === "pause" ? this._pauseCb : this._menuCb;
    if (cb && typeof cb.onSettings === "function") cb.onSettings();
    else this.showSettings(this._settings, null, null);
  }

  // ------------------------------------------------------------ settings + controls sheets
  _buildSheets() {
    // settings
    const S = (this.scrSettings = h("div", "ub-screen ub-sheet"));
    const paper = h("div", "paper");
    paper.style.clipPath = tornPolygon(41, 1.1);
    paper.innerHTML = `<div class="ub-stamp">RESTRICTED</div><h2>SETTINGS</h2><div class="form"><span>FORM 7-B · FIELD CONFIG</span><span>BLACKWALD</span></div><div class="rows"></div>`;
    const rows = paper.querySelector(".rows");
    const items = [];
    this._setRows = {};
    for (const d of SETTING_DEFS) {
      const r = h("div", "ub-row");
      r.tabIndex = -1;
      r.innerHTML = `<span class="nm">${d.name}</span>`;
      if (d.options) {
        const seg = h("div", "ub-seg");
        d.options.forEach((o) => {
          const b = h("button", "", o.toUpperCase());
          b.type = "button";
          b.tabIndex = -1;
          b.dataset.v = o;
          b.addEventListener("click", (e) => {
            e.stopPropagation();
            this._setVal(d.key, o, true);
            this._sound("ui_click");
          });
          seg.appendChild(b);
        });
        r.appendChild(seg);
        r._set = (v) =>
          seg
            .querySelectorAll("button")
            .forEach((b) => b.classList.toggle("act", b.dataset.v === v));
        r._lr = (dir) => {
          const i = d.options.indexOf(this._settings[d.key]);
          const n = d.options[(i + dir + d.options.length) % d.options.length];
          this._setVal(d.key, n, true);
          this._sound("ui_hover");
        };
        r._act = () => r._lr(1);
      } else {
        const inp = h("input", "ub-range");
        inp.type = "range";
        inp.min = d.min;
        inp.max = d.max;
        inp.step = d.step;
        inp.tabIndex = -1;
        const val = h("span", "val");
        inp.addEventListener("input", () =>
          this._setVal(d.key, parseFloat(inp.value), true),
        );
        r.append(inp, val);
        r._noClick = true;
        r._set = (v) => {
          inp.value = v;
          inp.style.setProperty(
            "--p",
            `${((v - d.min) / (d.max - d.min)) * 100}%`,
          );
          val.textContent = d.fmt(v);
        };
        r._lr = (dir) => {
          const v = Math.min(
            d.max,
            Math.max(
              d.min,
              +(
                this._settings[d.key] +
                dir * d.step * (d.key === "fov" ? 1 : 1)
              ).toFixed(4),
            ),
          );
          this._setVal(d.key, v, true);
          this._sound("ui_hover");
        };
        r._act = () => {};
      }
      this._setRows[d.key] = r;
      rows.appendChild(r);
      items.push(r);
    }
    const back = h("button", "back", 'BACK<span class="ub-key">Esc</span>');
    back.type = "button";
    back.tabIndex = -1;
    back._act = () => this.hideSettings();
    paper.appendChild(back);
    items.push(back);
    S.appendChild(paper);
    S.addEventListener("mousedown", (e) => {
      if (e.target === S) {
        this._sound("ui_click");
        this.hideSettings();
      }
    });
    this._makeNav("settings", items, {
      back: () => this.hideSettings(),
      onLR: (it, dir) => it._lr && it._lr(dir),
    });

    // controls
    const C = (this.scrControls = h("div", "ub-screen ub-sheet"));
    const p2 = h("div", "paper");
    p2.style.clipPath = tornPolygon(77, 1.1);
    p2.innerHTML = `<div class="ub-stamp">FIELD MANUAL</div><h2>CONTROLS</h2><div class="form"><span>FM 44-12 · SECTION II</span><span>KEYBOARD / MOUSE</span></div>
      <div class="ub-ctl">${CONTROLS.map(([a, ks]) => `<div class="a">${a}</div><div class="k">${ks.map((k) => (k === "/" ? '<span class="or">/</span>' : k.startsWith(" ") ? `<span class="or">${k.trim()}</span>` : `<span class="ub-key">${k}</span>`)).join("")}</div>`).join("")}</div>`;
    const b2 = h("button", "back", 'BACK<span class="ub-key">Esc</span>');
    b2.type = "button";
    b2.tabIndex = -1;
    b2._act = () => this.hideControls();
    p2.appendChild(b2);
    C.appendChild(p2);
    C.addEventListener("mousedown", (e) => {
      if (e.target === C) {
        this._sound("ui_click");
        this.hideControls();
      }
    });
    this._makeNav("controls", [b2], { back: () => this.hideControls() });
  }
  _setVal(key, v, fire) {
    this._settings[key] = v;
    const r = this._setRows[key];
    r && r._set(v);
    if (fire && this._setOnChange) {
      try {
        this._setOnChange({ ...this._settings }, key, v);
      } catch (e) {
        console.error(e);
      }
    }
  }
  showSettings(values, onChange, onClose) {
    this._settings = {
      ...SETTING_DEFAULTS,
      ...this._settings,
      ...(values || {}),
    };
    for (const d of SETTING_DEFS)
      this._setVal(d.key, this._settings[d.key], false);
    this._setOnChange = onChange || null;
    this._setOnClose = onClose || null;
    this.scrControls.classList.remove("on");
    this.scrSettings.classList.add("on");
    this._select(this._navs.settings, 0);
  }
  hideSettings() {
    if (!this.scrSettings.classList.contains("on")) return;
    this.scrSettings.classList.remove("on");
    const cb = this._setOnClose;
    this._setOnClose = null;
    if (cb) {
      try {
        cb({ ...this._settings });
      } catch (e) {
        console.error(e);
      }
    }
  }
  showControls() {
    this.scrSettings.classList.remove("on");
    this.scrControls.classList.add("on");
    this._select(this._navs.controls, 0);
  }
  hideControls() {
    this.scrControls.classList.remove("on");
  }
  _closeSheets() {
    this.hideSettings();
    this.hideControls();
  }

  // ------------------------------------------------------------ pause
  _buildPause() {
    const P = (this.scrPause = h("div", "ub-screen ub-pause"));
    P.innerHTML = `<div class="ub-grain"></div><div class="ub-vig"></div><div class="panel"><div class="ub-kicker">OPERATION SUSPENDED</div><h2>PAUSED</h2><div class="info"></div><nav class="ub-items"></nav></div>`;
    const list = P.querySelector(".ub-items");
    this._pauseInfo = P.querySelector(".info");
    const items = [
      this._item(
        "Resume",
        () => this._pauseCb.onResume && this._pauseCb.onResume(),
      ),
      this._item("Settings", () => this._openSettingsFrom("pause")),
      this._item("Controls", () => this.showControls()),
      this._item(
        "Quit to menu",
        () => this._pauseCb.onQuit && this._pauseCb.onQuit(),
      ),
    ];
    items.forEach((b) => list.appendChild(b));
    this._makeNav("pause", items);
    this._pauseCb = {};
  }
  showPause(cb = {}) {
    this._pauseCb = cb || {};
    this.closeChat();
    this.showScoreboard(null);
    this._pauseInfo.textContent = `ROUND ${this._round || 1}  ·  ${this._points} POINTS`;
    this.scrPause.classList.add("on");
    this._select(this._navs.pause, 0);
  }
  hidePause() {
    this.scrPause.classList.remove("on");
    this._closeSheets();
  }

  // ------------------------------------------------------------ game over
  _buildGameOver() {
    const G = (this.scrGo = h("div", "ub-screen ub-go"));
    G.innerHTML = `<div class="ub-grain"></div><div class="ub-vig"></div><div class="inner"><div class="l1">YOU HAVE SURVIVED</div><div class="rn"></div><div class="l2">ROUNDS</div><div class="stats"></div><div class="btns"></div><div class="skip">PRESS ANY KEY</div></div>`;
    this._go = {
      l1: G.querySelector(".l1"),
      rn: G.querySelector(".rn"),
      l2: G.querySelector(".l2"),
      stats: G.querySelector(".stats"),
      btns: G.querySelector(".btns"),
      skip: G.querySelector(".skip"),
    };
    const items = [
      this._item(
        "Restart",
        () => this._goCb.onRestart && this._goCb.onRestart(),
      ),
      this._item("Main menu", () => this._goCb.onMenu && this._goCb.onMenu()),
    ];
    items.forEach((b) => this._go.btns.appendChild(b));
    const nav = this._makeNav("gameover", items, { horizontal: true });
    nav.onAnyKey = (e) => {
      if (nav.enabled === false) {
        this._goFinish();
        return true;
      }
      return false;
    };
    G.addEventListener("mousedown", () => {
      if (nav.enabled === false) this._goFinish();
    });
    this._goCb = {};
  }
  showGameOver(stats = {}, cb = {}) {
    this._goCb = cb || {};
    this._goClear();
    const g = this._go,
      n = Math.max(0, stats.round | 0);
    g.l1.classList.remove("in");
    g.l2.classList.remove("in");
    g.btns.classList.remove("in");
    g.l2.textContent = n === 1 ? "ROUND" : "ROUNDS";
    g.rn.innerHTML = "";
    g.skip.style.opacity = "1";
    const rows = [
      ["Rounds survived", String(n)],
      ["Kills", String(stats.kills ?? 0)],
      ["Headshots", String(stats.headshots ?? 0)],
      ["Points earned", String(stats.points ?? 0)],
      ["Times downed", String(stats.downs ?? 0)],
      ["Time survived", fmtTime(stats.timeSec)],
    ];
    g.stats.innerHTML = rows
      .map(
        () =>
          '<div class="st"><span class="k"></span><span class="dots"></span><span class="v"></span></div>',
      )
      .join("");
    this._goRows = rows;
    this._goN = n;
    const nav = this._navs.gameover;
    nav.enabled = false;
    nav.items.forEach((it) => it.classList.remove("is-sel"));
    this.scrGo.classList.add("on");
    this._after(900, () => g.l1.classList.add("in"));
    this._after(2000, () => {
      g.rn.appendChild(
        roundArt(n, { animate: true, delay: 0, seed: n * 31 + 5 }).svg,
      );
    });
    this._after(3400, () => g.l2.classList.add("in"));
    this._goTypeRows(4100);
  }
  _goTypeRows(start) {
    const els = [...this._go.stats.children];
    let t = start;
    this._goRows.forEach(([k, v], i) => {
      const el = els[i];
      this._after(t, () =>
        this._type(el.querySelector(".k"), k.toUpperCase(), 26, () => {
          el.classList.add("full");
          this._type(el.querySelector(".v"), v, 40);
        }),
      );
      t += 360;
    });
    this._after(t + 700, () => this._goReady());
  }
  _goReady() {
    const g = this._go,
      nav = this._navs.gameover;
    g.btns.classList.add("in");
    g.skip.style.opacity = "0";
    nav.enabled = true;
    this._select(nav, 0);
  }
  _goFinish() {
    // skip the reveal
    this._goClear();
    const g = this._go;
    g.l1.classList.add("in");
    g.l2.classList.add("in");
    if (!g.rn.firstChild)
      g.rn.appendChild(
        roundArt(this._goN, { animate: false, seed: this._goN * 31 + 5 }).svg,
      );
    else
      g.rn
        .querySelectorAll(".ub-stroke,.ub-drip,.ub-bulb")
        .forEach((p) => p.classList.add("ub-inst"));
    [...g.stats.children].forEach((el, i) => {
      el.querySelector(".k").textContent = this._goRows[i][0].toUpperCase();
      el.querySelector(".v").textContent = this._goRows[i][1];
      el.classList.add("full");
    });
    this._goReady();
  }
  _goClear() {
    for (const id of this._timers) clearTimeout(id);
    this._timers.clear();
  }
  hideGameOver() {
    this._goClear();
    this.scrGo.classList.remove("on");
  }

  _type(el, text, cps = 30, done) {
    el.textContent = "";
    let i = 0;
    const step = () => {
      i++;
      el.textContent = text.slice(0, i);
      if (i < text.length) this._after(1000 / cps, step);
      else done && done();
    };
    if (text.length) this._after(1000 / cps, step);
    else done && done();
  }

  // ------------------------------------------------------------ in-game HUD
  setVisible(v) {
    this.hud.classList.toggle("off", !v);
    this.fx.classList.toggle("off", !v);
  }

  setRound(n, animate = false) {
    n = Math.max(0, n | 0);
    const prev = this._round;
    this._round = n;
    const box = this.elRound;
    box.querySelectorAll(".ub-paint.out").forEach((e) => e.remove());
    const curs = [...box.querySelectorAll(".ub-paint")];
    if (!animate || !curs.length || n === prev) {
      box.innerHTML = "";
      if (n > 0) box.appendChild(roundArt(n, { animate }).svg);
      return;
    }
    if (prev >= 1 && prev <= 4 && n === prev + 1) {
      // tally: existing strokes throb white/red, then the new stroke is painted over them
      curs.forEach((c) => {
        c.classList.remove("throb");
        void c.getBoundingClientRect();
        c.classList.add("throb");
      });
      box.appendChild(
        roundArt(n, { animate: true, delay: 2.0, from: prev, strokeTime: 0.55 })
          .svg,
      );
      return;
    }
    curs.forEach((c) => c.classList.add("out"));
    box.appendChild(roundArt(n, { animate: true, delay: 2.1 }).svg);
    setTimeout(() => curs.forEach((c) => c.remove()), 3000);
  }

  setPoints(total) {
    total = Math.round(total || 0);
    if (total === this._points) return;
    this._points = total;
    this.elPoints.textContent = String(total);
    this.elPoints.classList.remove("bump");
    void this.elPoints.offsetWidth;
    this.elPoints.classList.add("bump");
  }

  pointsPopup(delta) {
    delta = Math.round(delta || 0);
    if (!delta) return;
    const el = h(
      "div",
      "ub-pop" + (delta < 0 ? " neg" : ""),
      (delta > 0 ? "+" : "−") + Math.abs(delta),
    );
    this.elPops.appendChild(el);
    while (this.elPops.childElementCount > 14) this.elPops.firstChild.remove();
    const neg = delta < 0;
    const dx = -(70 + Math.random() * 90) * (neg ? 0.55 : 1);
    const dy = neg
      ? 30 + Math.random() * 25
      : -(10 + Math.random() * 70) * (Math.random() < 0.2 ? -0.6 : 1);
    const cx = dx * (0.3 + Math.random() * 0.3),
      cy = dy - 25 - Math.random() * 35;
    const frames = [];
    const N = 9;
    for (let i = 0; i <= N; i++) {
      const t = i / N,
        u = 1 - t;
      const x = 2 * u * t * cx + t * t * dx,
        y = 2 * u * t * cy + t * t * dy;
      const sc = i === 0 ? 0.5 : i === 1 ? 1.2 : 1 - t * 0.25;
      frames.push({
        transform: `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) scale(${sc.toFixed(2)})`,
        opacity: i === 0 ? 0 : t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45,
        offset: t,
      });
    }
    const a = el.animate(frames, {
      duration: 950 + Math.random() * 350,
      easing: "cubic-bezier(.25,.6,.4,1)",
      fill: "forwards",
    });
    a.onfinish = () => el.remove();
  }

  setAmmo(a = {}) {
    const key = `${a.name}|${a.mag}|${a.reserve}|${a.magSize}|${a.upgraded}|${a.grenades}|${a.reloading}`;
    if (key === this._ammoKey) return;
    this._ammoKey = key;
    const mag = a.mag | 0,
      res = a.reserve | 0,
      ms = Math.max(1, a.magSize | 0);
    this.elWName.textContent = a.name || "";
    this.elWName.classList.toggle("up", !!a.upgraded);
    this.elMag.textContent = String(mag);
    this.elRes.textContent = String(res);
    const low = mag > 0 && mag <= Math.max(1, Math.ceil(ms * 0.25));
    this.elMag.classList.toggle("low", low);
    this.elMag.classList.toggle("empty", mag === 0);
    this.elRes.classList.toggle("zero", res === 0);
    // magazine ticks
    if (this._tickMs !== ms) {
      this._tickMs = ms;
      this.elTicks.innerHTML = "";
      this.elTicks.className = "ub-ticks" + (ms > 40 ? " bar" : "");
      if (ms > 40) this.elTicks.appendChild(h("b"));
      else for (let i = 0; i < ms; i++) this.elTicks.appendChild(h("i"));
    }
    if (ms > 40) this.elTicks.firstChild.style.width = `${(mag / ms) * 100}%`;
    else
      [...this.elTicks.children].forEach((t, i) =>
        t.classList.toggle("gone", i >= mag),
      );
    // grenades
    const g = Math.max(0, a.grenades | 0),
      slots = Math.max(4, g);
    if (this.elNades.childElementCount !== slots) {
      this.elNades.innerHTML = "";
      for (let i = 0; i < slots; i++)
        this.elNades.appendChild(h("div", "ub-nade", NADE_SVG));
    }
    [...this.elNades.children].forEach((n, i) =>
      n.classList.toggle("empty", i >= g),
    );
    // centre hint
    let hint = "";
    if (!a.reloading) {
      if (mag === 0 && res === 0) hint = "NO AMMO";
      else if (mag === 0 || (low && res > 0)) hint = "RELOAD";
    }
    this._setHint(hint);
  }
  _setHint(t) {
    if (t === this._hint) return;
    this._hint = t;
    if (t) this.elHint.textContent = t;
    this.elHint.classList.toggle("on", !!t);
    this.elHint.classList.toggle("red", t === "NO AMMO");
  }

  setPerks(list = []) {
    const key = list.map((p) => p.id + colorStr(p.color)).join(",");
    if (key === this._perkKey) return;
    this._perkKey = key;
    const had = new Set([...this.elPerks.children].map((e) => e.dataset.id));
    this.elPerks.innerHTML = "";
    list.forEach((p, i) => {
      const c = colorStr(p.color, "#8a2a2a");
      const el = h("div", "ub-perk");
      el.dataset.id = p.id;
      el.title = p.name || p.id;
      if (had.has(p.id)) el.style.animation = "none";
      const gid = `ubcap-${p.id}-${i}`;
      let teeth = "";
      const T = 21;
      for (let k = 0; k < T * 2; k++) {
        const a = (k / (T * 2)) * Math.PI * 2,
          rr = k % 2 ? 17.4 : 19.4;
        teeth += `${k ? "L" : "M"}${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)}`;
      }
      el.innerHTML = `<svg viewBox="-21 -21 42 42"><defs><radialGradient id="${gid}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${shade(c, 0.35)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.55)}"/></radialGradient>
        <linearGradient id="${gid}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e2d0"/><stop offset=".5" stop-color="#8d8778"/><stop offset="1" stop-color="#3a372f"/></linearGradient></defs>
        <path d="${teeth}Z" fill="url(#${gid}r)" stroke="rgba(0,0,0,.6)" stroke-width=".6" stroke-linejoin="round"/>
        <circle r="16" fill="url(#${gid})" stroke="rgba(0,0,0,.45)" stroke-width="1"/>
        <circle r="13.6" fill="none" stroke="rgba(255,245,220,.35)" stroke-width=".9" stroke-dasharray="1.6 1.4"/>
        <g transform="scale(.82)">${PERK_GLYPH[p.id] || `<text x="0" y="6" text-anchor="middle" font-size="16" font-weight="700" fill="#f4ead3">${esc((p.name || p.id || "?")[0].toUpperCase())}</text>`}</g>
        <ellipse cx="-6" cy="-9" rx="7" ry="3.4" fill="rgba(255,255,255,.22)" transform="rotate(-30 -6 -9)"/></svg>`;
      this.elPerks.appendChild(el);
    });
  }

  setPowerups(list = []) {
    const key = list.map((p) => p.type).join(",");
    if (key !== this._puKey) {
      this._puKey = key;
      const had = new Set([...this.elPU.children].map((e) => e.dataset.type));
      this.elPU.innerHTML = "";
      list.forEach((p) => {
        const el = h("div", "ub-pu-i");
        el.dataset.type = p.type;
        if (had.has(p.type)) el.style.animation = "none";
        el.innerHTML = `<div class="ub-pu-ic"><svg viewBox="-20 -20 40 40">${POWERUP_GLYPH[p.type] || '<text x="0" y="7" text-anchor="middle" class="t">?</text>'}</svg></div><div class="ub-pu-t"></div>`;
        this.elPU.appendChild(el);
      });
    }
    [...this.elPU.children].forEach((el, i) => {
      const rem = Math.max(0, list[i].remaining || 0);
      const t = String(Math.ceil(rem));
      const tEl = el.lastChild;
      if (tEl.textContent !== t) tEl.textContent = t;
      el.classList.toggle("blink", rem < 5);
      el.classList.toggle("fast", rem < 2);
    });
  }

  banner(text, sub) {
    const b = this.elBanner;
    b.innerHTML = `<div class="ink"></div><div class="t">${esc(text || "")}</div>${sub ? `<div class="sb">${esc(sub)}</div>` : ""}`;
    b.classList.remove("go");
    void b.offsetWidth;
    b.classList.add("go");
  }

  prompt(text) {
    if (text === this._promptText) return;
    this._promptText = text;
    if (!text) {
      this.elPrompt.classList.remove("on");
      return;
    }
    let html = esc(text)
      .replace(
        /\[(?:Cost|COST):\s*([^\]]+)\]/g,
        '<span class="cost">[Cost: $1]</span>',
      )
      .replace(/\[([A-Za-z0-9]{1,6})\]/g, '<span class="ub-key">$1</span>');
    this.elPrompt.innerHTML = html;
    this.elPrompt.classList.add("on");
  }

  hitmarker(kind = "hit") {
    const e = this.elHit;
    e.classList.remove("pop", "kill", "head");
    void e.offsetWidth;
    if (kind === "kill") e.classList.add("kill");
    if (kind === "head") e.classList.add("kill", "head");
    e.classList.add("pop");
  }

  crosshair(spread = 0, visible = true) {
    const gap = (0.35 + clamp01(spread) * 2.6).toFixed(3);
    const key = gap + visible;
    if (key === this._crossKey) return;
    this._crossKey = key;
    this.elCross.classList.toggle("off", !visible);
    const [t, b, l, r] = this._cl;
    t.style.transform = `translateY(calc(-100% - ${gap}em))`;
    b.style.transform = `translateY(${gap}em)`;
    l.style.transform = `translateX(calc(-100% - ${gap}em))`;
    r.style.transform = `translateX(${gap}em)`;
  }

  damage(amount = 0.3) {
    amount = clamp01(amount);
    const sp = this._tx.splat;
    if (!sp.length) return;
    const lowH = 1 - this._health;
    const count = amount > 0.5 ? 2 : 1;
    for (let c = 0; c < count; c++) {
      const el = h("div", "ub-splat");
      el.style.backgroundImage = `url(${sp[(Math.random() * sp.length) | 0]})`;
      // pick an edge point
      const side = (Math.random() * 4) | 0,
        t = 0.1 + Math.random() * 0.8;
      const [x, y] =
        side === 0
          ? [t * 100, -2]
          : side === 1
            ? [102, t * 100]
            : side === 2
              ? [t * 100, 102]
              : [-2, t * 100];
      const size =
        (38 + Math.random() * 22) * (0.7 + amount * 0.5 + lowH * 0.45);
      el.style.cssText += `left:${x}%;top:${y}%;width:${size}vmin;height:${size}vmin`;
      this.elDmg.appendChild(el);
      const rot = Math.random() * 360,
        op = Math.min(1, 0.5 + amount * 0.5 + lowH * 0.25);
      const hold = 500 + lowH * 900;
      const dur = hold + 2200;
      const a = el.animate(
        [
          {
            opacity: 0,
            transform: `translate(-50%,-50%) rotate(${rot}deg) scale(.7)`,
          },
          {
            opacity: op,
            transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`,
            offset: 80 / dur,
          },
          {
            opacity: op,
            transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1.02)`,
            offset: hold / dur,
          },
          {
            opacity: 0,
            transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1.06)`,
          },
        ],
        { duration: dur, easing: "ease-out", fill: "forwards" },
      );
      a.onfinish = () => el.remove();
    }
    while (this.elDmg.childElementCount > 12) this.elDmg.firstChild.remove();
    this.elFlash.animate([{ opacity: 0.35 + amount * 0.65 }, { opacity: 0 }], {
      duration: 450,
      easing: "ease-out",
    });
  }

  setHealth(frac) {
    frac = clamp01(frac ?? 1);
    if (Math.abs(frac - this._health) < 0.005 && this._healthSet) return;
    this._healthSet = true;
    this._health = frac;
    const d = 1 - frac;
    this.elHurt.style.opacity = (Math.pow(d, 1.25) * 0.95).toFixed(3);
    this.elHurtSp.style.opacity = (
      Math.max(0, (d - 0.35) / 0.65) * 0.85
    ).toFixed(3);
  }

  setDowned(on, progress = 0) {
    this.elDowned.classList.toggle("on", !!on);
    if (on) this.elRing.style.strokeDashoffset = String(clamp01(progress));
  }

  message(text, seconds = 3) {
    const m = this.elMsg;
    clearTimeout(this._msgHide);
    clearTimeout(this._msgType);
    m.classList.remove("done");
    m.innerHTML = '<span class="tag">NOTICE</span><span class="tx"></span>';
    const tx = m.lastChild;
    const str = String(text || "");
    m.classList.add("on");
    let i = 0;
    const step = () => {
      i++;
      tx.textContent = str.slice(0, i);
      if (i < str.length) this._msgType = setTimeout(step, 28);
      else m.classList.add("done");
    };
    this._msgType = setTimeout(step, 120);
    this._msgHide = setTimeout(
      () => m.classList.remove("on"),
      Math.max(1, seconds) * 1000 + str.length * 28,
    );
  }

  // ============================================================ CO-OP (phase 2)
  _learn(name, slot) {
    if (name && slot != null && slot >= 0)
      this._known.set(String(name), slot | 0);
  }

  _buildCoopHud() {
    this.elMarks = h("div", "ub-marks");
    this.elSpec = h(
      "div",
      "ub-spec",
      '<div class="box"><div class="a"></div><div class="b">You will respawn next round</div></div>',
    );
    this.elRevive = h(
      "div",
      "ub-revive",
      `<div class="t">${MEDIC_SVG}<span></span></div><div class="bar"><div class="fill"></div></div>`,
    );
    this.elRevive.querySelector(".ub-medic").style.display = "block";
    this.elFeed = h("div", "ub-feed");
    this.elChat = h("div", "ub-chat");
    this.elChatLog = h("div");
    this.elChatLog.style.cssText =
      "display:flex;flex-direction:column;gap:.18em";
    const cin = h(
      "div",
      "ub-chatin",
      '<span class="lb">SAY</span><input type="text" maxlength="120" autocomplete="off" spellcheck="false"><span class="ct">ENTER send · ESC cancel</span>',
    );
    this.elChatIn = cin.querySelector("input");
    this.elChat.append(this.elChatLog, cin);
    this.elChatIn.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        const txt = this.elChatIn.value
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120);
        this.closeChat();
        if (txt && this.onChatSend) {
          try {
            this.onChatSend(txt);
          } catch (err) {
            console.error(err);
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.closeChat();
      }
    });
    this.elChatIn.addEventListener("keyup", (e) => e.stopPropagation());
    this.elChatIn.addEventListener("blur", () => {
      if (this._chatActive)
        setTimeout(() => {
          if (this._chatActive && document.activeElement !== this.elChatIn)
            this.closeChat();
        }, 60);
    });
    this.elNet = h(
      "div",
      "ub-net",
      '<svg viewBox="-10 -10 20 20" class="ic"><path d="M0 8 V-2 M-3 8 H3"/><circle cx="0" cy="-3" r="1.4" fill="currentColor"/><path d="M-4.5-6.5 A6 6 0 0 0 -4.5 .5 M4.5-6.5 A6 6 0 0 1 4.5 .5"/></svg><span class="bw"></span><span class="tx"></span><span class="wt">UNSTABLE</span>',
    );
    this.elSB = h("div", "ub-sb");
  }

  _buildCoopScreens() {
    // ---------------- co-op sheet (menu -> CO-OP)
    const C = (this.scrCoop = h("div", "ub-screen ub-sheet ub-coop"));
    const paper = h("div", "paper");
    paper.style.clipPath = tornPolygon(113, 1.1);
    paper.innerHTML = `<div class="ub-stamp">SQUAD ORDERS</div><h2>CO-OP</h2><div class="form"><span>FORM 12-C · UP TO 4 SOLDIERS</span><span>ONLINE</span></div>`;
    // name
    const nameRow = h(
      "label",
      "ub-fld",
      '<span class="lb">YOUR CALLSIGN</span><input class="ub-name" type="text" maxlength="16" placeholder="Soldier" autocomplete="off" spellcheck="false"><span class="cnt">0/16</span>',
    );
    const nameIn = (this.elNameIn = nameRow.querySelector("input"));
    const cnt = nameRow.querySelector(".cnt");
    nameRow._input = nameIn;
    nameRow._noClick = true;
    nameIn.addEventListener("input", () => {
      const v = sanitizeName(nameIn.value);
      if (v !== nameIn.value) nameIn.value = v;
      cnt.textContent = `${v.length}/16`;
    });
    nameIn.addEventListener("change", () => this._commitName());
    nameIn.addEventListener("blur", () => this._commitName());
    this._nameCnt = cnt;
    nameRow._act = () => {
      this._commitName();
      this._select(this._navs.coop, 1, true);
    };
    // host
    const host = h(
      "button",
      "ub-big",
      '<span class="l">HOST GAME</span><span class="d">Open a room and invite your squad</span>',
    );
    host.type = "button";
    host.tabIndex = -1;
    host._act = () => {
      const n = this._commitName();
      this._menuCb.onHost && this._menuCb.onHost(n);
    };
    const or = h("div", "ub-or", "OR JOIN A SQUAD");
    // join
    const joinRow = h(
      "div",
      "ub-fld",
      `<span class="lb">ROOM CODE</span><div class="ub-joinrow"><div class="ub-cells">${"<span></span>".repeat(5)}<input type="text" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Room code"></div><button type="button" class="ub-jbtn" tabindex="-1">JOIN →</button></div><div class="note"></div>`,
    );
    const codeIn = (this.elCodeIn = joinRow.querySelector("input"));
    const cells = [...joinRow.querySelectorAll(".ub-cells span")];
    const cellsBox = joinRow.querySelector(".ub-cells");
    const jbtn = joinRow.querySelector(".ub-jbtn");
    const note = joinRow.querySelector(".note");
    joinRow._input = codeIn;
    joinRow._noClick = true;
    const paint = () => {
      const v = codeIn.value;
      const foc = document.activeElement === codeIn;
      cells.forEach((c, i) => {
        c.textContent = v[i] || "";
        c.classList.toggle("cur", foc && i === v.length);
      });
      jbtn.classList.toggle("ready", v.length === 5);
    };
    codeIn.addEventListener("input", () => {
      const v = cleanCode(codeIn.value);
      if (v !== codeIn.value) codeIn.value = v;
      note.textContent = "";
      paint();
    });
    codeIn.addEventListener("paste", (e) => {
      const txt = (e.clipboardData || window.clipboardData)?.getData("text");
      if (txt == null) return;
      e.preventDefault();
      codeIn.value = cleanCode(txt);
      note.textContent = "";
      paint();
      if (codeIn.value.length === 5) this._sound("ui_hover");
    });
    codeIn.addEventListener("focus", paint);
    codeIn.addEventListener("blur", paint);
    const tryJoin = () => {
      const code = codeIn.value;
      if (!CODE_RE.test(code)) {
        note.textContent = code.length
          ? `Room codes are 5 characters — ${5 - code.length} more to go.`
          : "Type the 5-character room code from your host.";
        cellsBox.classList.remove("bad");
        void cellsBox.offsetWidth;
        cellsBox.classList.add("bad");
        codeIn.focus({ preventScroll: true });
        return;
      }
      const n = this._commitName();
      this._menuCb.onJoin && this._menuCb.onJoin(code, n);
    };
    joinRow._act = tryJoin;
    jbtn.addEventListener("click", (e) => {
      e.preventDefault();
      this._sound("ui_click");
      tryJoin();
    });
    this._codePaint = paint;
    this._codeNote = note;
    const hint = h(
      "div",
      "hint",
      "<b>Got an invite link?</b> Just open it — invite links drop you straight into the squad’s lobby.",
    );
    const back = h("button", "back", 'BACK<span class="ub-key">Esc</span>');
    back.type = "button";
    back.tabIndex = -1;
    back._act = () => this.hideCoop();
    paper.append(nameRow, host, or, joinRow, hint, back);
    C.appendChild(paper);
    C.addEventListener("mousedown", (e) => {
      if (e.target === C) {
        this._sound("ui_click");
        this.hideCoop();
      }
    });
    this._makeNav("coop", [nameRow, host, joinRow, back], {
      back: () => this.hideCoop(),
    });

    // ---------------- lobby
    const L = (this.scrLobby = h("div", "ub-screen ub-lobby"));
    L.innerHTML = `<div class="shade"></div><div class="ub-grain"></div><div class="ub-vig"></div>
      <div class="wrap">
        <div class="colL">
          <div class="ub-kicker">CO-OP · SQUAD ASSEMBLY</div>
          <h2>LOBBY</h2>
          <div class="lbl2">ROOM CODE</div>
          <div class="ub-code"></div>
          <div class="ub-url"></div>
          <div class="acts"></div>
          <div class="ub-wait">Waiting for host to start</div>
          <div class="ub-items"></div>
          <div class="ub-lstatus"><i></i><span></span></div>
        </div>
        <div class="colR">
          <div class="ub-roster-h"><span>THE SQUAD</span><span class="cnt">0 / 4</span></div>
          <div class="ub-tags"></div>
        </div>
      </div>`;
    this._lb = {
      code: L.querySelector(".ub-code"),
      url: L.querySelector(".ub-url"),
      acts: L.querySelector(".acts"),
      wait: L.querySelector(".ub-wait"),
      items: L.querySelector(".ub-items"),
      status: L.querySelector(".ub-lstatus span"),
      tags: L.querySelector(".ub-tags"),
      cnt: L.querySelector(".ub-roster-h .cnt"),
    };
    const copy = (this._lbCopy = h(
      "button",
      "ub-copy",
      '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3.5-3.5a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3.5 3.5a4 4 0 0 0 5.7 5.7l1-1"/></svg><span>COPY INVITE LINK</span>',
    ));
    copy.type = "button";
    copy.tabIndex = -1;
    copy._act = () => this._copyInvite();
    this._lb.acts.appendChild(copy);
    this._lbStart = this._item(
      "Start",
      () => this._lobbyCb.onStart && this._lobbyCb.onStart(),
    );
    this._lbLeave = this._item(
      "Leave",
      () => this._lobbyCb.onLeave && this._lobbyCb.onLeave(),
    );
    this._lb.items.append(this._lbStart, this._lbLeave);
    this._lbNavAll = [copy, this._lbStart, this._lbLeave];
    this._makeNav("lobby", this._lbNavAll.slice());
    this._lb.tags.innerHTML = [0, 1, 2, 3]
      .map(() => '<div class="ub-tag empty"></div>')
      .join("");

    // ---------------- connecting
    const K = (this.scrConn = h("div", "ub-screen ub-conn"));
    K.innerHTML = `<div class="ub-grain"></div><div class="box">
      <svg class="radio" viewBox="-40 -40 80 80"><path class="w" d="M-12-18 A22 22 0 0 0 -12 18 M12-18 A22 22 0 0 1 12 18"/><path class="w" d="M-20-27 A34 34 0 0 0 -20 27 M20-27 A34 34 0 0 1 20 27"/><path class="w" d="M-28-35 A46 46 0 0 0 -28 35 M28-35 A46 46 0 0 1 28 35"/>
        <circle class="m" r="5"/><path class="m" d="M-3 4 L-8 30 H8 L3 4Z"/></svg>
      <div class="t"></div>
      <div class="morse">${[1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0].map((d, i) => `<i style="width:${d ? 1.3 : 0.35}em;animation-delay:${(i * 0.2).toFixed(1)}s"></i>`).join("")}</div>
      <div class="ub-items"></div></div>`;
    this._connT = K.querySelector(".t");
    const cancel = this._item("Cancel", () => {
      const cb = this._connCb.onCancel;
      this.hideConnecting();
      cb && cb();
    });
    K.querySelector(".ub-items").appendChild(cancel);
    this._makeNav("conn", [cancel], { back: () => cancel._act() });
    this._connCb = {};

    // ---------------- error telegram
    const E = (this.scrErr = h("div", "ub-screen ub-err"));
    E.innerHTML = `<div class="tg"><div class="hd"><span>SIGNAL CORPS · PRIORITY MESSAGE</span><span class="no"></span></div>
      <div class="ttl"></div><div class="tx"></div>
      <div class="ft"><span>BLACKWALD RELAY STATION</span><button type="button" class="ok" tabindex="-1">OK</button></div></div>`;
    this._err = {
      ttl: E.querySelector(".ttl"),
      tx: E.querySelector(".tx"),
      no: E.querySelector(".no"),
    };
    const ok = E.querySelector(".ok");
    ok._act = () => {
      const cb = this._errCb.onOk;
      this.hideError();
      cb && cb();
    };
    this._makeNav("error", [ok], { back: () => ok._act() });
    this._errCb = {};
  }

  // ---------------- co-op sheet
  _setName(n, fire) {
    const v = sanitizeName(n, true);
    this._name = v;
    if (this.elNameIn) {
      this.elNameIn.value = v;
      this._nameCnt.textContent = `${v.length}/16`;
    }
    if (fire && this._menuCb.onName) {
      try {
        this._menuCb.onName(v);
      } catch (e) {
        console.error(e);
      }
    }
    return v;
  }
  _commitName() {
    let v = sanitizeName(this.elNameIn.value, true);
    if (!v) v = this._name || "Soldier";
    if (v !== this._lastFiredName) {
      this._lastFiredName = v;
      return this._setName(v, true);
    }
    return this._setName(v, false);
  }
  showCoop() {
    this.scrSettings.classList.remove("on");
    this.scrControls.classList.remove("on");
    this._lastFiredName = this._name;
    this._codeNote.textContent = "";
    this._codePaint();
    this.scrCoop.classList.add("on");
    this._select(this._navs.coop, this._name ? 2 : 0, true);
  }
  hideCoop() {
    if (!this.scrCoop.classList.contains("on")) return;
    if (this.root.contains(document.activeElement))
      document.activeElement.blur();
    this.scrCoop.classList.remove("on");
  }
  /** Pre-fill the join code (e.g. from an invite link that failed). */
  setJoinCode(code) {
    this.elCodeIn.value = cleanCode(code);
    this._codePaint();
  }

  // ---------------- lobby
  showLobby(lobby = {}, cb = {}) {
    this._lobbyCb = cb || {};
    this.hideCoop();
    this._lobbyCode = null;
    this._lobbyHost = null;
    this._lobbyKey = null;
    this._lbCopy.classList.remove("done", "fail");
    this._lbCopy.lastChild.textContent = "COPY INVITE LINK";
    this.updateLobby(lobby);
    this.scrLobby.classList.add("on");
    this._select(this._navs.lobby, lobby.isHost ? 1 : 0);
  }
  updateLobby(lobby = {}) {
    const L = this._lb;
    const code = String(lobby.code || "-----").toUpperCase();
    if (code !== this._lobbyCode) {
      this._lobbyCode = code;
      const r = rng(code.charCodeAt(0) * 7 + code.length);
      L.code.innerHTML =
        [...code]
          .map(
            (c, i) =>
              `<span style="--r:${((r() - 0.5) * 5).toFixed(1)}deg;animation-delay:${(i * 0.07).toFixed(2)}s">${esc(c)}</span>`,
          )
          .join("") + '<div class="ub-stamp">INVITE</div>';
    }
    L.url.textContent = lobby.inviteUrl || "";
    const isHost = !!lobby.isHost;
    if (isHost !== this._lobbyHost) {
      this._lobbyHost = isHost;
      this._lbStart.style.display = isHost ? "" : "none";
      L.wait.style.display = isHost ? "none" : "";
      const nav = this._navs.lobby;
      nav.items = isHost
        ? this._lbNavAll.slice()
        : [this._lbCopy, this._lbLeave];
      this._lbStart.classList.remove("is-sel");
      this._select(nav, Math.min(nav.index, nav.items.length - 1));
    }
    const players = (lobby.players || []).slice(0, 4);
    const bySlot = [null, null, null, null];
    players.forEach((p, i) => {
      let s = p.slot != null ? p.slot | 0 : i;
      if (s < 0 || s > 3 || bySlot[s]) s = bySlot.indexOf(null);
      if (s >= 0) bySlot[s] = p;
      this._learn(p.name, s);
    });
    const tags = [...L.tags.children];
    bySlot.forEach((p, s) => {
      const el = tags[s];
      const key = p
        ? `${p.id}|${p.name}|${p.isHost}|${p.isLocal}|${pingQ(p.ping)}|${p.ping == null ? "" : Math.round(p.ping / 5)}`
        : "empty";
      if (el.dataset.key === key) return;
      const wasEmpty = el.dataset.key === "empty" || !el.dataset.key;
      el.dataset.key = key;
      if (!p) {
        el.className = "ub-tag empty";
        el.style.removeProperty("--c");
        el.innerHTML = `<div class="who"><div class="nm">Awaiting soldier…</div><div class="sub">SLOT ${s + 1} · OPEN</div></div>`;
        return;
      }
      el.className = "ub-tag";
      if (!wasEmpty) el.style.animation = "none";
      else el.style.animation = "";
      el.style.setProperty("--c", slotColor(s));
      const ping =
        (p.isHost || p.isLocal) && p.ping == null
          ? ""
          : `${barsHTML(p.ping)}<span>${p.ping == null ? "—" : Math.round(p.ping) + " ms"}</span>`;
      el.innerHTML = `<div class="who"><div class="nm">${esc(p.name || "Soldier")}${p.isLocal ? '<span class="you">YOU</span>' : ""}</div><div class="sub">${esc(SLOT_CHAR[s].toUpperCase())} · SLOT ${s + 1}</div></div>
        ${p.isHost ? '<div class="host">HOST</div>' : ""}<div class="pg">${ping}</div>`;
    });
    const n = bySlot.filter(Boolean).length;
    L.cnt.textContent = `${n} / 4`;
    L.status.textContent =
      lobby.status ||
      (n >= 4
        ? "Squad full — ready to deploy."
        : isHost
          ? `${n} of 4 soldiers assembled · share the invite link`
          : `${n} of 4 soldiers assembled`);
  }
  hideLobby() {
    this.scrLobby.classList.remove("on");
  }
  _copyInvite() {
    const b = this._lbCopy,
      lbl = b.lastChild;
    const done = (ok) => {
      b.classList.toggle("done", ok);
      b.classList.toggle("fail", !ok);
      lbl.textContent = ok ? "COPIED ✓" : "COPY FAILED — USE THE LINK BELOW";
      clearTimeout(this._copyT);
      this._copyT = setTimeout(() => {
        b.classList.remove("done", "fail");
        lbl.textContent = "COPY INVITE LINK";
      }, 1900);
    };
    let r;
    try {
      r = this._lobbyCb.onCopyInvite ? this._lobbyCb.onCopyInvite() : undefined;
    } catch (e) {
      done(false);
      return;
    }
    if (r && typeof r.then === "function")
      r.then(
        (v) => done(v !== false),
        () => done(false),
      );
    else done(r !== false);
  }

  // ---------------- connecting / error
  showConnecting(text = "Contacting squad", cb = {}) {
    this._connCb = cb || {};
    this._connT.textContent = String(text).replace(/[.…]+$/, "");
    this.scrConn.classList.add("on");
    this._select(this._navs.conn, 0);
  }
  hideConnecting() {
    this.scrConn.classList.remove("on");
  }
  showError(title = "SIGNAL LOST", text = "", cb = {}) {
    this._errCb = cb || {};
    this.hideConnecting();
    this._err.ttl.textContent = String(title).toUpperCase();
    const body = esc(String(text || "").trim());
    this._err.tx.innerHTML = body.replace(
      /([.!?])(\s+|$)/g,
      '$1 <span class="stop">STOP</span> ',
    );
    this._err.no.textContent = `No. ${String(1000 + (((Date.now() / 1000) | 0) % 9000))}`;
    this.scrErr.classList.remove("on");
    void this.scrErr.offsetWidth;
    this.scrErr.classList.add("on");
    this._select(this._navs.error, 0);
    this._sound("ui_click");
  }
  hideError() {
    this.scrErr.classList.remove("on");
  }

  // ---------------- in-game team
  setLocalSlot(slot) {
    this._localSlot = slot == null ? null : slot | 0;
    if (this._localSlot == null) {
      this.elPoints.style.color = "";
      this.elPoints.classList.remove("slot");
    } else {
      this.elPoints.style.color = slotColor(this._localSlot);
      this.elPoints.classList.add("slot");
    }
  }

  setTeamPoints(rows = []) {
    const seen = new Set();
    const others = [];
    for (const r of rows) {
      this._learn(r.name, r.slot);
      if (r.isLocal) {
        this.elPW.classList.toggle("down", !!r.downed);
        if (r.points != null) this.setPoints(r.points);
        if (r.slot != null && r.slot !== this._localSlot)
          this.setLocalSlot(r.slot);
        continue;
      }
      others.push(r);
    }
    others.sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9));
    others.forEach((r) => {
      const id = String(r.id ?? r.name);
      seen.add(id);
      let el = this._team.get(id);
      if (!el) {
        el = h(
          "div",
          "ub-tm",
          `${MEDIC_SVG}<span class="nm"></span><span class="pt"></span>`,
        );
        el._nm = el.querySelector(".nm");
        el._pt = el.querySelector(".pt");
        this._team.set(id, el);
      }
      if (el._gone) {
        clearTimeout(el._gone);
        el._gone = null;
        el.classList.remove("gone");
      }
      const c = slotColor(r.slot);
      if (el._c !== c) {
        el._c = c;
        el.style.setProperty("--c", c);
      }
      const nm = r.name || "Soldier";
      if (el._nm.textContent !== nm) el._nm.textContent = nm;
      const pt = String(Math.round(r.points || 0));
      if (el._pt.textContent !== pt) el._pt.textContent = pt;
      el.classList.toggle("down", !!r.downed && !r.disconnected);
      el.classList.toggle("dc", !!r.disconnected);
      this.elTeam.appendChild(el); // keeps order (append moves existing nodes)
    });
    for (const [id, el] of this._team) {
      if (seen.has(id) || el._gone) continue;
      el.classList.add("gone");
      el._gone = setTimeout(() => {
        el.remove();
        this._team.delete(id);
      }, 650);
    }
  }

  showScoreboard(rows) {
    if (!rows) {
      this.elSB.classList.remove("on");
      this._sbKey = null;
      return;
    }
    const key = JSON.stringify(rows) + this._round;
    if (key !== this._sbKey) {
      this._sbKey = key;
      const sorted = rows
        .slice()
        .sort((a, b) => (b.points || 0) - (a.points || 0));
      const head = `<div class="r h"><span></span><span>SOLDIER</span><span class="n">POINTS</span><span class="n">KILLS</span><span class="n">HEADS</span><span class="n">REVIVES</span><span class="n">DOWNS</span><span class="n">PING</span></div>`;
      const body = sorted
        .map((r) => {
          this._learn(r.name, r.slot);
          const s = r.slot ?? 0;
          return `<div class="r${r.isLocal ? " me" : ""}" style="--c:${slotColor(s)}"><span class="tab"></span>
          <span class="nm">${esc(r.name || "Soldier")}${r.downed ? '<span class="dn">DOWN</span>' : ""}${r.disconnected ? '<span class="dn">LOST</span>' : ""}<small>${esc(SLOT_CHAR[s] ? SLOT_CHAR[s].toUpperCase() : "")}${r.isHost ? " · HOST" : ""}</small></span>
          <span class="n pts">${Math.round(r.points || 0)}</span><span class="n">${r.kills ?? 0}</span><span class="n">${r.headshots ?? 0}</span><span class="n">${r.revives ?? 0}</span><span class="n">${r.downs ?? 0}</span>
          <span class="ping">${r.ping == null ? (r.isHost ? "HOST" : "—") : `${barsHTML(r.ping)} ${Math.round(r.ping)}`}</span></div>`;
        })
        .join("");
      this.elSB.innerHTML = `<div class="ub-stamp">FIELD REPORT</div><div class="hd"><h3>SQUAD STATUS</h3><div class="meta">BLACKWALD BUNKER<br>ROUND ${this._round || 1} · ${rows.length} OF 4 SOLDIERS</div></div>${head}${body}
        <div class="foot"><span>FORM 20-A · CASUALTY &amp; ENGAGEMENT REPORT</span><span>HOLD TAB</span></div>`;
    }
    this.elSB.classList.add("on");
  }

  setMarkers(list = []) {
    const W = this.root.clientWidth || innerWidth,
      H = this.root.clientHeight || innerHeight;
    const seen = new Set();
    for (const m of list) {
      const id = String(m.id ?? m.name);
      seen.add(id);
      let el = this._marks.get(id);
      if (!el) {
        el = h(
          "div",
          "ub-mk",
          `<div class="plate"><span class="nm"></span><i class="chev"></i></div>
          <div class="dn"><svg viewBox="-24 -24 48 48"><circle r="19" class="bg"/><circle r="19" class="ring" pathLength="1"/><path class="cross" d="M-3-10h6v7h7v6h-7v7h-6v-7h-7v-6h7z"/></svg><div class="dl"><span class="who"></span> <span class="ds"></span></div></div>
          <div class="arr"><i></i></div>`,
        );
        el._nm = el.querySelector(".plate .nm");
        el._ring = el.querySelector(".ring");
        el._who = el.querySelector(".who");
        el._ds = el.querySelector(".ds");
        el._arr = el.querySelector(".arr");
        el._plate = el.querySelector(".plate");
        this.elMarks.appendChild(el);
        this._marks.set(id, el);
      }
      this._learn(m.name, m.slot);
      const c = slotColor(m.slot);
      if (el._c !== c) {
        el._c = c;
        el.style.setProperty("--c", c);
      }
      const nm = (m.name || "").toUpperCase();
      if (el._nm.textContent !== nm) {
        el._nm.textContent = nm;
        el._who.textContent = nm;
      }
      const down = !!m.downed;
      el.classList.toggle("down", down);
      el.classList.toggle("rev", down && !!m.beingRevived);
      const dist = m.dist != null && isFinite(m.dist) ? m.dist : null;
      if (down) {
        el._ring.style.strokeDashoffset = String(clamp01(m.bleed ?? 0));
        const ds = m.beingRevived
          ? "REVIVING"
          : dist != null
            ? `${Math.round(dist)}M`
            : "DOWN";
        if (el._ds.textContent !== ds) el._ds.textContent = ds;
      }
      let px = +m.x,
        py = +m.y;
      const finite = isFinite(px) && isFinite(py);
      if (finite && Math.abs(px) <= 2 && Math.abs(py) <= 2) {
        px *= W;
        py *= H;
      }
      const on =
        m.onScreen !== false &&
        finite &&
        px >= 0 &&
        py >= 0 &&
        px <= W &&
        py <= H;
      if (on) {
        el.classList.remove("edge");
        el.style.display = "";
        el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px)`;
        if (!down) {
          const o =
            dist == null
              ? 1
              : dist < 10
                ? 1
                : Math.max(0.3, 1 - (dist - 10) / 40);
          const sc = dist == null ? 1 : Math.max(0.72, 1 - dist / 90);
          el._plate.style.opacity = o.toFixed(2);
          el._plate.style.transform = `translate(-50%,-100%) scale(${sc.toFixed(3)})`;
        }
      } else if (down) {
        // off-screen: pin to the screen edge, arrow points toward the teammate
        let dx, dy;
        if (typeof m.angle === "number" && isFinite(m.angle)) {
          dx = Math.sin(m.angle);
          dy = -Math.cos(m.angle);
        } else if (finite) {
          dx = px - W / 2;
          dy = py - H / 2;
        } else {
          dx = 0;
          dy = 1;
        }
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        // keep clear of the corner HUD clusters: larger bottom margin
        const mx = Math.max(70, W * 0.1),
          mt = Math.max(60, H * 0.12),
          mb = Math.max(110, H * 0.24);
        const t = Math.min(
          (W / 2 - mx) / Math.max(1e-4, Math.abs(dx)),
          (H / 2 - (dy > 0 ? mb : mt)) / Math.max(1e-4, Math.abs(dy)),
        );
        const ex = W / 2 + dx * t,
          ey = H / 2 + dy * t;
        el.classList.add("edge");
        el.classList.toggle("lab-up", dy > 0.35);
        el.style.display = "";
        el.style.transform = `translate(${ex.toFixed(1)}px,${ey.toFixed(1)}px)`;
        el._arr.style.transform = `rotate(${((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1)}deg)`;
      } else {
        el.style.display = "none";
      }
    }
    for (const [id, el] of this._marks)
      if (!seen.has(id)) {
        el.remove();
        this._marks.delete(id);
      }
  }

  reviveProgress(frac, text) {
    const r = this.elRevive;
    if (frac == null || frac === false) {
      r.classList.remove("on");
      return;
    }
    r.classList.add("on");
    if (text != null && text !== this._revText) {
      this._revText = text;
      r.querySelector(".t span").innerHTML = this._colorNames(esc(text));
    }
    r.querySelector(".fill").style.width =
      `${(clamp01(frac) * 100).toFixed(1)}%`;
  }

  _colorNames(html) {
    const names = [...this._known.keys()]
      .filter((n) => n.length > 1)
      .sort((a, b) => b.length - a.length);
    if (!names.length) return html;
    const marks = [];
    for (const n of names) {
      const re = new RegExp(
        `(?<![\\p{L}\\p{N}])${reEsc(esc(n))}(?![\\p{L}\\p{N}])`,
        "gu",
      );
      html = html.replace(re, (m0) => {
        marks.push(
          `<b style="color:${slotColor(this._known.get(n))}">${m0}</b>`,
        );
        return `\u0000${marks.length - 1}\u0000`;
      });
    }
    return html.replace(/\u0000(\d+)\u0000/g, (_, i) => marks[+i]);
  }

  feed(text, slot) {
    const el = h("div", "ub-fd");
    if (slot != null && slot >= 0) el.style.setProperty("--c", slotColor(slot));
    el.innerHTML = this._colorNames(esc(text || ""));
    this.elFeed.appendChild(el);
    while (this.elFeed.childElementCount > 5) this.elFeed.firstChild.remove();
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 650);
    }, 6000);
  }

  chat(name, slot, text) {
    this._learn(name, slot);
    const el = h("div", "ub-cl" + (name ? "" : " sys"));
    el.style.setProperty("--c", slotColor(slot));
    el.innerHTML = `${name ? `<span class="n">${esc(name)}</span>` : ""}${esc(String(text || "").slice(0, 200))}`;
    this.elChatLog.appendChild(el);
    while (this.elChatLog.childElementCount > 6)
      this.elChatLog.firstChild.remove();
    setTimeout(() => el.classList.add("old"), 8000);
  }
  openChat() {
    if (this._chatActive) return;
    this._chatActive = true;
    this.elChatIn.value = "";
    this.elChat.classList.add("open");
    // focus on the next task so the key that opened chat (T) is not typed into the field
    setTimeout(() => {
      if (this._chatActive) this.elChatIn.focus({ preventScroll: true });
    }, 0);
  }
  closeChat() {
    if (!this._chatActive) return;
    this._chatActive = false;
    this.elChat.classList.remove("open");
    if (document.activeElement === this.elChatIn) this.elChatIn.blur();
  }
  get chatActive() {
    return this._chatActive;
  }

  setNetStatus(st) {
    const n = this.elNet;
    if (!st) {
      n.classList.remove("on");
      this._netKey = null;
      return;
    }
    const ping = st.ping == null ? null : Math.round(st.ping);
    let loss = st.loss || 0;
    if (loss > 1) loss /= 100;
    const key = `${ping}|${Math.round(loss * 100)}|${!!st.warn}`;
    n.classList.add("on");
    if (key === this._netKey) return;
    this._netKey = key;
    n.classList.toggle("warn", !!st.warn);
    n.querySelector(".bw").innerHTML = barsHTML(ping);
    n.querySelector(".tx").textContent =
      `${ping == null ? "—" : ping + " ms"}${loss >= 0.02 ? ` · ${Math.round(loss * 100)}% loss` : ""}`;
  }

  setSpectating(name) {
    const s = this.elSpec;
    if (!name) {
      s.classList.remove("on");
      return;
    }
    const slot = this._known.get(String(name));
    s.style.setProperty("--c", slot != null ? slotColor(slot) : "var(--bone)");
    s.querySelector(".a").innerHTML =
      `<span class="rec"></span>SPECTATING <b>${esc(String(name).toUpperCase())}</b>`;
    s.classList.add("on");
  }

  update(dt) {
    /* all HUD animation is CSS / WAAPI driven; kept for interface compatibility */ this._t =
      (this._t || 0) + (dt || 0);
  }

  destroy() {
    window.removeEventListener("keydown", this._onKey, true);
    this._goClear();
    clearInterval(this._flavInt);
    this.root.remove();
  }
}

