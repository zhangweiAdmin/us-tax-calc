let drawerUi = null;
let activeDrawerTrigger = null;
let drawerHideTimer = null;
let navOverflowSyncRaf = null;

const NAV_MOBILE_BREAKPOINT = 980;

function normalizeNavPathname(pathname) {
  const raw = String(pathname || "/").trim() || "/";
  if (raw === "/") return "/";
  return raw.replace(/\/+$/, "") || "/";
}

function navPathnameFromHref(href) {
  if (!href || !href.startsWith("/")) return null;
  try {
    const url = new URL(href, window.location.origin);
    return normalizeNavPathname(url.pathname);
  } catch {
    return null;
  }
}

function isNavPathActive(currentPath, targetPath) {
  if (!targetPath) return false;
  if (targetPath === currentPath) return true;
  if (targetPath === "/articles" && currentPath.startsWith("/articles/")) return true;
  return false;
}

function isMobileNavMode() {
  return window.matchMedia(`(max-width: ${NAV_MOBILE_BREAKPOINT}px)`).matches;
}

function getNavInnerWidth(nav) {
  const rect = nav.getBoundingClientRect();
  const style = window.getComputedStyle(nav);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
  const borderRight = Number.parseFloat(style.borderRightWidth) || 0;

  return Math.max(0, rect.width - paddingLeft - paddingRight - borderLeft - borderRight);
}

function applyNavActiveState() {
  const currentPath = normalizeNavPathname(window.location.pathname);
  const links = Array.from(document.querySelectorAll(".site-nav-link[href^='/']"));

  for (const link of links) {
    const targetPath = navPathnameFromHref(link.getAttribute("href"));
    const active = isNavPathActive(currentPath, targetPath);
    link.classList.toggle("is-active", active);

    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }
}

function collectLinksFromList(list, { hiddenOnly = false } = {}) {
  if (!list) return [];

  const seen = new Set();
  const links = [];
  const items = Array.from(list.children);

  for (const item of items) {
    if (!(item instanceof HTMLElement)) continue;
    if (hiddenOnly && !item.hidden) continue;

    const anchor = item.querySelector("a[href^='/']");
    if (!anchor) continue;

    const href = anchor.getAttribute("href");
    const text = String(anchor.textContent || "").trim();
    const path = navPathnameFromHref(href);
    if (!href || !text || !path) continue;
    if (seen.has(path)) continue;

    seen.add(path);
    links.push({ href, text, path });
  }

  return links;
}

function collectDrawerLinks(nav) {
  const primaryList = nav.querySelector(".site-nav-list-primary");
  const secondaryList = nav.querySelector(".site-nav-list-secondary");
  const links = [];
  const seen = new Set();

  const appendLinks = (items) => {
    for (const item of items) {
      if (seen.has(item.path)) continue;
      seen.add(item.path);
      links.push(item);
    }
  };

  appendLinks(collectLinksFromList(primaryList, { hiddenOnly: true }));
  appendLinks(collectLinksFromList(secondaryList));

  return links;
}

function syncPrimaryNavOverflow(nav) {
  const primaryList = nav.querySelector(".site-nav-list-primary");
  const secondaryList = nav.querySelector(".site-nav-list-secondary");
  const toggle = nav.querySelector(".nav-mobile-toggle");
  if (!primaryList || !secondaryList || !toggle) return;

  const items = Array.from(primaryList.children).filter((item) => item instanceof HTMLElement);
  for (const item of items) {
    item.hidden = false;
  }

  let needsMore = false;

  if (isMobileNavMode()) {
    const availableWidth = getNavInnerWidth(nav);
    if (availableWidth > 0 && items.length > 0) {
      const gapValue = getComputedStyle(primaryList).columnGap || getComputedStyle(primaryList).gap || "0";
      const gap = Number.parseFloat(gapValue) || 0;
      let usedWidth = 0;
      let visibleCount = 0;

      for (const item of items) {
        const itemWidth = item.getBoundingClientRect().width;
        const nextWidth = visibleCount === 0 ? itemWidth : usedWidth + gap + itemWidth;

        if (nextWidth <= availableWidth + 0.5) {
          usedWidth = nextWidth;
          visibleCount += 1;
        } else {
          item.hidden = true;
        }
      }

      if (visibleCount === 0 && items.length > 0) {
        items[0].hidden = false;
      }

      needsMore = items.some((item) => item.hidden);
    }
  }

  nav.classList.toggle("site-nav-needs-more", needsMore);
  toggle.hidden = !needsMore;

  if (!needsMore && activeDrawerTrigger === toggle) {
    closeDrawer();
  }
}

function syncAllPrimaryNavOverflow() {
  const navs = Array.from(document.querySelectorAll(".site-nav.site-nav-has-more"));
  for (const nav of navs) {
    syncPrimaryNavOverflow(nav);
  }
}

function schedulePrimaryNavOverflowSync() {
  if (navOverflowSyncRaf !== null) return;

  navOverflowSyncRaf = window.requestAnimationFrame(() => {
    navOverflowSyncRaf = null;
    syncAllPrimaryNavOverflow();
  });
}

