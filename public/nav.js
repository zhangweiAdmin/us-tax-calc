let drawerUi = null;
let activeDrawerTrigger = null;
let drawerHideTimer = null;

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

function collectLinksFromList(list) {
  const anchors = Array.from(list.querySelectorAll("a[href^='/']"));
  const seen = new Set();
  const links = [];

  for (const anchor of anchors) {
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

function openDrawer(trigger, titleText, links) {
  const { overlay, drawer, title, list } = ensureDrawerUi();
  const currentPath = normalizeNavPathname(window.location.pathname);

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

    const links = collectLinksFromList(secondaryList);
    if (links.length === 0) continue;

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

    const label = nav.getAttribute("aria-label") || "More pages";
    toggle.addEventListener("click", () => {
      openDrawer(toggle, label, links);
    });
  }
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
