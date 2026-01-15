    // ============================================================
    // App bootstrap (no behavior changes; comments for clarity)
    // ============================================================

    // ============================================================
    // ✅ REAL "never updates" fix:
    // Purge any cached SW assets once per client, then reload.
    // ============================================================
    (async function purgePwaCachesOnce(){
      const KEY = "based_pwa_cache_purged_v3";
      try{
        if(localStorage.getItem(KEY) === "1") return;

        if("caches" in window){
          try{
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }catch(e){}
        }

        if("serviceWorker" in navigator){
          try{
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all((regs||[]).map(r => r.unregister().catch(()=>{})));
          }catch(e){}
        }

        localStorage.setItem(KEY, "1");
        location.reload();
      }catch(e){}
    })();

    // =========================
    // Core helpers
    // =========================
    // PWA detection (standalone display / iOS flag)
    function isPwaInstalled(){
      const standaloneDisplay = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
      const iosStandalone = (typeof navigator !== "undefined") && ("standalone" in navigator) && navigator.standalone;
      return !!(standaloneDisplay || iosStandalone);
    }

    // Pull-to-refresh (PWA + touch-only)
    function initPullToRefresh(){
      if(!("ontouchstart" in window)) return;
      if(!isPwaInstalled()) return;

      const pullEl = document.getElementById("pull-refresh");
      if(!pullEl) return;

      const PULL_MAX = 120;
      const PULL_TRIGGER = 80;
      let startY = null;
      let pulling = false;
      let currentPull = 0;
      let isRefreshing = false;

      function setPullDistance(px){
        const clamped = Math.max(0, Math.min(PULL_MAX, px));
        currentPull = clamped;
        const offset = clamped - PULL_MAX;
        pullEl.style.transform = `translateY(${offset}px)`;
      }

      function resetPull(){
        pullEl.classList.remove("is-pulling");
        setPullDistance(0);
        startY = null;
        pulling = false;
      }

      function startRefresh(){
        isRefreshing = true;
        pullEl.classList.remove("is-pulling");
        pullEl.classList.add("is-refreshing");
        pullEl.style.transform = "translateY(0)";
        setTimeout(() => {
          location.reload();
        }, 150);
      }

      document.addEventListener("touchstart", (event) => {
        if(isRefreshing) return;
        if(event.touches.length !== 1) return;
        if(window.scrollY > 0) return;
        const target = event.target;
        if(target && target.closest && target.closest("input, textarea, select, button")) return;
        startY = event.touches[0].clientY;
        pulling = true;
        pullEl.classList.add("is-pulling");
      }, {passive: true});

      document.addEventListener("touchmove", (event) => {
        if(!pulling || startY === null) return;
        if(window.scrollY > 0) return;
        const dy = event.touches[0].clientY - startY;
        if(dy <= 0){
          setPullDistance(0);
          return;
        }
        event.preventDefault();
        const eased = dy * 0.65;
        setPullDistance(eased);
      }, {passive: false});

      document.addEventListener("touchend", () => {
        if(!pulling) return;
        if(currentPull >= PULL_TRIGGER && !isRefreshing){
          startRefresh();
          return;
        }
        resetPull();
      });
    }

    // Normalize hash routes to known app routes
    function normalizeRoute(hash){
      const raw = (hash || "").replace(/^#\/?/, "").trim().toLowerCase();
      if(!raw || raw === "index.html") return "home";
      if(raw === "home") return "home";
      if(raw === "cwl") return "cwl";
      if(raw === "war") return "war";
      if(raw === "my-stats" || raw === "mystats") return "mystats";
      if(raw === "more") return "more";
      return "home";
    }

    // Apply active state to nav + tabbar links
    function setActiveNav(route){
      document.querySelectorAll("[data-route]").forEach(a => {
        a.classList.toggle("active", (a.getAttribute("data-route") || "") === route);
      });
    }

    // Tab bar icon preloading (keeps icon swaps snappy)
    const ICON_VER = "v1";
    const ICON_FILES = [
      "./images/home-active.png","./images/home-inactive.png",
      "./images/cwl-active.png","./images/cwl-inactive.png",
      "./images/war-active.png","./images/war-inactive.png",
      "./images/my-stats-active.png","./images/my-stats-inactive.png",
      "./images/more-active.png","./images/more-inactive.png"
    ];
    (function preloadTabIcons(){
      ICON_FILES.forEach(src => { const i = new Image(); i.src = `${src}?v=${ICON_VER}`; });
    })();

    // Swap tabbar icons based on active route (PWA only)
    function applyPwaImageIconStates(route){
      if(!isPwaInstalled()) return;
      const tabbar = document.getElementById("pwaTabbar");
      if(!tabbar) return;

      tabbar.querySelectorAll("a[data-img-key]").forEach(a => {
        const key = a.getAttribute("data-img-key");
        const img = a.querySelector(".icon img");
        if(!key || !img) return;

        const isActive = (a.getAttribute("data-route") === route);
        const file = isActive ? `./images/${key}-active.png` : `./images/${key}-inactive.png`;

        img.src = `${file}?v=${ICON_VER}`;
        img.loading = "eager";
        img.decoding = "async";
      });
    }

    // =========================
    // PWA tabbar hide-on-scroll
    // =========================
    // Throttled on scroll to avoid jank.
    let _pwaScrollBound = false;
    let _lastScrollY = 0;
    let _rafPending = false;

    // Cross-browser scrollTop helper
    function getScrollTop(){
      const se = document.scrollingElement || document.documentElement;
      return (typeof window.scrollY === "number") ? window.scrollY : (se ? se.scrollTop : 0);
    }

    function showPwaTabbar(){
      const tabbar = document.getElementById("pwaTabbar");
      if(tabbar) tabbar.classList.remove("is-hidden");
    }

    function hidePwaTabbar(){
      const tabbar = document.getElementById("pwaTabbar");
      if(tabbar) tabbar.classList.add("is-hidden");
    }

    // Attach the auto-hide scroll listener (PWA only)
    function bindPwaTabbarAutoHide(){
      if(_pwaScrollBound) return;
      if(!isPwaInstalled()) return;

      const tabbar = document.getElementById("pwaTabbar");
      if(!tabbar || getComputedStyle(tabbar).display === "none") return;

      _pwaScrollBound = true;
      _lastScrollY = getScrollTop();
      showPwaTabbar();

      const onScroll = () => {
        if(_rafPending) return;
        _rafPending = true;

        requestAnimationFrame(() => {
          _rafPending = false;

          const y = getScrollTop();
          const dy = y - _lastScrollY;

          if(Math.abs(dy) < 6){
            _lastScrollY = y;
            return;
          }

          if(y <= 8){
            showPwaTabbar();
            _lastScrollY = y;
            return;
          }

          if(dy > 0) hidePwaTabbar();
          else showPwaTabbar();

          _lastScrollY = y;
        });
      };

      window.__pwaTabbarScrollHandler = onScroll;
      window.addEventListener("scroll", onScroll, { passive:true });
    }

    // Remove the auto-hide scroll listener
    function unbindPwaTabbarAutoHide(){
      const fn = window.__pwaTabbarScrollHandler;
      if(fn){
        window.removeEventListener("scroll", fn);
        window.__pwaTabbarScrollHandler = null;
      }
      _pwaScrollBound = false;
      _rafPending = false;
    }

    // =========================
    // Drag-to-scroll for any .dragscroll
    // =========================
    // Enables desktop click/drag scrolling for wide tables.
    function enableDragScroll(el){
      if(!el || el.dataset.dragscroll === "1") return;
      el.dataset.dragscroll = "1";

      let isDown = false;
      let startX = 0;
      let startLeft = 0;
      let moved = false;

      const onDown = (e) => {
        if(e.button !== 0) return;
        isDown = true;
        moved = false;
        startX = e.pageX;
        startLeft = el.scrollLeft;
        el.classList.add("is-dragging");
        e.preventDefault();
      };

      const onMove = (e) => {
        if(!isDown) return;
        const dx = e.pageX - startX;
        if(Math.abs(dx) > 3) moved = true;
        el.scrollLeft = startLeft - dx;
      };

      const onUp = () => {
        if(!isDown) return;
        isDown = false;
        el.classList.remove("is-dragging");
      };

      const onClickCapture = (e) => {
        if(moved){
          e.preventDefault();
          e.stopPropagation();
          moved = false;
        }
      };

      el.addEventListener("mousedown", onDown);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      el.addEventListener("mouseleave", onUp);
      el.addEventListener("click", onClickCapture, true);
    }

    // Scan and enable drag-scroll behavior on all matching elements
    function enableDragScrollEverywhere(){
      document.querySelectorAll(".dragscroll").forEach(enableDragScroll);
    }

    // Show/hide scroll hint when a container actually overflows
    function setScrollHintIfScrollable(wrapId, hintId){
      const wrap = document.getElementById(wrapId);
      const hint = document.getElementById(hintId);
      if(!wrap || !hint) return;
    
      const isScrollable = wrap.scrollWidth > (wrap.clientWidth + 2);
      hint.style.display = isScrollable ? "flex" : "none";
    }

    // Measure sticky columns and set CSS variables for accurate offsets
    function updateStickyOffsets(){
      const membersTable = document.querySelector(".members-table");
      if(membersTable){
        const firstHeader = membersTable.querySelector("thead th:nth-child(1)");
        if(firstHeader){
          const width = firstHeader.getBoundingClientRect().width;
          if(width) membersTable.style.setProperty("--members-sticky-1", `${width}px`);
        }
      }

      document.querySelectorAll(".cwl-table").forEach((table) => {
        const stickyCandidates = table.querySelectorAll("thead th.sticky-1, tbody td.sticky-1");
        if(!stickyCandidates.length) return;

        let width = 0;
        stickyCandidates.forEach((cell) => {
          if(width) return;
          const cellWidth = cell.getBoundingClientRect().width;
          if(cellWidth > 0) width = cellWidth;
        });

        const minWidth = (table.id === "cwl-member-table") ? 22 : 0;
        const finalWidth = Math.max(width || 0, minWidth);
        if(finalWidth) table.style.setProperty("--cwl-sticky-1", `${finalWidth}px`);
      });
    }

    // Toggle top nav vs. PWA tabbar based on install state
    function setupNavUI(){
      const pwa = isPwaInstalled();
      const topNav = document.getElementById("topNav");
      const tabbar = document.getElementById("pwaTabbar");

      if(pwa){
        if(topNav) topNav.style.display = "none";
        if(tabbar) tabbar.style.display = "block";
        document.body.classList.add("has-pwa-tabs");

        unbindPwaTabbarAutoHide();
        bindPwaTabbarAutoHide();
      } else {
        if(topNav) topNav.style.display = "flex";
        if(tabbar) tabbar.style.display = "none";
        document.body.classList.remove("has-pwa-tabs");
        unbindPwaTabbarAutoHide();
      }
    }

    // Basic HTML-escape for injected strings
    function escapeHtml(s){
      return String(s || "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#39;");
    }
    function setText(id, text){ const el = document.getElementById(id); if(el) el.textContent = text; }
    function setTextAny(ids, text){
      for(const id of ids){
        const el = document.getElementById(id);
        if(el){ el.textContent = text; return true; }
      }
      return false;
    }

    // =========================
    // Templates
    // =========================
    // Render functions return HTML strings for the route content.
    const app = document.getElementById("app");

    function pageShellCards(title, subtitle){
      return `<div class="cards"><main class="page"><h1>${title}</h1><p>${subtitle}</p></main></div>`;
    }

    function renderMore(){
      return `
        <div class="cards">
          <h2 class="cards-title">In-Game Events</h2>

          <div class="row"><span class="row-label">Raid Weekend</span><span id="raid-timer" class="row-value">—</span></div>
          <div class="row"><span class="row-label">Clan Games</span><span id="clan-games-timer" class="row-value">—</span></div>
          <div class="row"><span class="row-label">Season End</span><span id="season-end-timer" class="row-value">—</span></div>
          <div class="row"><span class="row-label">League Reset</span><span id="league-reset-timer" class="row-value">—</span></div>

          <div class="divider"></div>

          <div class="links">
            <a class="link-btn" href="changelog.html" target="_blank" rel="noopener noreferrer">Changelog</a>
            <a class="link-btn" href="https://discord.gg/8P96687dPr" target="_blank" rel="noopener noreferrer">Clan Discord</a>
            <a class="link-btn" href="https://link.clashofclans.com/en/?action=OpenClanProfile&tag=2QQYJC08Y" target="_blank" rel="noopener noreferrer">Visit B•A•S•E•D</a>
            <a class="link-btn" href="https://www.clashofstats.com/clans/based-2QQYJC08Y/summary" target="_blank" rel="noopener noreferrer">Clan Stats</a>
            <a class="link-btn" href="https://store.supercell.com/" target="_blank" rel="noopener noreferrer">SuperCell Store</a>
            <a class="link-btn install-btn" href="https://www.youtube.com/watch?v=gIC30U39zpA" target="_blank" rel="noopener noreferrer">How to install B•A•S•E•D App</a>
          </div>

          <div class="page-footer">EST DECEMBER 2023</div>
        </div>
      `;
    }

    function renderHome(){
      return `
        <div class="cards">
          <h2 class="cards-title">Clan Overview</h2>

          <div id="rankings-block">
            <div class="section-title">Rankings</div>
            <div class="row"><span class="row-label">Global Trophies</span><span id="rank-global-trophies" class="row-value">Loading…</span></div>
            <div class="row"><span class="row-label">USA Trophies</span><span id="rank-usa-trophies" class="row-value">Loading…</span></div>
            <div class="divider"></div>
          </div>

          <div id="clan-desc" class="clan-desc-block">Loading…</div>
          <div class="divider"></div>

          <div class="row"><span class="row-label">CWL League</span><span id="cwl-league" class="row-value">Loading…</span></div>
          <div class="row"><span class="row-label">Last CWL Finish</span><span id="cwl-finish" class="row-value">Loading…</span></div>

          <div class="row"><span class="row-label">War Record</span><span id="home-war-record" class="row-value">Loading…</span></div>
          <div class="row"><span class="row-label">Last 10 Wars</span><span id="home-war-last10" class="row-value">Loading…</span></div>
          <div class="row"><span class="row-label">Current Streak</span><span id="home-war-streak" class="row-value">Loading…</span></div>
          <div class="row"><span class="row-label">Longest Streak</span><span id="home-war-longest" class="row-value">Loading…</span></div>

          <div class="row"><span class="row-label">Capital Hall Level</span><span id="capital-hall-level" class="row-value">Loading…</span></div>

          <div class="divider"></div>

          <h2 class="cards-title" style="margin: 2px 0 10px;">Members</h2>

          <div class="members-headerbar" aria-label="Members header controls">
            <div class="members-leaderline">
              <div class="members-keyline">
                <span class="key-emoji">&nbsp;&nbsp;👑</span>
                <span class="key-text"><span class="legend-underline">Leader</span> / Co</span>
              </div>
            </div>

            <div class="members-elderline">
              <div class="members-keyline">
                <span class="key-emoji">&nbsp;&nbsp;🛡️</span>
                <span class="key-text">Elder</span>
              </div>
            </div>

            <div class="members-scroll-inline">← SCROLL →</div>

            <div class="members-sortbtn-wrap">
              <div class="sort-btn">
                <span class="sort-btn-label" id="membersSortLabel">Role</span>
                <select id="membersSortSelect" aria-label="Sort members">
                  <option value="role">Role</option>
                  <option value="th">TH</option>
                  <option value="trophies">Trophies</option>
                  <option value="warStars">War Stars</option>
                  <option value="xp">XP</option>
                  <option value="donated">Donated</option>
                  <option value="received">Received</option>
                </select>
              </div>
            </div>
          </div>

          <div class="members-wrap dragscroll" aria-label="Clan members list">
            <table class="members-table">
              <colgroup>
                <col style="width: var(--m-emoji-col);">
                <col style="width: var(--m-name-col);">
                <col style="width: 44px;">
                <col style="width: 84px;">
                <col style="width: 98px;">
                <col style="width: 58px;">
                <col style="width: 86px;">
                <col style="width: 96px;">
              </colgroup>

              <thead>
                <tr>
                  <th class="m-emoji" style="text-align:right;"></th>
                  <th style="text-align:left;"></th>
                  <th class="m-num">TH</th>
                  <th class="m-num">Trophies</th>
                  <th class="m-num">War Stars</th>
                  <th class="m-num">XP</th>
                  <th class="m-num">Donated</th>
                  <th class="m-num">Received</th>
                </tr>
              </thead>

              <tbody id="members-body">
                <tr><td colspan="8" style="opacity:.75;">Loading…</td></tr>
              </tbody>
            </table>
          </div>

          <div id="clan-fetch-status" class="tiny-status">Clan stats fetch: —</div>
          <div id="members-fetch-status" class="tiny-status">Members fetch: —</div>
        </div>
      `;
    }

    function renderCwlPage(){
      return `
        <div class="cards">
          <div class="cwl-titlebar">
            <div class="cwl-title-dd" aria-label="Select CWL season">
              <span id="cwl-title-text">CWL</span>
              <span class="caret" aria-hidden="true">▼</span>
    
              <select id="cwlSeasonSelect" aria-label="Select CWL season"></select>
            </div>
          </div>
    
          <div id="cwl-league-name" class="cwl-league-under-title">Loading…</div>
    
          <div class="divider"></div>
    
          <!-- ✅ WRAPPER: we can hide this entire section in Year/All-Time mode -->
          <div id="cwl-league-section">
            <div class="section-title">League Overview</div>
    
            <!-- ✅ only shown when the table is actually scrollable -->
            <div class="cwl-subheaderbar" style="margin:0 0 8px;" aria-label="CWL league overview header">
              <div></div>
              <div class="cwl-scroll-inline" id="cwl-league-scroll-inline">← SCROLL →</div>
              <div></div>
            </div>
    
            <div class="cwl-table-wrap dragscroll" id="cwl-league-wrap" aria-label="CWL league overview">
              <table class="cwl-table cwl-league">
                <colgroup>
                  <col style="width:52px;">    <!-- Rank -->
                  <col style="width:96px;">    <!-- Clan (was 240px) -->
                  <col style="width:64px;">    <!-- Wins -->
                  <col style="width:60px;">    <!-- total stars -->
                  <col style="width:52px;">    <!-- % (total) -->
                  <col style="width:78px;">    <!-- AVG ⭐ -->
                  <col style="width:66px;">    <!-- AVG % (NEW) -->
                  <col style="width:84px;">    <!-- AVG 🛡️ -->
                </colgroup>
    
                <thead>
                  <tr>
                    <th class="sticky-1">Rank</th>
                    <th class="sticky-2 left">Clan</th>
                    <th>Wins</th>
                    <th>⭐</th>
                    <th>%</th>
                    <th>AVG ⭐</th>
                    <th>AVG %</th>
                    <th>AVG 🛡️</th>
                  </tr>
                </thead>
    
                <tbody id="cwl-leagueoverview-body">
                  <tr><td colspan="8" style="opacity:.75; text-align:center; padding:12px;">Loading…</td></tr>
                </tbody>
              </table>
            </div>
    
            <div class="divider"></div>
          </div>
    
          <!-- ✅ WRAPPER: we can hide this entire section in Year/All-Time mode -->
          <div id="cwl-rounds-section">
            <div class="section-title">Rounds</div>
    
            <div id="cwl-rounds-mount" class="rounds-wrap" aria-label="CWL rounds overview">
              <div style="opacity:.75; text-align:center; padding:12px;">Loading…</div>
            </div>
    
            <div class="divider"></div>
          </div>
    
          <div class="section-title">Member Overview</div>
    
          <!-- ✅ perfectly centered SCROLL + sort -->
          <div class="cwl-subheaderbar" aria-label="CWL member overview header">
            <div></div>
            <div class="cwl-scroll-inline" id="cwl-members-scroll-inline">← SCROLL →</div>
            <div class="cwl-sortbtn-wrap">
              <div class="sort-btn">
                <span class="sort-btn-label" id="cwlMembersSortLabel">Attack Rank</span>
                <select id="cwlMembersSortSelect" aria-label="Sort CWL members">
                  <option value="rank">Attack Rank</option>
                  <option value="defRank">Defensive Rank</option>
                  <option value="totalStars">Total Stars</option>
                  <option value="totalPct">Total %</option>
                  <option value="avgStars">AVG Stars</option>
                  <option value="avgPct">Avg %</option>
                </select>
              </div>
            </div>
          </div>
    
          <div class="cwl-table-wrap dragscroll" aria-label="CWL member overview">
            <table class="cwl-table cwl-wide" id="cwl-member-table">
              <colgroup>
                <col style="width:44px;">  <!-- # (sticky) -->
                <col style="width:92px;">  <!-- Name (sticky) -->
    
                <col style="width:58px;">  <!-- 🗡️ RK (not sticky) -->
                <col style="width:58px;">  <!-- 🛡️ RK (not sticky) -->
    
                <col style="width:75px;">
                <col style="width:90px;">
                <col style="width:92px;">
                <col style="width:92px;">
                <col style="width:96px;">
    
                <!-- War cols: Opp widest, Stars tight, % medium -->
                <col style="width:120px;"><col style="width:36px;"><col style="width:70px;">
                <col style="width:120px;"><col style="width:36px;"><col style="width:70px;">
                <col style="width:120px;"><col style="width:36px;"><col style="width:70px;">
                <col style="width:120px;"><col style="width:36px;"><col style="width:70px;">
                <col style="width:120px;"><col style="width:36px;"><col style="width:70px;">
                <col style="width:120px;"><col style="width:36px;"><col style="width:70px;">
                <col style="width:120px;"><col style="width:36px;"><col style="width:70px;">
              </colgroup>
    
              <thead id="cwl-members-head">
                <!-- Row 1: War group headers; left side visually blank -->
                <tr>
                  <th class="sticky-1 muted">&nbsp;</th>
                  <th class="sticky-2 muted">&nbsp;</th>
    
                  <th class="muted">&nbsp;</th>
                  <th class="muted">&nbsp;</th>
    
                  <th class="muted">&nbsp;</th>
                  <th class="muted">&nbsp;</th>
                  <th class="muted">&nbsp;</th>
                  <th class="muted">&nbsp;</th>
                  <th class="muted cwl-general-sep">&nbsp;</th>
    
                  <th class="cwl-warhead" colspan="3">War 1</th>
                  <th class="cwl-warhead" colspan="3">War 2</th>
                  <th class="cwl-warhead" colspan="3">War 3</th>
                  <th class="cwl-warhead" colspan="3">War 4</th>
                  <th class="cwl-warhead" colspan="3">War 5</th>
                  <th class="cwl-warhead" colspan="3">War 6</th>
                  <th class="cwl-warhead" colspan="3">War 7</th>
                </tr>
    
                <!-- Row 2: ALL column headers -->
                <tr>
                  <th class="sticky-1">#</th>
                  <th class="sticky-2">&nbsp;</th>
    
                  <th class="cwl-rk">🗡️RK</th>
                  <th class="cwl-rk">🛡️RK</th>
    
                  <th>TTL★</th>
                  <th>TTL%</th>
                  <th>Avg★</th>
                  <th>Avg%</th>
                  <th class="cwl-general-sep">Atk</th>
    
                  <!-- War subheaders -->
                  <th class="left cwl-warcell cwl-day-start"><span class="cwl-war-sword">⚔️</span><span class="cwl-war-oppname" id="cwl-war-oppname-1"></span></th><th class="cwl-warcell">⭐</th><th class="cwl-warcell cwl-day-end">🎯</th>
                  <th class="left cwl-warcell cwl-day-start"><span class="cwl-war-sword">⚔️</span><span class="cwl-war-oppname" id="cwl-war-oppname-2"></span></th><th class="cwl-warcell">⭐</th><th class="cwl-warcell cwl-day-end">🎯</th>
                  <th class="left cwl-warcell cwl-day-start"><span class="cwl-war-sword">⚔️</span><span class="cwl-war-oppname" id="cwl-war-oppname-3"></span></th><th class="cwl-warcell">⭐</th><th class="cwl-warcell cwl-day-end">🎯</th>
                  <th class="left cwl-warcell cwl-day-start"><span class="cwl-war-sword">⚔️</span><span class="cwl-war-oppname" id="cwl-war-oppname-4"></span></th><th class="cwl-warcell">⭐</th><th class="cwl-warcell cwl-day-end">🎯</th>
                  <th class="left cwl-warcell cwl-day-start"><span class="cwl-war-sword">⚔️</span><span class="cwl-war-oppname" id="cwl-war-oppname-5"></span></th><th class="cwl-warcell">⭐</th><th class="cwl-warcell cwl-day-end">🎯</th>
                  <th class="left cwl-warcell cwl-day-start"><span class="cwl-war-sword">⚔️</span><span class="cwl-war-oppname" id="cwl-war-oppname-6"></span></th><th class="cwl-warcell">⭐</th><th class="cwl-warcell cwl-day-end">🎯</th>
                  <th class="left cwl-warcell cwl-day-start"><span class="cwl-war-sword">⚔️</span><span class="cwl-war-oppname" id="cwl-war-oppname-7"></span></th><th class="cwl-warcell">⭐</th><th class="cwl-warcell cwl-day-end">🎯</th>
                </tr>
              </thead>
    
              <tbody id="cwl-memberoverview-body">
                <tr><td colspan="30" style="opacity:.75; text-align:center; padding:12px;">Loading…</td></tr>
              </tbody>
            </table>
          </div>
    
          <div id="cwl-fetch-status" class="tiny-status">CWL fetch: —</div>
          <div id="cwl-index-status" class="tiny-status">CWL index fetch: —</div>
          <div id="clan-fetch-status-cwl" class="tiny-status">Clan stats fetch: —</div>
        </div>
      `;
    }


    function renderWarPage(){
      return `
        <div class="cards">
          <h2 class="cards-title">War</h2>

          <div class="row"><span class="row-label">War Record</span><span id="war-record" class="row-value">Loading…</span></div>
          <div class="row"><span class="row-label">Last 10 Wars</span><span id="war-last10" class="row-value">Loading…</span></div>
          <div class="row"><span class="row-label">Last 25 Wars</span><span id="war-last25" class="row-value">Loading…</span></div>
          <div class="row"><span class="row-label">Last 50 Wars</span><span id="war-last50" class="row-value">Loading…</span></div>
          <div class="row"><span class="row-label">Current Streak</span><span id="war-streak" class="row-value">Loading…</span></div>
          <div class="row"><span class="row-label">Longest Streak</span><span id="war-longest" class="row-value">Loading…</span></div>

          <div class="divider"></div>

          <h2 class="cards-title" style="margin-top:6px;">Current War</h2>
          <div id="war-size" class="war-mode-title" style="margin:6px 0 6px;">—</div>

          <div class="war-board">
            <div id="war-stage-label" class="war-mode-title" style="margin: 8px 0 4px;">Loading…</div>
            <div id="war-timer" class="war-timer">—</div>

            <div class="war-grid-3">
              <div>
                <div id="war-name-us" class="war-name">—</div>
                <div class="war-stat"><span id="war-stars-us">—</span> <span>⭐</span></div>
                <div class="war-substat"><span id="war-destr-us">—</span> <span>🎯</span></div>
                <div class="war-substat"><span id="war-attacks-us">—</span> <span>⚔️</span></div>
              </div>

              <div id="war-vs" class="war-vs">VS</div>

              <div>
                <div id="war-name-opp" class="war-name">—</div>
                <div class="war-stat"><span id="war-stars-opp">—</span> <span>⭐</span></div>
                <div class="war-substat"><span id="war-destr-opp">—</span> <span>🎯</span></div>
                <div class="war-substat"><span id="war-attacks-opp">—</span> <span>⚔️</span></div>
              </div>
            </div>

            <div id="war-fetch-status" class="tiny-status">Last fetch: —</div>
            <div id="clan-fetch-status-war" class="tiny-status">Clan stats fetch: —</div>
          </div>

          <div class="war-chart-wrap dragscroll">
            <div id="war-chart-mount"></div>
            <div id="war-chart-status" class="tiny-status">Chart fetch: —</div>
          </div>
        </div>
      `;
    }

    function renderRouteContent(route){
      if(route === "home") return renderHome();
      if(route === "cwl") return renderCwlPage();
      if(route === "war") return renderWarPage();
      if(route === "mystats") return pageShellCards("My Stats", "Coming Soon!");
      if(route === "more") return renderMore();
      return renderHome();
    }

    // =========================
    // Data endpoints
    // =========================
    const GITHUB_OWNER = "cocbased";
    const GITHUB_REPO = "based";
    const RAW_DATA_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/data/`;

    const RAW_WAR_URL_BASE        = `${RAW_DATA_BASE}war.json`;
    const RAW_WAR_DETAIL_URL_BASE = `${RAW_DATA_BASE}war_detail.json`;
    const RAW_CLAN_URL_BASE       = `${RAW_DATA_BASE}clan_stats.json`;
    const RAW_MEMBERS_URL_BASE    = `${RAW_DATA_BASE}members.json`;

    // CWL endpoints
    const RAW_CWL_CURRENT_URL_BASE = `${RAW_DATA_BASE}cwl_current.json`;
    const RAW_CWL_INDEX_URL_BASE   = `${RAW_DATA_BASE}cwl_index.json`;

    // Fallbacks
    const RAW_FALLBACK_BASE = "https://cdn.jsdelivr.net/gh/cocbased/based@main/data/";
    const RAW_WAR_FALLBACKS         = ["./data/war.json", `${RAW_FALLBACK_BASE}war.json`];
    const RAW_WAR_DETAIL_FALLBACKS  = ["./data/war_detail.json", `${RAW_FALLBACK_BASE}war_detail.json`];
    const RAW_CLAN_FALLBACKS        = ["./data/clan_stats.json", `${RAW_FALLBACK_BASE}clan_stats.json`];
    const RAW_MEMBERS_FALLBACKS     = ["./data/members.json", `${RAW_FALLBACK_BASE}members.json`];
    const RAW_CWL_CURRENT_FALLBACKS = ["./data/cwl_current.json", `${RAW_FALLBACK_BASE}cwl_current.json`];
    const RAW_CWL_INDEX_FALLBACKS   = ["./data/cwl_index.json", `${RAW_FALLBACK_BASE}cwl_index.json`];

    // =========================
    // State + intervals
    // =========================
    let homeIntervals = [];
    let warIntervals  = [];
    let moreIntervals = [];
    let cwlIntervals  = [];
    function clearIntervals(arr){ arr.forEach(id => clearInterval(id)); arr.length = 0; }

    let warData = null;
    let warFetched = false;

    let warDetail = null;
    let warDetailFetched = false;

    const LAST_WAR_STORAGE_KEY = "based_last_war_snapshot";
    let lastWarSnapshot = null;
    const LAST_WAR_DETAIL_STORAGE_KEY = "based_last_war_detail_snapshot";
    let lastWarDetailSnapshot = null;

    let clanStats = null;
    let membersData = null;
    let membersSortMode = "role";

    // CWL state
    const CWL_SELECTED_KEY = "based_cwl_selected_season";
    
    // ✅ rollup keys
    const CWL_ALL_TIME_KEY = "all_time";
    const CWL_ROLLUP_YEAR_RE = /^\d{4}$/;
       
    let cwlIndex = null;
    let cwlCurrent = null;
    
    // stored selection can be: "YYYY-MM" OR "all_time" OR "year:YYYY"
    let cwlSelected = (localStorage.getItem(CWL_SELECTED_KEY) || CWL_ALL_TIME_KEY);
    let cwlSelectedPayload = null;


    // ✅ CWL Member Overview sort state (default: Rank ascending)
    let cwlMembersSortMode = "rank";
    
    // ✅ Rounds carousel: preserve slide while data refreshes
    let cwlRoundsSavedIndex = null;     // what slide user is viewing (0-based)
    let cwlRoundsDidInitThisVisit = false; // only auto-jump on first mount per CWL visit
    let cwlRoundsRenderHash = null; // ✅ prevents carousel flicker + scroll jumps
    
    // =========================
    // Utilities
    // =========================
    function pad(n){ return String(n).padStart(2,"0"); }
    function formatCountdown(ms){
      if(ms <= 0) return "0d 00h 00m 00s";
      const totalSeconds = Math.floor(ms/1000);
      const days = Math.floor(totalSeconds/86400);
      const hours = Math.floor((totalSeconds%86400)/3600);
      const minutes = Math.floor((totalSeconds%86400%3600)/60);
      const seconds = totalSeconds%60;
      return days+"d "+pad(hours)+"h "+pad(minutes)+"m "+pad(seconds)+"s";
    }

    function loadLastWarSnapshot(){
      try{
        const raw = localStorage.getItem(LAST_WAR_STORAGE_KEY);
        if(!raw) return null;
        const obj = JSON.parse(raw);
        if(obj && typeof obj === "object" && obj.state && obj.state !== "notInWar") return obj;
      } catch(e){}
      return null;
    }
    function saveLastWarSnapshot(w){
      try{ localStorage.setItem(LAST_WAR_STORAGE_KEY, JSON.stringify(w)); } catch(e){}
    }
    lastWarSnapshot = loadLastWarSnapshot();

    function loadLastWarDetailSnapshot(){
      try{
        const raw = localStorage.getItem(LAST_WAR_DETAIL_STORAGE_KEY);
        if(!raw) return null;
        const obj = JSON.parse(raw);
        if(obj && typeof obj === "object" && obj.state && obj.state !== "notInWar") return obj;
      } catch(e){}
      return null;
    }
    function saveLastWarDetailSnapshot(w){
      try{ localStorage.setItem(LAST_WAR_DETAIL_STORAGE_KEY, JSON.stringify(w)); } catch(e){}
    }
    lastWarDetailSnapshot = loadLastWarDetailSnapshot();

    function winPctFromWLT(w,l,t){
      const W=(w|0), L=(l|0), T=(t|0);
      const total=W+L+T;
      if(total<=0) return null;
      return (W + 0.5*T)/total;
    }
    function fmtPctDecimal(p){
      if(typeof p !== "number" || !isFinite(p)) return "";
      return ` (${p.toFixed(3)})`;
    }
    function fmtWLTWithPctNums(w,l,t){
      const pct=winPctFromWLT(w,l,t);
      return { text:`${w}-${l}-${t}${fmtPctDecimal(pct)}`, losses:(l|0) };
    }
    function fmtWLTWithPctObj(obj){
      if(!obj || typeof obj !== "object") return { text:"—", losses:null };
      const w=(typeof obj.wins==="number")?obj.wins:null;
      const l=(typeof obj.losses==="number")?obj.losses:null;
      const t=(typeof obj.ties==="number")?obj.ties:null;
      if(w===null||l===null||t===null) return { text:"—", losses:null };
      const pct=winPctFromWLT(w,l,t);
      return { text:`${w}-${l}-${t}${fmtPctDecimal(pct)}`, losses:l };
    }
    function hasNoLosses(losses){
      return typeof losses==="number" && isFinite(losses) && losses===0;
    }
    function setClass(id, className, on){
      const el = document.getElementById(id);
      if(!el) return;
      el.classList.toggle(className, !!on);
    }

    function roleEmoji(role){
      const r = String(role || "").toLowerCase();
      if(r.includes("leader")) return "👑";
      if(r === "elder") return "🛡️";
      return "";
    }
    function isLeaderOnly(role){
      return String(role || "").trim().toLowerCase() === "leader";
    }

    // =========================
    // TIME PARSING (ISO + CoC formats)
    // =========================
    function parseWarTime(val){
      if(!val) return null;
      if(val instanceof Date) return isNaN(val.getTime()) ? null : val;

      const s = String(val).trim();
      if(!s) return null;

      const dIso = new Date(s);
      if(!isNaN(dIso.getTime())) return dIso;

      const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.(\d{3}))?Z$/);
      if(m){
        const [,Y,MO,DA,HH,MI,SS,MS] = m;
        const ms = MS ? +MS : 0;
        const d = new Date(Date.UTC(+Y, +MO-1, +DA, +HH, +MI, +SS, ms));
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    }

    function getWarTimes(display, detailDisplay){
      const start =
        parseWarTime(display?.startTimeIso) ||
        parseWarTime(display?.startTime) ||
        parseWarTime(display?.start) ||
        parseWarTime(detailDisplay?.startTimeIso) ||
        parseWarTime(detailDisplay?.startTime) ||
        null;

      const end =
        parseWarTime(display?.endTimeIso) ||
        parseWarTime(display?.endTime) ||
        parseWarTime(display?.end) ||
        parseWarTime(detailDisplay?.endTimeIso) ||
        parseWarTime(detailDisplay?.endTime) ||
        null;

      return { start, end };
    }

    function getWarUpdatedAt(obj){
      return (
        parseWarTime(obj?.updatedAtIso) ||
        parseWarTime(obj?.updatedAt) ||
        parseWarTime(obj?.updated_at) ||
        parseWarTime(obj?.lastUpdatedIso) ||
        parseWarTime(obj?.lastUpdated) ||
        parseWarTime(obj?.last_updated) ||
        null
      );
    }

    function isNewerWarSnapshot(current, incoming){
      const curTime = getWarUpdatedAt(current);
      const nextTime = getWarUpdatedAt(incoming);
      if(!curTime || !nextTime) return false;
      return curTime.getTime() >= nextTime.getTime();
    }

    function stampTime(){
      const d = new Date();
      return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
    }

    // =========================
    // Robust JSON fetch + meta diagnostics
    // =========================
    const endpointState = new Map(); // key => { lastHash, unchangedStreak }

    function fnv1a32(str){
      let h = 0x811c9dc5;
      for(let i=0;i<str.length;i++){
        h ^= str.charCodeAt(i);
        h = (h + ((h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24))) >>> 0;
      }
      return h >>> 0;
    }

    async function fetchJsonWithMeta(url, stateKey){
      const key = stateKey || url;
      const cb = Date.now();
      const rnd = Math.random().toString(16).slice(2);
      const busted = `${url}${url.includes("?") ? "&" : "?"}cb=${cb}&r=${rnd}`;

      const started = performance.now();
      const res = await fetch(busted, {
        cache: "no-store"
      });

      const text = await res.text();
      if(!res.ok) throw new Error(`${url} HTTP ${res.status}`);

      const hash = fnv1a32(text).toString(16).padStart(8,"0");
      const bytes = text.length;

      const st = endpointState.get(key) || { lastHash:null, unchangedStreak:0 };
      const unchanged = (st.lastHash === hash);
      st.unchangedStreak = unchanged ? (st.unchangedStreak + 1) : 0;
      st.lastHash = hash;
      endpointState.set(key, st);

      let data;
      try{
        data = JSON.parse(text);
      }catch(e){
        throw new Error(`${url} JSON parse error`);
      }

      const ms = Math.round(performance.now() - started);
      const meta = {
        ok: true,
        url: busted,
        hash,
        bytes,
        ms,
        unchanged,
        unchangedStreak: st.unchangedStreak,
        lastModified: res.headers.get("Last-Modified") || "",
        etag: res.headers.get("ETag") || ""
      };
      return { data, meta };
    }

    async function fetchJsonSmart(primaryUrl, fallbackUrls, stateKey){
      const fallbacks = Array.isArray(fallbackUrls)
        ? fallbackUrls.filter(Boolean)
        : (fallbackUrls ? [fallbackUrls] : []);
      let primary;
      try{
        primary = await fetchJsonWithMeta(primaryUrl, stateKey || primaryUrl);
      }catch(e){
        for(let i=0;i<fallbacks.length;i++){
          try{
            const fb = await fetchJsonWithMeta(fallbacks[i], (stateKey || primaryUrl) + `::fallback${i+1}`);
            fb.meta.via = `fallback-${i+1}`;
            return fb;
          }catch(err){}
        }
        throw e;
      }

      if(fallbacks.length){
        const st = endpointState.get(stateKey || primaryUrl);
        const shouldTryFallback = primary.meta.unchanged && st && st.unchangedStreak >= 3;

        if(shouldTryFallback){
          for(let i=0;i<fallbacks.length;i++){
            try{
              const fb = await fetchJsonWithMeta(fallbacks[i], (stateKey || primaryUrl) + `::fallback${i+1}`);
              if(fb.meta.hash !== primary.meta.hash){
                fb.meta.via = `fallback-${i+1}`;
                return fb;
              }
            }catch(e){}
          }
        }
      }

      primary.meta.via = "primary";
      return primary;
    }

    function isFallbackMeta(meta){
      return typeof meta?.via === "string" && meta.via.startsWith("fallback");
    }

    function formatMetaLine(label, meta){
      if(!meta) return `${label}: ${stampTime()} ❌`;
      const changedTxt = meta.unchanged ? "UNCHANGED" : "CHANGED";
      const lm = meta.lastModified ? ` · LM ${meta.lastModified}` : "";
      const via = meta.via ? ` · ${meta.via.toUpperCase()}` : "";
      return `${label}: ${stampTime()} ✅ ${changedTxt} · ${meta.bytes}B · #${meta.hash}${via}${lm}`;
    }

    // =========================
    // Fetchers
    // =========================
    async function fetchWarData(){
      try{
        const previous = warData;
        const { data, meta } = await fetchJsonSmart(RAW_WAR_URL_BASE, RAW_WAR_FALLBACKS, "war.json");
        warData = (isFallbackMeta(meta) && previous && isNewerWarSnapshot(previous, data))
          ? previous
          : data;

        if(warData && warData.state && warData.state !== "notInWar"){
          lastWarSnapshot = warData;
          saveLastWarSnapshot(warData);
        }

        setText("war-fetch-status", formatMetaLine("Last fetch", meta));
      } catch(e){
        warData = null;
        setText("war-fetch-status", `Last fetch: ${stampTime()} ❌ ${String(e.message || e)}`);
      }
      warFetched = true;
      renderWarSection();
    }

    async function fetchWarDetail(){
      try{
        const previous = warDetail;
        const { data, meta } = await fetchJsonSmart(RAW_WAR_DETAIL_URL_BASE, RAW_WAR_DETAIL_FALLBACKS, "war_detail.json");
        warDetail = (isFallbackMeta(meta) && previous && isNewerWarSnapshot(previous, data))
          ? previous
          : data;
        if(warDetail && warDetail.state && warDetail.state !== "notInWar"){
          lastWarDetailSnapshot = warDetail;
          saveLastWarDetailSnapshot(warDetail);
        }
        setText("war-chart-status", formatMetaLine("Chart fetch", meta));
      } catch(e){
        warDetail = null;
        setText("war-chart-status", `Chart fetch: ${stampTime()} ❌ ${String(e.message || e)}`);
      }
      warDetailFetched = true;
      renderWarSection();
      renderWarChart();
    }

    // =========================
    // More tolerant schema helpers
    // =========================
    function pick(obj, keys){
      for(const k of keys){
        const v = obj?.[k];
        if(v !== undefined && v !== null && v !== "") return v;
      }
      return null;
    }
    function pickObj(obj, keys){
      const v = pick(obj, keys);
      return (v && typeof v === "object") ? v : null;
    }
    function pickNum(obj, keys){
      const v = pick(obj, keys);
      const n = (typeof v === "number") ? v : Number(v);
      return isFinite(n) ? n : null;
    }

    function normalizeClanStats(raw){
      if(!raw || typeof raw !== "object") return null;

      const description = pick(raw, ["description","desc","clanDescription","about"]) || "";

      const cwl = pickObj(raw, ["cwl","CWL","cwlInfo","cwl_info"]) || {};
      const cwlLeague =
        pick(cwl, ["currentLeague","league","name"]) ||
        pick(raw, ["cwlLeague","cwl_league","cwlLeagueName"]) ||
        "—";

      const cwlFinish =
        pick(cwl, ["lastFinish","finish","last_finish"]) ||
        pick(raw, ["cwlFinish","cwl_finish","lastCwlFinish"]) ||
        "—";

      const capital = pickObj(raw, ["clanCapital","capital","clan_capital"]) || {};
      const capitalHallLevel =
        pickNum(capital, ["capitalHallLevel","hallLevel","capital_hall_level"]) ??
        pickNum(raw, ["capitalHallLevel","capitalHall","capital_hall_level"]);

      const war =
        pickObj(raw, ["war","warStats","war_stats","warRecord","war_record"]) || {};

      const wins   = pickNum(war, ["wins"])   ?? pickNum(raw, ["warWins","wins","war_wins"]) ?? 0;
      const losses = pickNum(war, ["losses"]) ?? pickNum(raw, ["warLosses","losses","war_losses"]) ?? 0;
      const ties   = pickNum(war, ["ties"])   ?? pickNum(raw, ["warTies","ties","war_ties"]) ?? 0;

      const currentStreak =
        pickNum(war, ["currentStreak","streak","current_streak"]) ??
        pickNum(raw, ["currentStreak","current_streak","warStreak"]);

      const longestStreak =
        pickNum(war, ["longestStreak","bestStreak","longest_streak"]) ??
        pickNum(raw, ["longestStreak","longest_streak","bestWarStreak"]);

      const last10  = pickObj(war, ["last10","last_10","lastTen"])  || pickObj(raw, ["last10","last_10","lastTen"]);
      const last25  = pickObj(war, ["last25","last_25"])            || pickObj(raw, ["last25","last_25"]);
      const last50  = pickObj(war, ["last50","last_50"])            || pickObj(raw, ["last50","last_50"]);

      return {
        description,
        cwl: { currentLeague: cwlLeague, lastFinish: cwlFinish },
        clanCapital: { capitalHallLevel: (typeof capitalHallLevel === "number" ? capitalHallLevel : null) },
        war: {
          wins, losses, ties,
          currentStreak: (typeof currentStreak === "number" ? currentStreak : null),
          longestStreak: (typeof longestStreak === "number" ? longestStreak : null),
          last10, last25, last50
        },
        __raw: raw
      };
    }

    async function fetchMembersData(){
      try{
        const { data, meta } = await fetchJsonSmart(RAW_MEMBERS_URL_BASE, RAW_MEMBERS_FALLBACKS, "members.json");
        membersData = data;
        setTextAny(["members-fetch-status"], formatMetaLine("Members fetch", meta));
      } catch(e){
        membersData = null;
        setTextAny(["members-fetch-status"], `Members fetch: ${stampTime()} ❌ ${String(e.message || e)}`);
      }
      renderMembers();
    }

    async function fetchClanStats(){
      try{
        const { data, meta } = await fetchJsonSmart(RAW_CLAN_URL_BASE, RAW_CLAN_FALLBACKS, "clan_stats.json");
        clanStats = normalizeClanStats(data) || null;

        const line = formatMetaLine("Clan stats fetch", meta);
        setTextAny(["clan-fetch-status","clan-fetch-status-war","clan-fetch-status-cwl"], line);
      } catch(e){
        clanStats = null;
        const line = `Clan stats fetch: ${stampTime()} ❌ ${String(e.message || e)}`;
        setTextAny(["clan-fetch-status","clan-fetch-status-war","clan-fetch-status-cwl"], line);
      }
      renderClanStats();
    }

    // =========================
    // CWL fetchers
    // =========================
    async function fetchCwlIndex(){
      try{
        const { data, meta } = await fetchJsonSmart(RAW_CWL_INDEX_URL_BASE, RAW_CWL_INDEX_FALLBACKS, "cwl_index.json");
        cwlIndex = data;
        setText("cwl-index-status", formatMetaLine("CWL index fetch", meta));
      }catch(e){
        cwlIndex = null;
        setText("cwl-index-status", `CWL index fetch: ${stampTime()} ❌ ${String(e.message || e)}`);
      }
      renderCwlSeasonSelect();
    }

    async function fetchCwlCurrent(){
      try{
        const { data, meta } = await fetchJsonSmart(RAW_CWL_CURRENT_URL_BASE, RAW_CWL_CURRENT_FALLBACKS, "cwl_current.json");
        cwlCurrent = data;
        setText("cwl-fetch-status", formatMetaLine("CWL fetch", meta));
      }catch(e){
        cwlCurrent = null;
        setText("cwl-fetch-status", `CWL fetch: ${stampTime()} ❌ ${String(e.message || e)}`);
      }

      const curKey = String(cwlCurrent?.seasonKey || cwlCurrent?.meta?.seasonKey || "").trim();
      if(curKey && cwlSelected === curKey){
        cwlSelectedPayload = cwlCurrent;
        renderCwlContent();
      } else {
        renderCwlSeasonSelect();
      }

    }

    async function fetchCwlHistory(key){
      if(!key) return;
    
      // ✅ rollups
      if(isCwlRollupKey(key)){
        const pagesUrl = `./data/cwl_rollups/${encodeURIComponent(key)}.json`;
        const rawUrl   = `${RAW_DATA_BASE}cwl_rollups/${encodeURIComponent(key)}.json`;
        const backups  = [pagesUrl, `${RAW_FALLBACK_BASE}cwl_rollups/${encodeURIComponent(key)}.json`];
        try{
          const { data, meta } = await fetchJsonSmart(rawUrl, backups, `cwl_rollups:${key}`);
          cwlSelectedPayload = data;
          setText("cwl-fetch-status", formatMetaLine("CWL fetch", meta));
        }catch(e){
          cwlSelectedPayload = null;
          setText("cwl-fetch-status", `CWL fetch: ${stampTime()} ❌ ${String(e.message || e)}`);
        }
        renderCwlContent();
        return;
      }

      
      // ✅ monthly snapshot
      const pagesUrl = `./data/cwl_history/${encodeURIComponent(key)}.json`;
      const rawUrl   = `${RAW_DATA_BASE}cwl_history/${encodeURIComponent(key)}.json`;
      const backups  = [pagesUrl, `${RAW_FALLBACK_BASE}cwl_history/${encodeURIComponent(key)}.json`];
    
      try{
        const { data, meta } = await fetchJsonSmart(rawUrl, backups, `cwl_history:${key}`);
        cwlSelectedPayload = data;
        setText("cwl-fetch-status", formatMetaLine("CWL fetch", meta));
      }catch(e){
        cwlSelectedPayload = null;
        setText("cwl-fetch-status", `CWL fetch: ${stampTime()} ❌ ${String(e.message || e)}`);
      }
      renderCwlContent();
    }

    function isCwlRollupKey(key){
      if(key === CWL_ALL_TIME_KEY) return true;
      return CWL_ROLLUP_YEAR_RE.test(String(key || "").trim());
    }

    function getCwlSeasonKeysForRollup(rollupKey){
      const seasons = Array.isArray(cwlIndex?.seasons) ? cwlIndex.seasons : [];
      const allKeys = seasons
        .map(s => String(s?.seasonKey || "").trim())
        .filter(Boolean);

      if(rollupKey === CWL_ALL_TIME_KEY) return allKeys;

      const year = String(rollupKey || "").trim();
      if(CWL_ROLLUP_YEAR_RE.test(year)){
        return allKeys.filter((key) => key.startsWith(`${year}-`));
      }

      return [];
    }

    // =========================
    // Render: Current War section
    // =========================
    function renderWarSection(){
      if(!document.getElementById("war-timer")) return;

      let display = warData;
      if(display && display.state === "notInWar" && lastWarSnapshot) display = lastWarSnapshot;

      const detailDisplay = (warDetail && warDetail.state !== "notInWar") ? warDetail : lastWarDetailSnapshot;
      const stateRaw = String(display?.state || detailDisplay?.state || "");
      const state = stateRaw.trim().toLowerCase();

      const teamSize =
        Number(display?.teamSize || display?.size || 0) ||
        Number(detailDisplay?.teamSize || 0) ||
        null;
      setText("war-size", teamSize ? `${teamSize} v ${teamSize}` : "—");

      if(state === "notinwar" || stateRaw === "notInWar"){
        setText("war-stage-label","No War");
        setText("war-timer","");
        setText("war-name-us","—"); setText("war-name-opp","—");
        setText("war-stars-us","—"); setText("war-stars-opp","—");
        setText("war-destr-us","—"); setText("war-destr-opp","—");
        setText("war-attacks-us","—"); setText("war-attacks-opp","—");
        return;
      }

      const maxStars = teamSize ? (3 * teamSize) : null;
      const maxAttacks = teamSize ? (2 * teamSize) : null;

      const ourName = display?.ourName || detailDisplay?.clan?.name || detailDisplay?.our?.name || "US";
      const oppName = display?.oppName || detailDisplay?.opponent?.name || "OPPONENT";
      setText("war-name-us", ourName);
      setText("war-name-opp", oppName);

      const ourStars = (display?.ourStars ?? detailDisplay?.clan?.stars ?? detailDisplay?.our?.stars ?? null);
      const oppStars = (display?.oppStars ?? detailDisplay?.opponent?.stars ?? null);

      setText("war-stars-us", (ourStars == null) ? "—" : (maxStars ? `${ourStars}/${maxStars}` : String(ourStars)));
      setText("war-stars-opp",(oppStars == null) ? "—" : (maxStars ? `${oppStars}/${maxStars}` : String(oppStars)));

      const ourDes = (display?.ourDestructionPercentage ?? detailDisplay?.clan?.destructionPercentage ?? detailDisplay?.our?.destructionPercentage ?? null);
      const oppDes = (display?.oppDestructionPercentage ?? detailDisplay?.opponent?.destructionPercentage ?? null);

      setText("war-destr-us", (ourDes == null) ? "—" : `${Number(ourDes)}%`);
      setText("war-destr-opp", (oppDes == null) ? "—" : `${Number(oppDes)}%`);

      const ourAtkUsed = (display?.ourAttacksUsed ?? detailDisplay?.clan?.attacks ?? detailDisplay?.our?.attacks ?? null);
      const oppAtkUsed = (display?.oppAttacksUsed ?? detailDisplay?.opponent?.attacks ?? null);

      setText("war-attacks-us", (ourAtkUsed == null) ? "—" : (maxAttacks ? `${ourAtkUsed}/${maxAttacks}` : String(ourAtkUsed)));
      setText("war-attacks-opp",(oppAtkUsed == null) ? "—" : (maxAttacks ? `${oppAtkUsed}/${maxAttacks}` : String(oppAtkUsed)));

      const now = new Date();
      const { start, end } = getWarTimes(display, detailDisplay);
      const startOk = start && !isNaN(start.getTime());
      const endOk = end && !isNaN(end.getTime());

      if(endOk && now >= end){
        setText("war-stage-label","WAR ENDED");
        setText("war-timer","");
        return;
      }
      if(startOk && now < start){
        setText("war-stage-label","WAR STARTS IN:");
        setText("war-timer", formatCountdown(start - now));
        return;
      }
      if(endOk && now < end){
        setText("war-stage-label","WAR ENDS IN:");
        setText("war-timer", formatCountdown(end - now));
        return;
      }

      if(state === "preparation"){
        setText("war-stage-label","WAR STARTS IN:");
        setText("war-timer","—");
        return;
      }
      if(state === "inwar"){
        setText("war-stage-label","WAR ENDS IN:");
        setText("war-timer","—");
        return;
      }

      setText("war-stage-label","ACTIVE");
      setText("war-timer","—");
    }

    // =========================
    // War chart helpers
    // =========================
    function starsHTML(n){
      const s = Number(n || 0);
      return `
        <span class="star ${s>=1 ? "" : "dim"}">★</span>
        <span class="star ${s>=2 ? "" : "dim"}">★</span>
        <span class="star ${s>=3 ? "" : "dim"}">★</span>
      `;
    }
    function totalStars(member){
      const atks = Array.isArray(member?.attacks) ? member.attacks : [];
      return atks.reduce((sum,a)=>sum + (Number(a?.stars)||0), 0);
    }
    function niceRole(role){
      const r = String(role || "").trim();
      if(!r) return "";
      const low = r.toLowerCase();
      if(low === "coleader" || low === "co-leader" || low === "coleader" || low === "coLeader") return "Co Leader";
      if(low === "leader") return "Leader";
      if(low === "elder") return "Elder";
      return r;
    }
    function readFirst(obj, keys){
      for(const k of keys){
        const v = obj?.[k];
        if(v !== undefined && v !== null && v !== "") return v;
      }
      return null;
    }
    function roleEmojiForWar(role){
      const r = String(role || "").toLowerCase();
      if(r.includes("leader")) return "👑";
      if(r === "elder") return "🛡️";
      return "";
    }

    // ✅ FIX #2: canonicalize positions so display is always 1..teamSize
    function canonicalizeWarPositions(members, teamSize){
      const list = (Array.isArray(members) ? members.slice() : []);
      const used = new Set();

      // pass 1: keep valid unique positions
      for(const m of list){
        const raw = m?.mapPosition;
        const pos = (raw === null || raw === undefined || raw === "") ? null : Number(raw);
        if(pos && isFinite(pos) && pos >= 1 && pos <= teamSize && !used.has(pos)){
          m.__pos = pos;
          used.add(pos);
        } else {
          m.__pos = null;
        }
      }

      // helper: next missing slot
      let next = 1;
      function nextSlot(){
        while(next <= teamSize && used.has(next)) next++;
        if(next <= teamSize){
          used.add(next);
          return next++;
        }
        return null;
      }

      // pass 2: fill gaps
      for(const m of list){
        if(m.__pos != null) continue;
        m.__pos = nextSlot();
      }

      // stable sort by canonical pos, then name
      list.sort((a,b)=>{
        const ap = (a.__pos == null ? 999999 : a.__pos);
        const bp = (b.__pos == null ? 999999 : b.__pos);
        if(ap !== bp) return ap - bp;
        return String(a?.name||"").localeCompare(String(b?.name||""));
      });

      return list;
    }

    // =========================
    // War chart render
    // =========================
    function renderWarChart(){
      const mount = document.getElementById("war-chart-mount");
      if(!mount) return;

      if(!warDetailFetched){
        mount.innerHTML = `<div class="muted" style="text-align:center;">Loading war chart…</div>`;
        enableDragScrollEverywhere();
        return;
      }
      const detailDisplay = (warDetail && warDetail.state !== "notInWar") ? warDetail : lastWarDetailSnapshot;
      if(!detailDisplay || typeof detailDisplay !== "object"){
        mount.innerHTML = `<div class="muted" style="text-align:center;">War chart unavailable</div>`;
        enableDragScrollEverywhere();
        return;
      }

      const our = detailDisplay.our || detailDisplay.clan || {};
      const opp = detailDisplay.opponent || {};

      const teamSize =
        Number(detailDisplay?.teamSize || our?.teamSize || opp?.teamSize || 0) ||
        (Array.isArray(our?.members) ? our.members.length : 0) ||
        0;

      const ourMembersRaw = Array.isArray(our?.members) ? our.members : [];
      const oppMembersRaw = Array.isArray(opp?.members) ? opp.members : [];

      const ourMembers = canonicalizeWarPositions(ourMembersRaw, teamSize || ourMembersRaw.length || 0);
      const oppMembers = canonicalizeWarPositions(oppMembersRaw, teamSize || oppMembersRaw.length || 0);

      function buildLookup(members){
        const byTag = new Map();
        const byPos = new Map(); // canonical pos (1..teamSize)
        for(const m of (members||[])){
          const tag = m?.tag ? String(m.tag) : "";
          const pos = (m?.__pos != null) ? Number(m.__pos) : null;
          if(tag) byTag.set(tag, m);
          if(pos != null && isFinite(pos)) byPos.set(pos, m);
        }
        return { byTag, byPos };
      }
      const ourLU = buildLookup(ourMembers);
      const oppLU = buildLookup(oppMembers);

      function formatDefenderFromAttack(a, defenderSideLU){
        if(!a) return "—";
        const dName = readFirst(a, ["defenderName","defender","targetName","defenderPlayerName","defender_name"]);
        const dTag  = readFirst(a, ["defenderTag","defender_tag","targetTag","defenderPlayerTag"]);
        const dPos  = readFirst(a, ["defenderMapPosition","defenderPosition","defenderPos","targetMapPosition","defender_mapPosition","targetPosition"]);

        if(dTag && defenderSideLU?.byTag?.has(String(dTag))){
          const m = defenderSideLU.byTag.get(String(dTag));
          const pos = (m?.__pos != null) ? m.__pos : (dPos != null ? dPos : "—");
          const nm  = m?.name || dName || "—";
          return `${pos}. ${nm}`;
        }

        const posNum = (dPos != null && dPos !== "") ? Number(dPos) : null;
        if(posNum != null && isFinite(posNum) && defenderSideLU?.byPos?.has(posNum)){
          const m = defenderSideLU.byPos.get(posNum);
          const nm = m?.name || dName || "—";
          return `${posNum}. ${nm}`;
        }

        if(dName) return String(dName);
        return "—";
      }

      function rowHTML(member, defenderSideLU){
        const name = member?.name || "—";
        const mp = (member?.__pos != null) ? member.__pos : "—";

        const atks = Array.isArray(member?.attacks) ? member.attacks : [];
        const a1 = atks[0] || null;
        const a2 = atks[1] || null;

        const a1Pct = (a1 && a1.destructionPercentage != null) ? `${a1.destructionPercentage}%` : "—";
        const a2Pct = (a2 && a2.destructionPercentage != null) ? `${a2.destructionPercentage}%` : "—";

        const a1Stars = a1 ? Number(a1.stars||0) : 0;
        const a2Stars = a2 ? Number(a2.stars||0) : 0;

        const a1Def = formatDefenderFromAttack(a1, defenderSideLU);
        const a2Def = formatDefenderFromAttack(a2, defenderSideLU);

        const roleLabel = niceRole(member?.role);
        const roleInline = roleLabel ? ` <span class="war-name-role">(${escapeHtml(roleLabel)})</span>` : "";

        const em = roleEmojiForWar(member?.role);
        const emHTML = em ? `<span class="war-role-emoji" aria-hidden="true">${em}</span>` : "";

        const nameClass = isLeaderOnly(member?.role) ? "war-leader-underline" : "";

        return `
          <div class="war-sheet-row">
            <div class="war-cell right mono numcol">${escapeHtml(mp)}.</div>

            <div class="war-cell">
              <div class="war-player">
                <div class="name" title="${escapeHtml(name)}">
                  <span class="${nameClass}" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(name)}</span>
                  ${emHTML}
                  ${roleInline}
                </div>
                <div class="role">TH${member?.townhallLevel ?? member?.townHallLevel ?? "—"}</div>
              </div>
            </div>

            <div class="war-cell defender stack">
              <div class="atk2">
                <div class="atkline" title="${escapeHtml(a1Def)}">${escapeHtml(a1Def)}</div>
                <div class="atkline" title="${escapeHtml(a2Def)}">${escapeHtml(a2Def)}</div>
              </div>
            </div>

            <div class="war-cell center mono stack">
              <div class="atk2">
                <div class="atkline" style="justify-content:center;">${a1 ? escapeHtml(a1Pct) : "—"}</div>
                <div class="atkline" style="justify-content:center;">${a2 ? escapeHtml(a2Pct) : "—"}</div>
              </div>
            </div>

            <div class="war-cell center stack">
              <div class="atk2">
                <div class="stars">${a1 ? starsHTML(a1Stars) : `<span class="muted">—</span>`}</div>
                <div class="stars">${a2 ? starsHTML(a2Stars) : `<span class="muted">—</span>`}</div>
              </div>
            </div>

            <div class="war-cell center mono bold">${totalStars(member)}★</div>
          </div>
        `;
      }

      function blockHTML(title, isOpp, members){
        const defenderLU = isOpp ? ourLU : oppLU;
        return `
          <div class="war-chart-block">
            <div class="war-chart-head">
              <div class="war-chart-clan" title="${escapeHtml(title || "")}">
                <span>${escapeHtml(title || (isOpp ? "Opponent" : "Our Clan"))}</span>
              </div>
            </div>

            <div class="war-sheet">
              ${(members || []).map(m => rowHTML(m, defenderLU)).join("")}
            </div>
          </div>
        `;
      }

      mount.innerHTML =
        blockHTML(our.name, false, ourMembers) +
        blockHTML(opp.name, true,  oppMembers);

      enableDragScrollEverywhere();
    }

    // =========================
    // Members + ClanStats
    // =========================
    function readIntAny(obj, keys){
      for(const k of keys){
        const v = obj?.[k];
        if(v !== null && v !== undefined && v !== "") return (v|0);
      }
      return 0;
    }
    function getThLevel(m){
      let n = readIntAny(m, ["townHallLevel","th","thLevel","townHall","townhallLevel"]);
      if(n > 0) return n;
      const mm = m?.member || m?.player || m?.raw || null;
      n = readIntAny(mm, ["townHallLevel","th","thLevel","townHall","townhallLevel"]);
      return n > 0 ? n : 0;
    }
    function getWarStars(m){
      let n = readIntAny(m, ["warStars","totalWarStars","warStarCount","totalStars","stars"]);
      if(n >= 0) return n;
      const mm = m?.member || m?.player || m?.raw || null;
      n = readIntAny(mm, ["warStars","totalWarStars","warStarCount","totalStars","stars"]);
      return n >= 0 ? n : 0;
    }
    function getXP(m){
      let n = readIntAny(m, ["expLevel","xp","level"]);
      if(n > 0) return n;
      const mm = m?.member || m?.player || m?.raw || null;
      n = readIntAny(mm, ["expLevel","xp","level"]);
      return n > 0 ? n : 0;
    }
    function getTrophies(m){
      let n = readIntAny(m, ["trophies"]);
      if(n > 0) return n;
      const mm = m?.member || m?.player || m?.raw || null;
      n = readIntAny(mm, ["trophies"]);
      return n > 0 ? n : 0;
    }
    function getDonations(m){
      let n = readIntAny(m, ["donations","troopsDonated","donated"]);
      if(n >= 0) return n;
      const mm = m?.member || m?.player || m?.raw || null;
      n = readIntAny(mm, ["donations","troopsDonated","donated"]);
      return n >= 0 ? n : 0;
    }
    function getDonationsReceived(m){
      let n = readIntAny(m, ["donationsReceived","troopsReceived","received"]);
      if(n >= 0) return n;
      const mm = m?.member || m?.player || m?.raw || null;
      n = readIntAny(mm, ["donationsReceived","troopsReceived","received"]);
      return n >= 0 ? n : 0;
    }
    function roleRank(role){
      const r = String(role || "").toLowerCase();
      if(r.includes("leader")) return 1;
      if(r === "elder" || r === "admin") return 2;
      return 3;
    }
    function compareName(a,b){
      return String(a.name||"").localeCompare(String(b.name||""), undefined, { sensitivity:"base" });
    }

    function updateSortButtonLabel(selectId, labelId, fallback){
      const sel = document.getElementById(selectId);
      const label = document.getElementById(labelId);
      if(!sel || !label) return;
      const option = sel.selectedOptions ? sel.selectedOptions[0] : sel.options[sel.selectedIndex];
      label.textContent = option ? option.textContent : (fallback || "Sort");
    }

    function ensureSortDropdownBound(){
      const sel = document.getElementById("membersSortSelect");
      if(!sel) return;

      sel.value = membersSortMode;
      updateSortButtonLabel("membersSortSelect", "membersSortLabel", "Role");

      if(sel.dataset.bound === "1") return;
      sel.addEventListener("change", () => {
        membersSortMode = sel.value || "role";
        updateSortButtonLabel("membersSortSelect", "membersSortLabel", "Role");
        renderMembers();
      });
      sel.dataset.bound = "1";
    }

    function renderMembers(){
      const tbody = document.getElementById("members-body");
      if(!tbody) return;

      ensureSortDropdownBound();

      let list = null;
      if(membersData){
        if(Array.isArray(membersData.members)) list = membersData.members;
        else if(Array.isArray(membersData.items)) list = membersData.items;
        else if(Array.isArray(membersData)) list = membersData;
      }

      if(!list){
        tbody.innerHTML = `<tr><td colspan="8" style="opacity:.75;">Loading…</td></tr>`;
        enableDragScrollEverywhere();
        requestAnimationFrame(updateStickyOffsets);
        return;
      }
      if(list.length === 0){
        tbody.innerHTML = `<tr><td colspan="8" style="opacity:.75;">No members found.</td></tr>`;
        enableDragScrollEverywhere();
        requestAnimationFrame(updateStickyOffsets);
        return;
      }

      const sorted = list.slice().sort((a,b) => {
        const ta = getTrophies(a), tb = getTrophies(b);
        const xa = getXP(a), xb = getXP(b);
        const wa = getWarStars(a), wb = getWarStars(b);
        const ha = getThLevel(a), hb = getThLevel(b);
        const ra = roleRank(a.role), rb = roleRank(b.role);
        const da = getDonations(a), db = getDonations(b);
        const rxa = getDonationsReceived(a), rxb = getDonationsReceived(b);

        if(membersSortMode === "role"){
          if(ra !== rb) return ra - rb;
          if(tb !== ta) return tb - ta;
          if(xb !== xa) return xb - xa;
          return compareName(a,b);
        }
        if(membersSortMode === "th"){
          if(hb !== ha) return hb - ha;
          if(xb !== xa) return xb - xa;
          if(wb !== wa) return wb - wa;
          return compareName(a,b);
        }
        if(membersSortMode === "trophies"){
          if(tb !== ta) return tb - ta;
          if(xb !== xa) return xb - xa;
          return compareName(a,b);
        }
        if(membersSortMode === "warStars"){
          if(wb !== wa) return wb - wa;
          if(xb !== xa) return xb - xa;
          if(tb !== ta) return tb - ta;
          return compareName(a,b);
        }
        if(membersSortMode === "xp"){
          if(xb !== xa) return xb - xa;
          if(tb !== ta) return tb - ta;
          if(hb !== ha) return hb - ha;
          return compareName(a,b);
        }
        if(membersSortMode === "donated"){
          if(db !== da) return db - da;
          if(xb !== xa) return xb - xa;
          if(tb !== ta) return tb - ta;
          return compareName(a,b);
        }
        if(membersSortMode === "received"){
          if(rxb !== rxa) return rxb - rxa;
          if(xb !== xa) return xb - xa;
          if(tb !== ta) return tb - ta;
          return compareName(a,b);
        }

        if(tb !== ta) return tb - ta;
        if(xb !== xa) return xb - xa;
        return compareName(a,b);
      });

      tbody.innerHTML = sorted.map(m => {
        const badge = roleEmoji(m.role);
        const name = escapeHtml(m.name);
        const th = getThLevel(m);
        const trophies = getTrophies(m);
        const warStars = getWarStars(m);
        const xp = getXP(m);
        const donated = getDonations(m);
        const received = getDonationsReceived(m);
        const leaderClass = isLeaderOnly(m.role) ? "m-leader" : "";

        return `
          <tr>
            <td class="m-emoji">${badge || ""}</td>
            <td><span class="m-user-name ${leaderClass}">${name}</span></td>
            <td class="m-num">${th ? th : "—"}</td>
            <td class="m-num">${trophies ? trophies : 0}</td>
            <td class="m-num">${warStars ? warStars : 0}</td>
            <td class="m-num">${xp ? xp : 0}</td>
            <td class="m-num">${donated}</td>
            <td class="m-num">${received}</td>
          </tr>
        `;
      }).join("");

      enableDragScrollEverywhere();
      requestAnimationFrame(updateStickyOffsets);
    }

    function renderClanStats(){
      const warObj = clanStats?.war || null;

      const descEl = document.getElementById("clan-desc");
      if(descEl){
        const desc = (typeof clanStats?.description === "string") ? clanStats.description.trim() : "";
        descEl.textContent = desc || "—";
      }

      const cwlLeague = clanStats?.cwl?.currentLeague || "—";
      const cwlFinish = clanStats?.cwl?.lastFinish || "—";
      setText("cwl-league", cwlLeague);
      setText("cwl-finish", cwlFinish);

      const hall = clanStats?.clanCapital?.capitalHallLevel;
      setText("capital-hall-level", (typeof hall === "number") ? String(hall) : "—");

      if(document.getElementById("war-record")){
        ["war-record","war-last10","war-last25","war-last50"].forEach(id => setClass(id,"record-green",false));

        if(warObj){
          const w = warObj.wins ?? 0;
          const l = warObj.losses ?? 0;
          const t = warObj.ties ?? 0;

          const rec = fmtWLTWithPctNums(w,l,t);
          setText("war-record", rec.text);
          setClass("war-record","record-green", hasNoLosses(rec.losses));

          setText("war-streak", `${warObj.currentStreak ?? "—"}`);
          setText("war-longest", `${warObj.longestStreak ?? "—"}`);

          const l10 = fmtWLTWithPctObj(warObj.last10);
          const l25 = fmtWLTWithPctObj(warObj.last25);
          const l50 = fmtWLTWithPctObj(warObj.last50);

          setText("war-last10", l10.text);
          setText("war-last25", l25.text);
          setText("war-last50", l50.text);

          setClass("war-last10","record-green", hasNoLosses(l10.losses));
          setClass("war-last25","record-green", hasNoLosses(l25.losses));
          setClass("war-last50","record-green", hasNoLosses(l50.losses));
        } else {
          setText("war-record","—");
          setText("war-last10","—");
          setText("war-last25","—");
          setText("war-last50","—");
          setText("war-streak","—");
          setText("war-longest","—");
        }
      }

      if(document.getElementById("home-war-record")){
        setClass("home-war-record","record-green", false);
        setClass("home-war-last10","record-green", false);

        if(warObj){
          const w = warObj.wins ?? 0;
          const l = warObj.losses ?? 0;
          const t = warObj.ties ?? 0;

          const rec = fmtWLTWithPctNums(w,l,t);
          setText("home-war-record", rec.text);
          setClass("home-war-record","record-green", hasNoLosses(rec.losses));

          const l10 = fmtWLTWithPctObj(warObj.last10);
          setText("home-war-last10", l10.text);
          setClass("home-war-last10","record-green", hasNoLosses(l10.losses));

          setText("home-war-streak", `${warObj.currentStreak ?? "—"}`);
          setText("home-war-longest", `${warObj.longestStreak ?? "—"}`);
        } else {
          setText("home-war-record","—");
          setText("home-war-last10","—");
          setText("home-war-streak","—");
          setText("home-war-longest","—");
        }
      }
    }

    // =========================
    // CWL render helpers
    // =========================
    function getWarsCompleted(payload){
      const warLimit = getActiveWarLimit(payload); // 1..7 or null
    
      // If CWL ended, all 7 wars are completed.
      if(String(payload?.state || "").toLowerCase() === "ended") return 7;
    
      // If we don't know the active war yet, assume none completed.
      if(!warLimit || !isFinite(warLimit)) return 0;
    
      // Exclude the active war day
      return Math.max(0, Math.floor(warLimit) - 1);
    }

    function ensureCwlSelectBound(){
      const sel = document.getElementById("cwlSeasonSelect");
      if(!sel) return;
      if(sel.dataset.bound === "1") return;

      sel.addEventListener("change", () => {
        const v = sel.value || CWL_ALL_TIME_KEY;
        cwlSelected = v;
        try{ localStorage.setItem(CWL_SELECTED_KEY, cwlSelected); }catch(e){}
        loadCwlSelected();
      });


      sel.dataset.bound = "1";
    }

    function ensureCwlMembersSortBound(){
      const sel = document.getElementById("cwlMembersSortSelect");
      if(!sel) return;

      sel.value = cwlMembersSortMode;
      updateSortButtonLabel("cwlMembersSortSelect", "cwlMembersSortLabel", "Attack Rank");

      if(sel.dataset.bound === "1") return;
      sel.addEventListener("change", () => {
        cwlMembersSortMode = sel.value || "rank";
        updateSortButtonLabel("cwlMembersSortSelect", "cwlMembersSortLabel", "Attack Rank");
        renderCwlContent();
      });
      sel.dataset.bound = "1";
    }

    function renderCwlSeasonSelect(){
      const sel = document.getElementById("cwlSeasonSelect");
      if(!sel) return;
    
      ensureCwlSelectBound();
    
      const seasons = Array.isArray(cwlIndex?.seasons) ? cwlIndex.seasons : [];
    
      // ✅ get current CWL identity
      const curTitle = String(cwlCurrent?.title || "").trim();
      const curKey   = String(cwlCurrent?.seasonKey || cwlCurrent?.meta?.seasonKey || "").trim();
      const curState = String(cwlCurrent?.state || "").toLowerCase();
    
      const cwlActive = !!(curTitle && curState !== "notincwl");
    
        
      // ✅ months sorted newest->oldest by key
      const months = seasons
        .map(s => ({
          value: String(s?.seasonKey || "").trim(),
          label: String(s?.title || s?.seasonKey || "").trim()
        }))
        .filter(o => o.value)
        .sort((a,b) => String(b.value).localeCompare(String(a.value)));
    
      // ✅ if active and month isn't in index yet, inject it
      if(cwlActive && curKey){
        const already = months.some(m => m.value === curKey);
        if(!already){
          months.unshift({ value: curKey, label: curTitle || curKey });
        } else {
          const idx = months.findIndex(m => m.value === curKey);
          if(idx >= 0 && curTitle) months[idx].label = curTitle;
        }
      }
    
      // ✅ build final options in required order
      const opts = [];
      opts.push({ value: CWL_ALL_TIME_KEY, label: "All-Time" });
      opts.push(...months);
    
      // ✅ de-dupe
      const seen = new Set();
      const finalOpts = [];
      for(const o of opts){
        if(seen.has(o.value)) continue;
        seen.add(o.value);
        finalOpts.push(o);
      }
    
      sel.innerHTML = finalOpts
        .map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
        .join("");
    
      // ✅ default selection:
      // active -> current month key
      // inactive -> all_time
      let defaultKey = CWL_ALL_TIME_KEY;
      if(cwlActive && curKey) defaultKey = curKey;
    
      // if stored selection missing, fallback
      const hasStored = finalOpts.some(o => o.value === cwlSelected);
      cwlSelected = hasStored ? cwlSelected : defaultKey;
    
      sel.value = cwlSelected;
    
      // update title label immediately
      const selLabel = finalOpts.find(o => o.value === sel.value)?.label || "CWL";
      setText("cwl-title-text", selLabel);
    
      // load data
      loadCwlSelected();
    }


    function loadCwlSelected(){
      const key = cwlSelected;
    
      // If selected is the active current month key, use live payload
      const curKey = String(cwlCurrent?.seasonKey || cwlCurrent?.meta?.seasonKey || "").trim();
      const curTitle = String(cwlCurrent?.title || "").trim();
      const curState = String(cwlCurrent?.state || "").toLowerCase();
    
      // Treat "active" as: has a title and is not "notInCwl"
      const cwlActive = !!(curTitle && curState !== "notincwl");
    
      if(cwlActive && curKey && key === curKey){
        cwlSelectedPayload = cwlCurrent;
        renderCwlContent();
        return;
      }
    
      // Otherwise fetch from history or rollups
      fetchCwlHistory(key);
    }

    
    function fmtNum(n, fallback="—"){
      if(n === null || n === undefined || n === "") return fallback;
      const x = Number(n);
      return isFinite(x) ? String(x) : fallback;
    }
    function fmt1(n, fallback="—"){
      if(n === null || n === undefined || n === "") return fallback;
      const x = Number(n);
      return isFinite(x) ? x.toFixed(1) : fallback;
    }
    
    function normCwlEntry(e, idx){
      if(!e || typeof e !== "object") return null;
    
      let warNum = (e.war != null) ? Number(e.war) : null;
      if((warNum == null || !isFinite(warNum)) && idx >= 0 && idx < 7) warNum = idx + 1;
      if(!isFinite(warNum) || warNum < 1 || warNum > 7) return null;
    
      const defName = (typeof e.defenderName === "string" ? e.defenderName.trim() : "") || "—";
      let oppRank = (e.defenderPos == null ? null : Number(e.defenderPos));
      oppRank = (oppRank != null && isFinite(oppRank)) ? Math.max(1, Math.round(oppRank)) : null;
    
      const stars = (e.stars === null || e.stars === undefined) ? null : Number(e.stars);
      const destruction = (e.destruction === null || e.destruction === undefined) ? null : Number(e.destruction);
    
      return {
        warNum,
        defName,
        oppRank,
        stars: (stars !== null && isFinite(stars)) ? stars : null,
        destruction: (destruction !== null && isFinite(destruction)) ? destruction : null
      };
    }
  
    
    function getStarsWithBonus(r){
      const sWB = pickNum(r, ["starsWithBonus","stars_plus_bonus","starsPlusBonus"]);
      if(sWB !== null) return sWB;

      const starsBase = pickNum(r, ["stars","starsNoBonus","stars_without_bonus","starsWithoutBonus"]);
      const wins = pickNum(r, ["wins"]) ?? 0;

      const bonus = pickNum(r, ["bonusStars","bonus","bonus_points","bonus_points_stars"]);
      if(starsBase !== null && bonus !== null) return starsBase + bonus;

      if(starsBase !== null) return starsBase + (wins * 10);
      return null;
    }

    function getOurCwlOppNames(payload){
      // returns ["", "", ...] length 7
      const out = Array(7).fill("");
    
      // Try common shapes
      const candidates =
        (Array.isArray(payload?.warDays) ? payload.warDays : null) ||
        (Array.isArray(payload?.days) ? payload.days : null) ||
        (Array.isArray(payload?.wars) ? payload.wars : null) ||
        (Array.isArray(payload?.rounds) ? payload.rounds : null) ||
        null;
    
      if(candidates){
        for(let i=0;i<Math.min(7, candidates.length);i++){
          const d = candidates[i];
          const nm =
            pick(d, ["opponentName","oppName","opponent","enemy","enemyClan","clanOpponent","vs"]) ||
            pick(d?.opponent, ["name"]) ||
            "";
          out[i] = String(nm || "").trim();
        }
      }
    
      // Also accept explicit array if you ever add it in python
      const explicit = Array.isArray(payload?.warOpponents) ? payload.warOpponents : null;
      if(explicit){
        for(let i=0;i<Math.min(7, explicit.length);i++){
          out[i] = String(explicit[i] || "").trim();
        }
      }
    
      return out;
    }

    function getActiveWarLimit(payload){
      // 1) Try explicit keys first
      let n =
        pickNum(payload, ["activeWarDay","currentWarDay","warDay","day","round","currentRound","matchDay"]) ??
        pickNum(payload?.meta, ["activeWarDay","currentWarDay","warDay","day","round"]) ??
        null;
    
      let fromMeta = null;
      if(n !== null && isFinite(n)){
        // normalize 0-based to 1-based
        fromMeta = (n >= 0 && n <= 6) ? (n + 1) : n;
        fromMeta = Math.max(1, Math.min(7, Math.floor(fromMeta)));
      }

  // 2) Fallback: infer from whatever wars/days actually exist in memberOverview
  let observedMax = null;
  const members = Array.isArray(payload?.memberOverview) ? payload.memberOverview : [];

  function inferWarNum(e, idx){
    let warNum = (e && e.war != null) ? Number(e.war) : null;
    if((warNum == null || !isFinite(warNum)) && e && e.day != null) warNum = Number(e.day);
    if((warNum == null || !isFinite(warNum)) && idx >= 0 && idx < 7) warNum = idx + 1;
    if(!isFinite(warNum) || warNum < 1 || warNum > 7) return null;
    return Math.floor(warNum);
  }

  function isMeaningful(e){
    if(!e || typeof e !== "object") return false;
    const opp = String(
      e.defenderName ?? e.defender ?? e.opponentName ?? e.opponent ?? e.target ?? e.oppName ?? ""
    ).trim();
    const hasOpp = opp && opp !== "—" && opp !== "-" && opp.toLowerCase() !== "n/a";

    const stars = (e.stars === null || e.stars === undefined) ? null : Number(e.stars);
    const destr = (e.destruction === null || e.destruction === undefined) ? null : Number(e.destruction);

    const hasStars = (stars !== null && isFinite(stars));
    const hasDestr = (destr !== null && isFinite(destr));

    return hasOpp || hasStars || hasDestr;
  }

  for(const m of members){
    const raw = Array.isArray(m?.wars) ? m.wars : (Array.isArray(m?.days) ? m.days : []);
    for(let idx=0; idx<raw.length; idx++){
      const e = raw[idx];
      if(!isMeaningful(e)) continue;
      const wn = inferWarNum(e, idx);
      if(wn == null) continue;
      observedMax = (observedMax == null) ? wn : Math.max(observedMax, wn);
    }
  }

  // 3) Final: prefer the larger of (meta limit) vs (observed limit)
  if(fromMeta == null && observedMax == null) return null;
  if(fromMeta == null) return observedMax;
  if(observedMax == null) return fromMeta;
  return Math.max(fromMeta, observedMax);
}
    function renderCwlRounds(payload){
      const mount = document.getElementById("cwl-rounds-mount");
      if(!mount) return;
    
      const rounds = Array.isArray(payload?.roundsOverview) ? payload.roundsOverview : [];
        // ✅ prevent flicker + prevent page jumping back to carousel on refresh
        const newHash = fnv1a32(JSON.stringify(rounds));
        const alreadyBuilt = !!mount.querySelector(".rounds-carousel");
        if(alreadyBuilt && cwlRoundsRenderHash === newHash){
          return;
        }
        cwlRoundsRenderHash = newHash;

      if(!rounds.length){
        mount.innerHTML = `<div class="cwl-note">No rounds data yet.</div>`;
        return;
      }
    
      function fmtAtk(used, total){
        const u = Number(used ?? 0);
        const t = Number(total ?? 0);
        if(!isFinite(u) || !isFinite(t)) return "—";
        return `${Math.floor(u)}/${Math.floor(t)}`;
      }
      function fmtPct(p){
        const x = Number(p);
        if(!isFinite(x)) return "—";
        return `${Math.round(x)}%`;
      }
      function fmtStars(s){
        const x = Number(s);
        if(!isFinite(x)) return "—";
        return `${Math.floor(x)}`;
      }
    
      function sideTint(w, side){
        const state = String(w?.state || "").toLowerCase();
        if(state !== "warended") return "rounds-neutral";
    
        const winner = String(w?.winner || "").toLowerCase();
        if(!winner || winner === "tie") return "rounds-neutral";
    
        const isWinner = (winner === side);
        return isWinner ? "rounds-win" : "rounds-lose";
      }
    
      function teamRowHtml(teamObj, tintClass){
        const name  = escapeHtml(teamObj?.name || "Team Name");
        const atk   = fmtAtk(teamObj?.attacksUsed, teamObj?.totalAttacks);
        const pct   = fmtPct(teamObj?.destruction);
        const stars = fmtStars(teamObj?.stars);
    
        return `
          <div class="rounds-side">
            <div class="rounds-name ${tintClass}" title="${name}">${name}</div>
        
            <div class="rounds-stats">
              <span class="rounds-stat">${escapeHtml(atk)} <span aria-hidden="true">⚔️</span></span>
              <span class="rounds-stat">${escapeHtml(pct)}</span>
              <span class="rounds-stat">${escapeHtml(stars)} <span aria-hidden="true">⭐</span></span>
            </div>
          </div>
        `;

      }
    
      function matchupHtml(w){
        const L = w?.clan || {};
        const R = w?.opponent || {};
    
        const lTint = sideTint(w, "clan");
        const rTint = sideTint(w, "opponent");
    
        return `
          <div class="rounds-match">
            ${teamRowHtml(L, lTint)}
            <div class="rounds-mid">vs</div>
            ${teamRowHtml(R, rTint)}
          </div>
        `;
      }
    
      // Build slides
      const slidesHtml = rounds.map(r => {
        const roundNum = Number(r?.round || 0) || 0;
        const wars = Array.isArray(r?.wars) ? r.wars : [];
    
        const matchups = wars.length
          ? wars.map(matchupHtml).join("")
          : `<div class="cwl-note">No wars yet.</div>`;
    
        return `
          <div class="rounds-slide">
            <div class="rounds-round">
              <div class="rounds-round-title">Round ${roundNum || "—"}</div>
              <div class="rounds-table">
                ${matchups}
              </div>
            </div>
          </div>
        `;
      }).join("");
    
      mount.innerHTML = `
        <div class="rounds-carousel" aria-label="CWL rounds carousel">
          <button class="rounds-arrow left" id="roundsPrev" aria-label="Previous round">‹</button>
          <div class="rounds-track" id="cwl-rounds-track" aria-label="Rounds track">
            ${slidesHtml}
          </div>
          <button class="rounds-arrow right" id="roundsNext" aria-label="Next round">›</button>
        </div>
      `;
    
      // enable your mouse dragscroll behavior
      enableDragScrollEverywhere();
    
      // init on current war day, else round 1
      setupRoundsCarousel(payload);
    }

    function setupRoundsCarousel(payload){
      const track = document.getElementById("cwl-rounds-track");
      const prevBtn = document.getElementById("roundsPrev");
      const nextBtn = document.getElementById("roundsNext");
      if(!track) return;
    
      const slides = Array.from(track.querySelectorAll(".rounds-slide"));
      if(!slides.length) return;
    
      // ✅ choose initial index:
      // - if user already scrolled/selected a round, STAY there
      // - otherwise, only once per CWL visit, jump to current war day
      let idx = 0;
      
      if(cwlRoundsSavedIndex !== null && isFinite(cwlRoundsSavedIndex)){
        idx = Math.max(0, Math.min(slides.length - 1, Math.floor(cwlRoundsSavedIndex)));
      } else if(!cwlRoundsDidInitThisVisit){
        const warLimit = getActiveWarLimit(payload); // 1..7 or null
        if(warLimit && isFinite(warLimit)){
          idx = Math.max(0, Math.min(slides.length - 1, Math.floor(warLimit) - 1));
        } else {
          idx = 0;
        }
        cwlRoundsDidInitThisVisit = true; // ✅ only do this once
      } else {
        idx = 0;
      }

      function setActiveSlideClass(activeIdx){
        slides.forEach((s, i) => s.classList.toggle("is-active", i === activeIdx));
      }
    
      function scrollToIndex(i, behavior="smooth"){
        const clamped = Math.max(0, Math.min(slides.length - 1, i));
        const s = slides[clamped];
      
        // ✅ Horizontal-only scroll — will NOT move the page vertically
        const targetLeft = s.offsetLeft - (track.clientWidth/2) + (s.clientWidth/2);
      
        track.scrollTo({
          left: targetLeft,
          behavior: (behavior === "auto" ? "auto" : "smooth")
        });
      
        updateButtons(clamped);
        idx = clamped;
      
        // ✅ remember what user is viewing
        cwlRoundsSavedIndex = clamped;
      
        // ✅ update dimming
        setActiveSlideClass(clamped);
      }


    
      function getClosestIndex(){
        const center = track.scrollLeft + (track.clientWidth / 2);
        let best = 0;
        let bestDist = Infinity;
    
        for(let i=0;i<slides.length;i++){
          const s = slides[i];
          const sCenter = s.offsetLeft + (s.clientWidth / 2);
          const d = Math.abs(sCenter - center);
          if(d < bestDist){ bestDist = d; best = i; }
        }
        return best;
      }
    
      function updateButtons(current){
        if(!prevBtn || !nextBtn) return;
        prevBtn.disabled = (current <= 0);
        nextBtn.disabled = (current >= slides.length - 1);
      }
    
      // Button clicks
      if(prevBtn && prevBtn.dataset.bound !== "1"){
        prevBtn.addEventListener("click", () => scrollToIndex(getClosestIndex() - 1, "smooth"));
        prevBtn.dataset.bound = "1";
      }
      if(nextBtn && nextBtn.dataset.bound !== "1"){
        nextBtn.addEventListener("click", () => scrollToIndex(getClosestIndex() + 1, "smooth"));
        nextBtn.dataset.bound = "1";
      }
    
      // When user scrolls/swipes, keep buttons accurate
      let t = null;
      track.addEventListener("scroll", () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const cur = getClosestIndex();
          updateButtons(cur);
      
          // ✅ remember where user stopped
          cwlRoundsSavedIndex = cur;
      
          // ✅ update dimming
          setActiveSlideClass(cur);
        }, 10);
      }, { passive:true });

    
      // Initial positioning (no animation)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToIndex(idx, "auto");
        });
      });
    
      // Keep snap sane on resize
      window.addEventListener("resize", () => {
        scrollToIndex(getClosestIndex(), "auto");
      }, { passive:true });
    }


    // =========================
    // ✅ CWL render
    // =========================
    function renderCwlContent(){
      if(!document.getElementById("cwl-title-text")) return;
    
      ensureCwlMembersSortBound();
    
      const payload = cwlSelectedPayload || cwlCurrent || null;
    
      // ============================================================
      // ✅ Rollup detection (All-Time / Year) + UI toggles
      // ============================================================
      const selectedKey = String(cwlSelected || "").trim();
      const payloadKey  = String(payload?.seasonKey || "").trim();

      const rollupKey =
        isCwlRollupKey(selectedKey) ? selectedKey :
        (isCwlRollupKey(payloadKey) ? payloadKey : null);

      const isRollup = !!rollupKey;
    
      // ✅ allow CSS to hide WAR columns + hide sections
      document.body.classList.toggle("cwl-rollup", isRollup);
    
      // These require you to have wrappers with these IDs in renderCwlPage():
      // <div id="cwl-league-section"> ... league overview ... </div>
      // <div id="cwl-rounds-section"> ... rounds ... </div>
      const leagueSec = document.getElementById("cwl-league-section");
      const roundsSec = document.getElementById("cwl-rounds-section");
      if(leagueSec) leagueSec.style.display = isRollup ? "none" : "";
      if(roundsSec) roundsSec.style.display = isRollup ? "none" : "";
    
      // ============================================================
      // ✅ Current month/monthly pages: keep behavior exactly the same
      // ✅ Rollups: do NOT render rounds
      // ============================================================
      if(payload && !isRollup) renderCwlRounds(payload);
    
      const title = payload?.title || "CWL";
      setText("cwl-title-text", title);
    
      // ✅ League name (fix stuck "Loading...")
      const leagueName =
        pick(payload, ["leagueName","league","cwlLeague","cwl_league"]) ||
        pick(payload?.meta, ["leagueName","league","cwlLeague"]) ||
        pick(payload?.league, ["name","leagueName"]) ||
        pick(payload?.group, ["league","leagueName"]) ||
        "—";
      const leagueDisplayName = (selectedKey === CWL_ALL_TIME_KEY && clanStats?.cwl?.currentLeague)
        ? clanStats.cwl.currentLeague
        : leagueName;

      setText("cwl-league-name", leagueDisplayName);

      // ============================================================
      // League overview (MONTHLY ONLY)
      // ============================================================
      const leagueBody = document.getElementById("cwl-leagueoverview-body");
      if(leagueBody){
    
        // Rollups: hidden anyway, don't render it
        if(isRollup){
          leagueBody.innerHTML = "";
        } else {
    
          const rows =
            (Array.isArray(payload?.leagueOverview) ? payload.leagueOverview : null) ||
            (Array.isArray(payload?.league_overview) ? payload.league_overview : null) ||
            (Array.isArray(payload?.league?.clans) ? payload.league.clans : null) ||
            (Array.isArray(payload?.clans) ? payload.clans : null) ||
            [];
    
          function normLeagueRow(r){
            if(!r || typeof r !== "object") return { rank:null, name:"—", wins:0, stars:null, destr:null };
    
            const rank =
              pickNum(r, ["rank","position","place"]) ??
              pickNum(r?.clan, ["rank","position","place"]) ??
              null;
    
            const name =
              pick(r, ["name","clanName","clan_name"]) ||
              pick(r?.clan, ["name","clanName","clan_name"]) ||
              "—";
    
            const wins =
              pickNum(r, ["wins","warWins","matchWins","roundWins","won"]) ??
              pickNum(r?.stats, ["wins","warWins","matchWins"]) ??
              pickNum(r?.warStats, ["wins"]) ??
              pickNum(r?.clan?.stats, ["wins","warWins","matchWins"]) ??
              0;
    
            let stars =
              pickNum(r, ["starsWithBonus","stars_plus_bonus","starsPlusBonus"]) ??
              pickNum(r?.stats, ["starsWithBonus","starsPlusBonus"]) ??
              pickNum(r?.warStats, ["starsWithBonus","starsPlusBonus"]) ??
              pickNum(r, ["totalStars","starsTotal","stars","total_stars"]) ??
              pickNum(r?.stats, ["totalStars","starsTotal","stars"]) ??
              pickNum(r?.clan?.stats, ["totalStars","starsTotal","stars"]) ??
              null;
    
            const destr =
              pickNum(r, ["destructionTotal","destruction","destructionPct","destructionPercentage","destruction_total"]) ??
              pickNum(r?.stats, ["destructionTotal","destruction","destructionPercentage"]) ??
              pickNum(r?.warStats, ["destructionTotal","destruction","destructionPercentage"]) ??
              pickNum(r?.clan?.stats, ["destructionTotal","destruction","destructionPercentage"]) ??
              null;
    
            return { rank, name, wins, stars, destr };
          }
    
          if(!rows.length){
            leagueBody.innerHTML = `<tr><td colspan="8" style="opacity:.75; text-align:center; padding:12px;">No league data yet.</td></tr>`;
          } else {
            leagueBody.innerHTML = rows.map(rr => {
              const r = normLeagueRow(rr);
    
              const warsCompleted =
                pickNum(payload?.meta, ["warsCompleted"]) ??
                getWarsCompleted(payload);
    
              const teamSize =
                pickNum(payload, ["teamSize","size"]) ??
                pickNum(payload?.meta, ["teamSize","size"]) ??
                15;
    
              const maxStarsPerWar = Math.max(0, (teamSize|0) * 3);
    
              const destrEnded =
                pickNum(rr, ["destructionEndedTotal","destruction_ended_total"]) ??
                pickNum(rr?.stats, ["destructionEndedTotal"]) ??
                pickNum(rr?.warStats, ["destructionEndedTotal"]) ??
                null;
    
              const starsEndedNoBonus =
                pickNum(rr, ["starsEndedTotal","stars_ended_total"]) ??
                pickNum(rr?.stats, ["starsEndedTotal"]) ??
                pickNum(rr?.warStats, ["starsEndedTotal"]) ??
                null;
    
              const starsAgainstEnded =
                pickNum(rr, ["starsAgainstEndedTotal","stars_against_ended_total"]) ??
                pickNum(rr?.stats, ["starsAgainstEndedTotal"]) ??
                pickNum(rr?.warStats, ["starsAgainstEndedTotal"]) ??
                null;
    
              const avgPctVal = (warsCompleted > 0 && destrEnded !== null) ? (Number(destrEnded) / warsCompleted) : null;
              const avgPctOut = (avgPctVal === null || !isFinite(avgPctVal)) ? "—" : avgPctVal.toFixed(1);
    
              const avgStarsVal = (warsCompleted > 0 && starsEndedNoBonus !== null) ? (Number(starsEndedNoBonus) / warsCompleted) : null;
              const avgStarsOut = (avgStarsVal === null || !isFinite(avgStarsVal)) ? "—" : `${avgStarsVal.toFixed(1)}/${maxStarsPerWar}`;
    
              const avgDefVal = (warsCompleted > 0 && starsAgainstEnded !== null) ? (Number(starsAgainstEnded) / warsCompleted) : null;
              const avgDefOut = (avgDefVal === null || !isFinite(avgDefVal)) ? "—" : `${avgDefVal.toFixed(1)}/${maxStarsPerWar}`;
    
              const rankOut = (r.rank === null) ? "—" : fmtNum(r.rank, "—");
              const nameOut = escapeHtml(r.name || "—");
              const winsOut = `${fmtNum(r.wins, "0")}/${fmtNum(warsCompleted, "0")}`;
    
              let starsOut = r.stars;
              if(starsOut === null){
                const fallbackStarsWithBonus = getStarsWithBonus(rr);
                starsOut = (fallbackStarsWithBonus === null ? null : fallbackStarsWithBonus);
              }
    
              const destrOut = (r.destr === null) ? "—" : fmt1(r.destr, "—");
    
              const rankNum = (r.rank === null) ? null : Number(r.rank);
              const rowClass =
                (rankNum === 1) ? "rank-good" :
                ((rankNum === 7 || rankNum === 8) ? "rank-bad" : "");
    
              return `
                <tr class="${rowClass}">
                  <td class="sticky-1 mono">${rankOut}</td>
                  <td class="sticky-2 left" title="${nameOut}">${nameOut}</td>
                  <td class="mono">${winsOut}</td>
                  <td class="mono bold">${starsOut === null ? "—" : fmtNum(starsOut, "—")}</td>
                  <td class="mono">${destrOut}</td>
                  <td class="mono">${avgStarsOut}</td>
                  <td class="mono">${avgPctOut}</td>
                  <td class="mono">${avgDefOut}</td>
          </tr>
        `;
      }).join("");

      requestAnimationFrame(updateStickyOffsets);
    }
        }
      }
    
      // ============================================================
      // Member overview (MONTHLY + ROLLUPS)
      // (unchanged logic; rollup hides war cols via CSS)
      // ============================================================
      const memberBody = document.getElementById("cwl-memberoverview-body");
      if(memberBody){
        const members = Array.isArray(payload?.memberOverview) ? payload.memberOverview : [];
        if(!members.length){
          const msg = (payload?.state === "notInCwl") ? "Not in CWL right now." : "No member data yet.";
          memberBody.innerHTML = `<tr><td colspan="30" style="opacity:.75; text-align:center; padding:12px;">${escapeHtml(msg)}</td></tr>`;
        } else {
          const warLimit = getActiveWarLimit(payload);
    
          for(let i=0; i<members.length; i++){
            members[i].__rowNum = i + 1;
          }
    
          const sorted = members.slice().sort((a,b)=>{
            const ar = Number(a?.avgRankAttacked ?? a?.avgRank ?? a?.rank ?? 9999);
            const br = Number(b?.avgRankAttacked ?? b?.avgRank ?? b?.rank ?? 9999);
    
            const aDef = Number(a?.avgDefRank ?? a?.avgDefenseRank ?? a?.avgDefensiveRank ?? 999999);
            const bDef = Number(b?.avgDefRank ?? b?.avgDefenseRank ?? b?.avgDefensiveRank ?? 999999);
    
            const aTotalStars = Number(a?.totalStars ?? 0);
            const bTotalStars = Number(b?.totalStars ?? 0);
    
            const aTotalPct = Number(a?.totalDestruction ?? a?.totalPct ?? a?.totalPercent ?? 0);
            const bTotalPct = Number(b?.totalDestruction ?? b?.totalPct ?? b?.totalPercent ?? 0);
    
            const aAvgStars = Number(a?.avgStars ?? 0);
            const bAvgStars = Number(b?.avgStars ?? 0);
    
            const aAvgPct = Number(a?.avgDestruction ?? a?.avgPct ?? a?.avgPercent ?? 0);
            const bAvgPct = Number(b?.avgDestruction ?? b?.avgPct ?? b?.avgPercent ?? 0);
    
            const nameCmp = String(a?.name||"").localeCompare(String(b?.name||""));
    
            if(cwlMembersSortMode === "rank"){
              if(isFinite(ar) && isFinite(br) && ar !== br) return ar - br;
              if(bTotalStars !== aTotalStars) return bTotalStars - aTotalStars;
              if(bTotalPct !== aTotalPct) return bTotalPct - aTotalPct;
              return nameCmp;
            }
            if(cwlMembersSortMode === "defRank"){
              if(isFinite(aDef) && isFinite(bDef) && aDef !== bDef) return aDef - bDef;
              if(bAvgStars !== aAvgStars) return bAvgStars - aAvgStars;
              if(bTotalStars !== aTotalStars) return bTotalStars - aTotalStars;
              if(bTotalPct !== aTotalPct) return bTotalPct - aTotalPct;
              return nameCmp;
            }
            if(cwlMembersSortMode === "totalStars"){
              if(bTotalStars !== aTotalStars) return bTotalStars - aTotalStars;
              if(bTotalPct !== aTotalPct) return bTotalPct - aTotalPct;
              if(isFinite(ar) && isFinite(br) && ar !== br) return ar - br;
              return nameCmp;
            }
            if(cwlMembersSortMode === "totalPct"){
              if(bTotalPct !== aTotalPct) return bTotalPct - aTotalPct;
              if(bTotalStars !== aTotalStars) return bTotalStars - aTotalStars;
              if(isFinite(ar) && isFinite(br) && ar !== br) return ar - br;
              return nameCmp;
            }
            if(cwlMembersSortMode === "avgStars"){
              if(bAvgStars !== aAvgStars) return bAvgStars - aAvgStars;
              if(bAvgPct !== aAvgPct) return bAvgPct - aAvgPct;
              if(isFinite(ar) && isFinite(br) && ar !== br) return ar - br;
              return nameCmp;
            }
            if(cwlMembersSortMode === "avgPct"){
              if(bAvgPct !== aAvgPct) return bAvgPct - aAvgPct;
              if(bTotalStars !== aTotalStars) return bTotalStars - aTotalStars;
              if(isFinite(ar) && isFinite(br) && ar !== br) return ar - br;
              return nameCmp;
            }
            if(isFinite(ar) && isFinite(br) && ar !== br) return ar - br;
            return nameCmp;
          });
    
          memberBody.innerHTML = sorted.map((m, idx) => {
            let avgAtkRkVal = null;
            let avgAtkRk = "—";
            let avgDefRk = "—";
    
            const nm = escapeHtml(m.name || "—");
    
            const totStars = pickNum(m, ["totalStars","starsTotal","total_stars"]) ?? 0;
            const totDes = pickNum(m, ["totalDestruction","totalPct","totalPercent","total_destruction"]) ?? 0;
    
            const avgStarsVal = pickNum(m, ["avgStars","avg_stars"]);
            const avgStars = (avgStarsVal === null) ? "—" : fmt1(avgStarsVal, "—");
    
            const avgDesVal = pickNum(m, ["avgDestruction","avgPct","avgPercent","avg_destruction"]);
            const isPerfect =
              (avgStarsVal !== null && isFinite(avgStarsVal) && avgStarsVal >= 3.0) ||
              (avgDesVal !== null && isFinite(avgDesVal) && avgDesVal >= 100.0);
    
            const rowClass = isPerfect ? "cwl-perfect" : "";
            const avgDes = (avgDesVal === null) ? "—" : fmt1(avgDesVal, "—");
    
            const entriesRaw = Array.isArray(m.wars) ? m.wars : (Array.isArray(m.days) ? m.days : []);
            const entries = [];
            for(let j=0; j<entriesRaw.length; j++){
              const n = normCwlEntry(entriesRaw[j], j);
              if(n) entries.push(n);
            }
    
            const byWar = new Map();
            for(const e of entries){
              if(!byWar.has(e.warNum)) byWar.set(e.warNum, e);
            }
    
            const atkMade = pickNum(m, ["attacksMade","attacks","attacks_made"]) ?? 0;
            const warsInLineup = pickNum(m, ["warsInLineup","wars_in_lineup"]) ?? null;
    
            // ✅ 🗡️RK
            {
              const limit = warLimit || 0;
              const repairedRanks = [];
    
              for(let warNum=1; warNum<=7; warNum++){
                if(warNum > limit) continue;
                const e = byWar.get(warNum);
                if(!e) continue;
    
                const attacked =
                  (e.stars !== null && isFinite(e.stars)) ||
                  (e.destruction !== null && isFinite(e.destruction));
                if(!attacked) continue;
    
                let rk = (e.oppRank !== null && isFinite(e.oppRank)) ? Math.max(1, Math.round(e.oppRank)) : null;
                if(rk === null) continue;
    
                repairedRanks.push(rk);
              }
    
              if(repairedRanks.length){
                const sum = repairedRanks.reduce((a,b)=>a+b,0);
                avgAtkRkVal = sum / repairedRanks.length;
                avgAtkRk = fmt1(avgAtkRkVal, "—");
              } else {
                const provided = pickNum(m, ["avgRankAttacked","avgAttackRank","avgAtkRank","avg_attacked_rank","avg_rank_attacked"]);
                if(provided !== null && isFinite(provided)){
                  avgAtkRkVal = provided;
                  avgAtkRk = fmt1(avgAtkRkVal, "—");
                } else {
                  avgAtkRk = "—";
                }
              }
            }
    
            // ✅ 🛡️RK
            {
              const provided = pickNum(m, ["avgDefRank","avgDefenseRank","avgDefensiveRank","avg_def_rank","avg_defensive_rank"]);
              avgDefRk = fmt1(provided, "—");
            }
    
            const byWarCountUpToLimit = (() => {
              if(!warLimit) return 0;
              let c = 0;
              for(const k of byWar.keys()){
                if(k <= warLimit) c++;
              }
              return c;
            })();
    
            let denom;
            if(warsInLineup !== null && isFinite(warsInLineup) && warsInLineup >= 0){
              denom = warsInLineup;
              if(warLimit) denom = Math.min(denom, warLimit);
              denom = Math.max(denom, atkMade);
            } else {
              denom = Math.max(byWarCountUpToLimit, atkMade);
            }
    
            const atkFrac = `${fmtNum(atkMade,"0")}/${fmtNum(denom,"0")}`;
    
            const warCells = [];
            for(let i=1;i<=7;i++){
              const e = byWar.get(i) || null;
              const isActiveWarDay = (warLimit && i <= warLimit);
    
              let oppText = "—";
    
              const sVal = (e && e.stars !== null && isFinite(e.stars)) ? e.stars : null;
              const pVal = (e && e.destruction !== null && isFinite(e.destruction)) ? e.destruction : null;
    
              const attacked = (sVal !== null) || (pVal !== null);
    
              if (e && isActiveWarDay && attacked) {
                const rk =
                  (e.oppRank !== null && isFinite(e.oppRank))
                    ? Math.max(1, Math.round(e.oppRank))
                    : null;
    
                const nm2 = String(e.defName || "—").trim() || "—";
    
                if (rk !== null && nm2 !== "—") {
                  oppText = `${rk}. ${nm2}`;
                }
              }
    
              const opp = escapeHtml(oppText);
              const s = (sVal === null) ? "—" : fmtNum(sVal, "—");
              const p = (pVal === null) ? "—" : fmt1(pVal, "—");
    
              warCells.push(`<td class="left mono cwl-warcell cwl-day-start" title="${opp}">${opp}</td>`);
              warCells.push(`<td class="mono cwl-warcell">${s}</td>`);
              warCells.push(`<td class="mono cwl-warcell cwl-day-end">${p}</td>`);
            }
    
            return `
              <tr class="${rowClass}">
                <td class="sticky-1 mono">${idx + 1}</td>
                <td class="sticky-2 left" title="${nm}">${nm}</td>
    
                <td class="mono cwl-rk">${avgAtkRk}</td>
                <td class="mono cwl-rk">${avgDefRk}</td>
    
                <td class="mono bold">${fmtNum(totStars, "0")}</td>
                <td class="mono">${fmt1(totDes, "0.0")}</td>
                <td class="mono">${avgStars}</td>
                <td class="mono">${avgDes}</td>
                <td class="mono cwl-general-sep">${escapeHtml(atkFrac)}</td>
    
                ${warCells.join("")}
              </tr>
            `;
          }).join("");
        }
      }
    
      // ✅ Fill ⚔️ header opponent names (MONTHLY ONLY)
      if(payload && !isRollup){
        const oppNames = getOurCwlOppNames(payload);
        for(let i=1;i<=7;i++){
          const id = `cwl-war-oppname-${i}`;
          const nm = oppNames[i-1] || "";
          setText(id, nm);
        }
      }
    
      enableDragScrollEverywhere();
    
      // ✅ show scroll hint only when League Overview overflows (MONTHLY ONLY)
      if(!isRollup){
        setScrollHintIfScrollable("cwl-league-wrap", "cwl-league-scroll-inline");
      }

      requestAnimationFrame(updateStickyOffsets);
    }


    // =========================
    // Loops per route
    // =========================
    // These timers are intentionally kept per-section to preserve update cadence.
    // Home page fetch cadence
    function startHomeLoop(){
      clearIntervals(homeIntervals);
      membersSortMode = "role";
      fetchClanStats();
      fetchMembersData();
      homeIntervals.push(setInterval(fetchClanStats, 5000));
      homeIntervals.push(setInterval(fetchMembersData, 10000));
    }

    // War page fetch cadence + re-render loop
    function startWarLoop(){
      clearIntervals(warIntervals);
      warFetched = false;
      warDetailFetched = false;

      fetchClanStats();
      fetchWarData();
      fetchWarDetail();

      warIntervals.push(setInterval(fetchClanStats, 5000));
      warIntervals.push(setInterval(fetchWarData, 5000));
      warIntervals.push(setInterval(fetchWarDetail, 5000));
      warIntervals.push(setInterval(renderWarSection, 1000));
    }

    // More page timer loop (countdowns only)
    function startMoreLoop(){
      clearIntervals(moreIntervals);
      updateRecurringTimers();
      moreIntervals.push(setInterval(updateRecurringTimers, 1000));
    }

    // CWL page fetch cadence + carousel reset
    function startCwlLoop(){
      clearIntervals(cwlIntervals);
    
      cwlMembersSortMode = "rank";
    
      // ✅ reset carousel state ONLY when entering CWL page
      cwlRoundsSavedIndex = null;
      cwlRoundsDidInitThisVisit = false;
      cwlRoundsRenderHash = null; // ✅ allow first build when entering CWL
    
      fetchClanStats();
      fetchCwlIndex();
      fetchCwlCurrent();


      cwlIntervals.push(setInterval(fetchClanStats, 15000));
      cwlIntervals.push(setInterval(fetchCwlCurrent, 5000));
      cwlIntervals.push(setInterval(fetchCwlIndex, 60000));

    }

    // =========================
    // More page timers
    // =========================
    // Uses UTC so dates match in-game schedule.
    function makeUTC(y,m,d,h,mi=0){ return new Date(Date.UTC(y,m,d,h,mi,0)); }

    function getNextRaidWeekendEnd(now){
      const day = now.getUTCDay();
      const diffToFriday = (5 - day + 7) % 7;
      let fridayStart = makeUTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToFriday, 7);
      let mondayEnd = new Date(fridayStart.getTime() + 3*24*60*60*1000);
      if(now >= fridayStart && now <= mondayEnd) return mondayEnd;
      if(now > mondayEnd){
        fridayStart = new Date(fridayStart.getTime() + 7*24*60*60*1000);
        mondayEnd = new Date(fridayStart.getTime() + 3*24*60*60*1000);
      }
      return mondayEnd;
    }
    function getNextClanGamesEnd(now){
      const y=now.getUTCFullYear(), m=now.getUTCMonth();
      const start = makeUTC(y,m,22,8);
      const end   = makeUTC(y,m,28,8);
      if(now < start) return end;
      if(now <= end) return end;
      const nextMonth = new Date(Date.UTC(y, m+1, 1));
      return makeUTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), 28, 8);
    }
    function getNextSeasonEnd(now){ return makeUTC(now.getUTCFullYear(), now.getUTCMonth()+1, 1, 8); }
    function getNextLeagueReset(now){
      const y=now.getUTCFullYear(), m=now.getUTCMonth();
      let first = makeUTC(y,m,1,5);
      const diffToMonday = (1 - first.getUTCDay() + 7) % 7;
      let reset = makeUTC(y,m,1+diffToMonday,5);
      if(now > reset){
        const nm = new Date(Date.UTC(y, m+1, 1));
        let firstNext = makeUTC(nm.getUTCFullYear(), nm.getUTCMonth(), 1, 5);
        const diffNext = (1 - firstNext.getUTCDay() + 7) % 7;
        reset = makeUTC(nm.getUTCFullYear(), nm.getUTCMonth(), 1+diffNext, 5);
      }
      return reset;
    }
    function updateRecurringTimers(){
      if(!document.getElementById("raid-timer")) return;
      const now = new Date();
      setText("raid-timer", formatCountdown(getNextRaidWeekendEnd(now) - now));
      setText("clan-games-timer", formatCountdown(getNextClanGamesEnd(now) - now));
      setText("season-end-timer", formatCountdown(getNextSeasonEnd(now) - now));
      setText("league-reset-timer", formatCountdown(getNextLeagueReset(now) - now));
    }

    // =========================
    // Router
    // =========================
    // Hash-based routing; keeps route changes synchronous.
    function setDocTitle(route){
      const map = {
        home:"B•A•S•E•D — Home",
        cwl:"B•A•S•E•D — CWL",
        war:"B•A•S•E•D — War",
        mystats:"B•A•S•E•D — My Stats",
        more:"B•A•S•E•D — More"
      };
      document.title = map[route] || "B•A•S•E•D";
    }

    // Render the route, wire UI, and start the correct data loop
    function renderRoute(){
      const route = normalizeRoute(location.hash);

      setupNavUI();
      setActiveNav(route);
      applyPwaImageIconStates(route);
      setDocTitle(route);

      clearIntervals(homeIntervals);
      clearIntervals(warIntervals);
      clearIntervals(moreIntervals);
      clearIntervals(cwlIntervals);

      app.innerHTML = renderRouteContent(route);

      enableDragScrollEverywhere();
      requestAnimationFrame(updateStickyOffsets);

      if(route === "home") startHomeLoop();
      if(route === "war")  startWarLoop();
      if(route === "more") startMoreLoop();
      if(route === "cwl")  startCwlLoop();

      if(isPwaInstalled()) bindPwaTabbarAutoHide();
    }

    // Initial boot: ensure a hash and render once
    if(!location.hash) location.hash = "#/home";
    setupNavUI();
    initPullToRefresh();
    renderRoute();

    // Keep view in sync with navigation + lifecycle events
    window.addEventListener("hashchange", renderRoute);
    window.addEventListener("pageshow", renderRoute);
    window.addEventListener("resize", () => {
      requestAnimationFrame(updateStickyOffsets);
    }, { passive:true });
    document.addEventListener("visibilitychange", () => {
      if(document.visibilityState === "visible") renderRoute();
    });

    // Surface global errors in the war chart mount (non-fatal)
    window.addEventListener("error", (e) => {
      const mount = document.getElementById("war-chart-mount");
      if(mount){
        mount.innerHTML = `<div class="muted" style="text-align:center;font-family:monospace;font-size:12px;">
          JS Error: ${escapeHtml(e.message || "unknown")}
        </div>`;
      }
    });
    // Surface unhandled promise rejections similarly
    window.addEventListener("unhandledrejection", (e) => {
      const mount = document.getElementById("war-chart-mount");
      if(mount){
        mount.innerHTML = `<div class="muted" style="text-align:center;font-family:monospace;font-size:12px;">
          Promise Error: ${escapeHtml(String(e.reason || "unknown"))}
        </div>`;
      }
    });
  