function ensureDrawerUi() {
  if (drawerUi) return drawerUi;

  const overlay = document.createElement("div");
  overlay.className = "nav-drawer-overlay";
  overlay.hidden = true;

  const drawer = document.createElement("aside");
  drawer.className = "nav-drawer";
  drawer.hidden = true;
  drawer.setAttribute("aria-label", "More navigation links");

  const head = document.createElement("div");
  head.className = "nav-drawer-head";

  const title = document.createElement("p");
  title.className = "nav-drawer-title";
  title.textContent = "More";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "nav-drawer-close";
  close.textContent = "Close";

  const list = document.createElement("ul");
  list.className = "nav-drawer-list";

  head.appendChild(title);
  head.appendChild(close);
  drawer.appendChild(head);
  drawer.appendChild(list);

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  overlay.addEventListener("click", closeDrawer);
  close.addEventListener("click", closeDrawer);
  list.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (link) closeDrawer();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) closeDrawer();
  });

  drawerUi = { overlay, drawer, title, list };
  return drawerUi;
}

function closeDrawer() {
  if (!drawerUi) return;

  const { overlay, drawer } = drawerUi;

  if (drawerHideTimer) {
    window.clearTimeout(drawerHideTimer);
    drawerHideTimer = null;
  }

  overlay.classList.remove("is-open");
  drawer.classList.remove("is-open");
  document.body.classList.remove("nav-drawer-open");

  if (activeDrawerTrigger) {
    activeDrawerTrigger.setAttribute("aria-expanded", "false");
    activeDrawerTrigger = null;
  }

  drawerHideTimer = window.setTimeout(() => {
    overlay.hidden = true;
    drawer.hidden = true;
    drawerHideTimer = null;
  }, 220);
}

function openDrawer(trigger, nav, titleText) {
  const { overlay, drawer, title, list } = ensureDrawerUi();
  const currentPath = normalizeNavPathname(window.location.pathname);
  const links = collectDrawerLinks(nav);

  if (drawerHideTimer) {
    window.clearTimeout(drawerHideTimer);
    drawerHideTimer = null;
  }

  if (activeDrawerTrigger) {
    activeDrawerTrigger.setAttribute("aria-expanded", "false");
    activeDrawerTrigger = null;
  }

  overlay.classList.remove("is-open");
  drawer.classList.remove("is-open");
  overlay.hidden = true;
  drawer.hidden = true;

  title.textContent = titleText || "More";
  list.innerHTML = "";

  for (const item of links) {
    const li = document.createElement("li");
    const anchor = document.createElement("a");
    anchor.className = "nav-drawer-link";
    anchor.href = item.href;
    anchor.textContent = item.text;

    if (isNavPathActive(currentPath, item.path)) {
      anchor.setAttribute("aria-current", "page");
    }

    li.appendChild(anchor);
    list.appendChild(li);
  }

  overlay.hidden = false;
  drawer.hidden = false;

  requestAnimationFrame(() => {
    overlay.classList.add("is-open");
    drawer.classList.add("is-open");
  });

  trigger.setAttribute("aria-expanded", "true");
  activeDrawerTrigger = trigger;
  document.body.classList.add("nav-drawer-open");
}

function initSiteNavMoreDrawer() {
  const navs = Array.from(document.querySelectorAll(".site-nav"));

  for (const nav of navs) {
    const primaryList = nav.querySelector(".site-nav-list-primary");
    const secondaryList = nav.querySelector(".site-nav-list-secondary");
    if (!primaryList || !secondaryList) continue;

    const drawerLinks = collectLinksFromList(secondaryList);
    if (drawerLinks.length === 0) continue;

    nav.classList.add("site-nav-has-more");

    let toggle = nav.querySelector(".nav-mobile-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "nav-mobile-toggle";
      toggle.innerHTML = '<span class="nav-mobile-toggle-icon" aria-hidden="true">☰</span>';
      nav.appendChild(toggle);
    }

    toggle.setAttribute("aria-label", "Open more pages menu");
    toggle.setAttribute("aria-haspopup", "menu");
    toggle.setAttribute("aria-expanded", "false");
    toggle.hidden = true;

    const label = nav.getAttribute("aria-label") || "More pages";
    toggle.addEventListener("click", () => {
      openDrawer(toggle, nav, label);
    });
  }

  window.addEventListener("resize", schedulePrimaryNavOverflowSync);
  window.addEventListener("orientationchange", schedulePrimaryNavOverflowSync);
  window.addEventListener(
    "load",
    () => {
      schedulePrimaryNavOverflowSync();
    },
    { once: true }
  );

  if (document.fonts?.ready?.then) {
    document.fonts.ready.then(() => {
      schedulePrimaryNavOverflowSync();
    });
  }

  schedulePrimaryNavOverflowSync();
}

function initNav() {
  applyNavActiveState();
  initSiteNavMoreDrawer();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initNav, { once: true });
} else {
  initNav();
}
