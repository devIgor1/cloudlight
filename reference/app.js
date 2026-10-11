import { teams, stories } from "./data.js";
import { createSurface } from "./gl-surface.js";
import {
  animate,
  reducedMotion,
  setupReveals,
  setupPills,
  setupScrollEffects,
  softEase,
  quickEase,
} from "./effects.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const svg = (paths, cls = "") =>
  `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const icons = {
  cloud: svg('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
  moon: svg(
    '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401Z"/>',
  ),
  sun: svg(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  ),
  arrow: svg('<path d="M5 12h14m-6-6 6 6-6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  send: svg('<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>'),
  upload: svg(
    '<path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  ),
  folder: svg(
    '<path d="M3 7V5a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  ),
  people: svg(
    '<circle cx="9" cy="7" r="4"/><path d="M1 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2m0-18a4 4 0 0 1 0 8m6 10v-2a6 6 0 0 0-4-5"/>',
  ),
  shield: svg(
    '<path d="m12 3 9 4v6c0 5-9 9-9 9S3 18 3 13V7l9-4Z"/><path d="m8 12 3 3 5-6"/>',
  ),
  help: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01"/>',
  ),
  close: svg('<path d="m6 6 12 12M6 18 18 6"/>'),
};

// The reference is a presentation template, so example account destinations
// open an explicit demo dialog instead of suggesting an unavailable backend.
function setupDemoLinks() {
  const dialog = document.createElement("dialog");
  dialog.className = "demo-dialog";
  dialog.setAttribute("aria-labelledby", "demo-title");
  dialog.innerHTML = `<button class="dialog-close" aria-label="Close dialog">${icons.close}</button>${icons.cloud}<h2 id="demo-title">You’re exploring Cloudlight.</h2><p>This is an interactive reconstruction of the Cloudlight website. Accounts, file transfers and subscriptions are not connected to a live service.</p><button class="dialog-done">Keep exploring</button>`;
  document.body.append(dialog);
  $$("button", dialog).forEach((b) =>
    b.addEventListener("click", () => dialog.close()),
  );
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    }
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-demo-link]")) {
      e.preventDefault();
      dialog.showModal();
    }
  });
}

function setupTheme() {
  const button = $("#theme-toggle");
  function sync() {
    const dark = document.documentElement.classList.contains("dark");
    button.innerHTML = dark ? icons.sun : icons.moon;
    button.setAttribute(
      "aria-label",
      `Switch to ${dark ? "light" : "dark"} theme`,
    );
    button.setAttribute("aria-pressed", String(dark));
  }
  button.addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem(
        "cloudlight-theme",
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      );
    } catch {}
    sync();
  });
  sync();
}

function setupNavigation() {
  const hero = $("#hero"),
    header = $("#site-header");
  header.firstElementChild.classList.add("nav-content");
  const docked = header.cloneNode(true);
  docked.id = "docked-header";
  docked.className = "";
  docked.inert = true;
  $$("[id]", docked).forEach((el) => {
    if (el !== docked) el.id += "-docked";
  });
  $$("[aria-controls]", docked).forEach((el) =>
    el.setAttribute(
      "aria-controls",
      el.getAttribute("aria-controls") + "-docked",
    ),
  );
  document.body.append(docked);
  new IntersectionObserver(([entry]) => {
    const show = !entry.isIntersecting;
    docked.classList.toggle("is-docked", show);
    docked.inert = !show;
  }).observe(hero);
  const menus = {
    features: [
      {
        label: "Transfers",
        description: "Up to 200 GB in one link",
        href: "#capabilities",
        icon: "send",
        tint: "sky",
      },
      {
        label: "Library",
        description: "Everything you've sent, searchable",
        href: "#library",
        icon: "folder",
        tint: "peach",
      },
      {
        label: "Any format",
        description: "Masters travel as is",
        href: "#formats",
        icon: "cloud",
        tint: "mint",
      },
      {
        label: "Speed",
        description: "Benchmarked against the usual tools",
        href: "#benchmarks",
        icon: "upload",
        tint: "sand",
      },
    ],
    teams: [
      {
        label: "Spaces",
        description: "A place per client or project",
        href: "#teams",
        icon: "people",
        tint: "sky",
      },
      {
        label: "Customer stories",
        description: "How studios and crews use it",
        href: "#stories",
        icon: "people",
        tint: "rose",
      },
      {
        label: "Help centre",
        description: "Answers to the usual questions",
        href: "#help",
        icon: "help",
        tint: "mint",
      },
    ],
  };
  const openMenus = [];
  $$("[data-dropdown]").forEach((trigger) => {
    const parent = trigger.parentElement;
    const old = parent.querySelector(":scope > div");
    if (old) old.remove();
    const panel = document.createElement("div");
    panel.className = "nav-dropdown";
    panel.hidden = true;
    panel.id = trigger.getAttribute("aria-controls");
    panel.innerHTML =
      '<div class="nav-dropdown-inner">' +
      menus[trigger.dataset.dropdown]
        .map(
          (item) =>
            `<a href="${item.href}"><span class="nav-icon tint-${item.tint}">${icons[item.icon]}</span><span><strong>${item.label}</strong><small>${item.description}</small></span></a>`,
        )
        .join("") +
      "</div>";
    parent.append(panel);
    let timer,
      animation,
      suppressFocus = false;
    function close() {
      clearTimeout(timer);
      trigger.setAttribute("aria-expanded", "false");
      if (panel.hidden) return;
      animation?.cancel();
      animation = animate(
        panel,
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: "translateY(-4px)" },
        ],
        { duration: 150, easing: quickEase },
      );
      animation.finished
        .then(() => {
          panel.hidden = true;
        })
        .catch(() => {});
    }
    function open() {
      clearTimeout(timer);
      if (trigger.getAttribute("aria-expanded") === "true") return;
      openMenus.forEach((c) => {
        if (c !== close) c();
      });
      animation?.cancel();
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      animation = animate(
        panel,
        [
          { opacity: 0, transform: "translateY(-6px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 220 },
      );
    }
    openMenus.push(close);
    parent.addEventListener("pointerenter", open);
    parent.addEventListener("pointerleave", () => {
      clearTimeout(timer);
      timer = setTimeout(close, 120);
    });
    parent.addEventListener("focusin", () => {
      if (!suppressFocus) open();
    });
    parent.addEventListener("focusout", (e) => {
      if (!parent.contains(e.relatedTarget)) close();
    });
    parent.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        suppressFocus = true;
        trigger.focus();
        suppressFocus = false;
        close();
      }
    });
    panel.addEventListener("click", (e) => {
      if (e.target.closest("a")) close();
    });
  });

  const menu = document.createElement("div");
  menu.className = "mobile-menu";
  menu.hidden = true;
  menu.id = "mobile-navigation";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-modal", "true");
  menu.setAttribute("aria-label", "Menu");
  const nested = (key) =>
    `<details><summary>${key === "features" ? "Features" : "Teams"}${icons.down}</summary><div class="mobile-subnav">${menus[key].map((item) => `<a href="${item.href}"><span class="nav-icon">${icons[item.icon]}</span>${item.label}</a>`).join("")}</div></details>`;
  menu.innerHTML = `<nav aria-label="Mobile">${nested("features")}<a href="#security">Security${icons.arrow}</a>${nested("teams")}<a href="#pricing">Pricing${icons.arrow}</a><a class="mobile-signin" href="#demo" data-demo-link="sign-in">Sign in</a></nav>`;
  document.body.append(menu);
  $$("details", menu).forEach((details) => {
    const summary = $("summary", details),
      content = $(".mobile-subnav", details);
    let animation;
    summary.addEventListener("click", (event) => {
      event.preventDefault();
      animation?.cancel();
      const opening = !details.open;
      details.open = true;
      content.style.overflow = "hidden";
      const height = content.scrollHeight;
      animation = animate(
        content,
        [
          { height: (opening ? 0 : height) + "px", opacity: opening ? 0 : 1 },
          { height: (opening ? height : 0) + "px", opacity: opening ? 1 : 0 },
        ],
        { duration: 300 },
      );
      animation.finished
        .then(() => {
          details.open = opening;
          content.style.overflow = "";
        })
        .catch(() => {});
    });
  });
  let opener = null;
  const toggles = $$("[data-menu-toggle]");
  function setMenu(open) {
    menu.hidden = !open;
    document.body.classList.toggle("menu-open", open);
    toggles.forEach((b) => {
      b.setAttribute("aria-expanded", String(open));
      b.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      b.setAttribute("aria-controls", menu.id);
    });
    if (open) {
      animate(
        menu,
        [
          { opacity: 0, transform: "translateY(-12px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 400 },
      );
      [...menu.querySelector("nav").children].forEach((el, i) =>
        animate(
          el,
          [
            { opacity: 0, transform: "translateY(14px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 400, delay: 80 + 50 * i, fill: "backwards" },
        ),
      );
      $("summary", menu).focus();
    } else opener?.focus();
  }
  toggles.forEach((b) =>
    b.addEventListener("click", () => {
      opener = b;
      setMenu(menu.hidden);
    }),
  );
  menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (menu.hidden) return;
    if (e.key === "Escape") {
      setMenu(false);
      return;
    }
    if (e.key === "Tab") {
      const items = [
        opener,
        ...$$("a,summary", menu).filter((el) => el.getClientRects().length),
      ];
      const index = items.indexOf(document.activeElement);
      e.preventDefault();
      items[
        (index + (e.shiftKey ? -1 : 1) + items.length) % items.length
      ].focus();
    }
  });
  matchMedia("(min-width:768px)").addEventListener("change", (e) => {
    if (e.matches && !menu.hidden) setMenu(false);
  });
}

function setupBenchmarks() {
  const section = $("#benchmarks"),
    rows = $$("[data-benchmark-row]", section);
  const metrics = [
    {
      name: "Upload speed",
      unit: " MB/s",
      decimals: 0,
      values: [96, 71, 58, 44, 4],
    },
    {
      name: "Delivered first try",
      unit: "%",
      decimals: 1,
      values: [99.9, 97.4, 95.1, 91.8, 84],
    },
    {
      name: "Recovered after a drop",
      unit: "%",
      decimals: 0,
      values: [99, 88, 12, 35, 0],
    },
  ];
  let active = 0,
    visible = false;
  rows.forEach((row, i) => $("[data-bar]", row).style.setProperty("--row", i));
  function render() {
    const metric = metrics[active],
      max = Math.max(...metric.values);
    $('[role="tabpanel"]', section).setAttribute("aria-label", metric.name);
    rows.forEach((row, i) => {
      $("[data-bar]", row).style.width =
        (visible ? (metric.values[i] / max) * 100 : 0) + "%";
      $("[data-value]", row).textContent =
        metric.values[i].toFixed(metric.decimals) + metric.unit;
    });
  }
  setupPills($("[data-pill-tabs]", section), (i) => {
    active = i;
    render();
  });
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        visible = true;
        render();
        observer.disconnect();
      }
    },
    { rootMargin: "0px 0px -120px 0px" },
  );
  observer.observe($('[role="tabpanel"]', section));
  render();
}

function setupTeams() {
  const points = $("#team-points"),
    preview = $("#team-preview");
  const pointTemplate = points.firstElementChild.cloneNode(true);
  const folderTemplate = $("ul > li", preview).cloneNode(true);
  const sharedTemplate = folderTemplate.lastElementChild.cloneNode(true);
  let revision = 0;
  setupPills($("#teams [data-pill-tabs]"), async (index) => {
    const version = ++revision,
      data = teams[index];
    await Promise.all(
      [points, preview].map((el) =>
        animate(
          el,
          [
            { opacity: 1, transform: "translateY(0)" },
            { opacity: 0, transform: "translateY(-6px)" },
          ],
          { duration: 180, easing: quickEase },
        ).finished.catch(() => {}),
      ),
    );
    if (version !== revision) return;
    points.replaceChildren(
      ...data.points.map((text) => {
        const li = pointTemplate.cloneNode(true);
        [...li.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .forEach((n) => n.remove());
        li.append(document.createTextNode(text));
        return li;
      }),
    );
    const head = preview.firstElementChild;
    $(":scope > span", head).textContent = data.name;
    const avatarGroup = $(":scope > div", head);
    [...avatarGroup.children].forEach((avatar, i) => {
      if (i < 3) {
        avatar.textContent = data.members[i].initials;
        avatar.className = avatar.className.replace(/bg-[^ ]+/g, "");
        avatar.classList.add(data.members[i].tone);
      } else avatar.textContent = "+" + data.extra;
    });
    $("ul", preview).replaceChildren(
      ...data.folders.map((folder) => {
        const row = folderTemplate.cloneNode(true);
        const labels = row.children[1];
        labels.children[0].textContent = folder.name;
        labels.children[1].textContent = folder.meta;
        if (row.children[2]) row.children[2].remove();
        if (folder.shared) row.append(sharedTemplate.cloneNode(true));
        return row;
      }),
    );
    const footer = preview.lastElementChild;
    $("span", footer).textContent = `${data.used}% of ${data.quota} used`;
    const bar = $('[style*="width"]', footer);
    bar.style.transition = `width .6s ${softEase}`;
    bar.style.width = data.used + "%";
    [points, preview].forEach((el) =>
      animate(
        el,
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 350 },
      ),
    );
  });
}

function setupStories() {
  const section = $("#stories"),
    tabs = $$("#story-tabs > button"),
    photo = $("#story-photo"),
    figure = $("#story-quote");
  const photoWrap = photo.parentElement;
  const area = photoWrap.parentElement.parentElement;
  let index = 0,
    visible = false,
    hover = false,
    focused = false,
    timer,
    progressAnimation,
    revision = 0;
  // Replace the server-rendered active marker with an accessible active outline.
  tabs.forEach((b) => $$("span", b).forEach((el) => el.remove()));
  const progress = document.createElement("span");
  progress.className = "story-progress";
  progress.setAttribute("aria-hidden", "true");
  function autoplay() {
    clearTimeout(timer);
    progressAnimation?.cancel();
    progress.remove();
    if (
      !visible ||
      hover ||
      focused ||
      document.hidden ||
      reducedMotion.matches
    )
      return;
    tabs[index].append(progress);
    progressAnimation = animate(
      progress,
      [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration: 6500, easing: "linear" },
    );
    timer = setTimeout(() => select(index + 1), 6500);
  }
  async function select(next) {
    index = (next + stories.length) % stories.length;
    const version = ++revision,
      story = stories[index];
    tabs.forEach((b, i) => {
      b.setAttribute("aria-selected", String(i === index));
      b.tabIndex = i === index ? 0 : -1;
    });
    autoplay();
    await animate(
      figure,
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(-10px)" },
      ],
      { duration: 220, easing: quickEase },
    ).finished.catch(() => {});
    if (version !== revision) return;
    $("blockquote", figure).textContent = "“" + story.quote + "”";
    const caption = $$("figcaption > span", figure);
    caption[0].textContent = story.name;
    caption[1].textContent = story.role;
    const previous = photoWrap.cloneNode(true);
    previous.removeAttribute("id");
    previous.querySelector("img").removeAttribute("id");
    previous.setAttribute("aria-hidden", "true");
    photoWrap.parentElement.append(previous);
    photo.src = story.image;
    photo.alt = "Portrait of " + story.name;
    animate(previous, [{ opacity: 1 }, { opacity: 0 }], { duration: 700 })
      .finished.then(() => previous.remove())
      .catch(() => previous.remove());
    animate(
      photoWrap,
      [
        { opacity: 0, transform: "scale(1.04)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 700 },
    );
    animate(
      figure,
      [
        { opacity: 0, transform: "translateY(14px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 500 },
    );
  }
  tabs.forEach((b, i) => b.addEventListener("click", () => select(i)));
  $("#story-tabs").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    select(
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? stories.length - 1
          : index + (e.key === "ArrowRight" ? 1 : -1),
    );
    tabs[index].focus();
  });
  $('[aria-label="Previous story"]', section).addEventListener("click", () =>
    select(index - 1),
  );
  $('[aria-label="Next story"]', section).addEventListener("click", () =>
    select(index + 1),
  );
  area.addEventListener("pointerenter", () => {
    hover = true;
    autoplay();
  });
  area.addEventListener("pointerleave", () => {
    hover = false;
    autoplay();
  });
  area.addEventListener("focusin", () => {
    focused = true;
    autoplay();
  });
  area.addEventListener("focusout", (e) => {
    if (!area.contains(e.relatedTarget)) {
      focused = false;
      autoplay();
    }
  });
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      autoplay();
    },
    { threshold: 0.3 },
  ).observe(area);
  document.addEventListener("visibilitychange", autoplay);
  reducedMotion.addEventListener("change", autoplay);
}

function setupPricing() {
  const values = { free: [0, 0], pro: [14, 11], team: [29, 24] };
  setupPills($("#pricing [data-pill-tabs]"), (index) => {
    $$("[data-plan]").forEach((card) => {
      const value = $("[data-price]", card),
        old = value.textContent,
        newValue = String(values[card.dataset.plan][index]);
      const caption = $("[data-billing-caption]", card);
      if (caption)
        caption.textContent = index ? "Billed yearly" : "Billed monthly";
      if (old === newValue) return;
      const parent = value.parentElement,
        previous = value.cloneNode(true);
      previous.removeAttribute("data-price");
      previous.style.position = "absolute";
      previous.style.left = "0";
      parent.append(previous);
      value.textContent = newValue;
      const direction = index ? -1 : 1;
      animate(
        previous,
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: `translateY(${-110 * direction}%)` },
        ],
        { duration: 400 },
      )
        .finished.then(() => previous.remove())
        .catch(() => previous.remove());
      animate(
        value,
        [
          { opacity: 0, transform: `translateY(${110 * direction}%)` },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 400 },
      );
    });
  });
}

function setupFaq() {
  const rows = $$("[data-faq]");
  const running = new WeakMap();
  function toggle(row, open) {
    const button = $("button", row),
      panel = $('[role="region"]', row);
    if (button.getAttribute("aria-expanded") === String(open)) return;
    running.get(panel)?.cancel();
    const start = panel.hidden ? 0 : panel.getBoundingClientRect().height;
    button.setAttribute("aria-expanded", String(open));
    panel.hidden = false;
    const end = open ? panel.scrollHeight : 0;
    const animation = animate(
      panel,
      [
        { height: start + "px", opacity: open ? 0 : 1 },
        { height: end + "px", opacity: open ? 1 : 0 },
      ],
      { duration: 350 },
    );
    running.set(panel, animation);
    animation.finished
      .then(() => {
        panel.hidden = !open;
        running.delete(panel);
      })
      .catch(() => {});
  }
  rows.forEach((row) =>
    $("button", row).addEventListener("click", () => {
      const open = $("button", row).getAttribute("aria-expanded") !== "true";
      rows.forEach((other) => toggle(other, other === row && open));
    }),
  );
}

setupDemoLinks();
setupTheme();
setupNavigation();
setupReveals();
setupScrollEffects();
setupBenchmarks();
setupTeams();
setupStories();
setupPricing();
setupFaq();
document
  .querySelectorAll("[data-shader]")
  .forEach((host) =>
    createSurface(host, reducedMotion).catch((error) =>
      console.warn("Using static background:", error.message),
    ),
  );
