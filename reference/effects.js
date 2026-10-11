export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
export const softEase = "cubic-bezier(.22,1,.36,1)";
export const quickEase = "cubic-bezier(.55,0,1,.45)";
export const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));

export function animate(el, frames, options = {}) {
  return el.animate(frames, {
    duration: reducedMotion.matches ? 0 : 350,
    easing: softEase,
    ...options,
    ...(reducedMotion.matches ? { duration: 0, delay: 0 } : {}),
  });
}

export function setupReveals() {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          const el = entry.target;
          el.classList.add("is-revealed");
          animate(
            el,
            [
              { opacity: 0, transform: `translateY(${el.dataset.y || 16}px)` },
              { opacity: 1, transform: "translateY(0)" },
            ],
            {
              duration: 800,
              delay: 1000 * Number(el.dataset.delay || 0),
              fill: "backwards",
            },
          );
          observer.unobserve(el);
        }
    },
    { rootMargin: "0px 0px -80px 0px" },
  );
  document
    .querySelectorAll("[data-reveal]")
    .forEach((el) => observer.observe(el));
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches)
      document
        .querySelectorAll("[data-reveal]")
        .forEach((el) => el.classList.add("is-revealed"));
  });
}

/** The selected pill is a single moving surface, with a sampled physical spring. */
export function setupPills(group, change) {
  const buttons = [...group.querySelectorAll(":scope > button")];
  const checked =
    group.getAttribute("role") === "radiogroup"
      ? "aria-checked"
      : "aria-selected";
  const thumb = document.createElement("span");
  thumb.className = "pill-thumb";
  thumb.setAttribute("aria-hidden", "true");
  group.prepend(thumb);
  let active = Math.max(
    0,
    buttons.findIndex((b) => b.getAttribute(checked) === "true"),
  );
  let motion;
  function position(instant = false) {
    const button = buttons[active];
    const old = thumb.getBoundingClientRect();
    const box = group.getBoundingClientRect();
    const fromX = old.left - box.left,
      fromW = old.width;
    motion?.cancel();
    thumb.style.width = button.offsetWidth + "px";
    thumb.style.transform = `translateX(${button.offsetLeft}px)`;
    if (instant || reducedMotion.matches) return;
    let x = 0,
      velocity = 0;
    const frames = [];
    for (let n = 0; n < 42; n++) {
      velocity += ((1 - x) * 420 - velocity * 36) / 60;
      x += velocity / 60;
      frames.push({
        transform: `translateX(${fromX + (button.offsetLeft - fromX) * x}px)`,
        width: fromW + (button.offsetWidth - fromW) * x + "px",
      });
    }
    frames.push({ transform: thumb.style.transform, width: thumb.style.width });
    motion = animate(thumb, frames, { duration: 500, easing: "linear" });
  }
  function select(index, focus = false) {
    if (index === active) {
      if (focus) buttons[index].focus();
      return;
    }
    active = index;
    buttons.forEach((b, i) => {
      b.setAttribute(checked, String(i === active));
      b.tabIndex = i === active ? 0 : -1;
    });
    position();
    if (focus) buttons[index].focus();
    change(index);
  }
  buttons.forEach((b, i) => b.addEventListener("click", () => select(i)));
  group.addEventListener("keydown", (e) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta && !["Home", "End"].includes(e.key)) return;
    e.preventDefault();
    select(
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? buttons.length - 1
          : (active + delta + buttons.length) % buttons.length,
      true,
    );
  });
  new ResizeObserver(() => position(true)).observe(group);
  position(true);
  return select;
}

export function setupScrollEffects() {
  const grid = document.querySelector("#format-grid");
  const stage = document.querySelector("#format-stage");
  const cards = [...grid.children];
  const paragraph = document.querySelector("#manifesto-text");
  const words = [...paragraph.querySelectorAll("[data-word]")];
  const target = { x: 0.5, y: 0.5, intensity: 0 };
  const current = { x: 0.5, y: 0.5, intensity: 0 };
  const velocity = { x: 0, y: 0, intensity: 0 };
  let frame = 0,
    last = 0,
    baseRotation = 50;
  function draw() {
    grid.style.transform = reducedMotion.matches
      ? "rotateX(44deg)"
      : `rotateX(${baseRotation - (current.y - 0.5) * 6 * current.intensity}deg) rotateY(${(current.x - 0.5) * 8 * current.intensity}deg)`;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const rows = Math.ceil(cards.length / cols);
    cards.forEach((card, i) => {
      const cx = ((i % cols) + 0.5) / cols,
        cy = (Math.floor(i / cols) + 0.5) / rows;
      const force = reducedMotion.matches
        ? 0
        : Math.max(
            0,
            1 - Math.hypot((current.x - cx) * 1.6, current.y - cy) / 0.34,
          ) * current.intensity;
      card.style.transform = `translateZ(${44 * force}px) scale(${1 + 0.08 * force})`;
      card.style.boxShadow = `0 ${8 + 22 * force}px ${24 + 30 * force}px -${14 - 4 * force}px rgba(16,42,67,${0.18 + 0.18 * force})`;
    });
  }
  function tick(now) {
    const dt = Math.min((now - last) / 1000 || 1 / 60, 1 / 30);
    last = now;
    let unsettled = false;
    for (const key of ["x", "y", "intensity"]) {
      const stiffness = key === "intensity" ? 120 : 160,
        damping = key === "intensity" ? 20 : 22,
        mass = key === "intensity" ? 1 : 0.6;
      velocity[key] +=
        (((target[key] - current[key]) * stiffness - velocity[key] * damping) /
          mass) *
        dt;
      current[key] += velocity[key] * dt;
      if (
        Math.abs(target[key] - current[key]) > 0.0001 ||
        Math.abs(velocity[key]) > 0.0001
      )
        unsettled = true;
    }
    draw();
    frame = unsettled ? requestAnimationFrame(tick) : 0;
  }
  function start() {
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }
  stage.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" || reducedMotion.matches) return;
    const rect = stage.getBoundingClientRect();
    target.x = clamp((e.clientX - rect.left) / rect.width);
    target.y = clamp((e.clientY - rect.top) / rect.height);
    target.intensity = 1;
    start();
  });
  stage.addEventListener("pointerleave", () => {
    target.x = target.y = 0.5;
    target.intensity = 0;
    start();
  });
  let queued = false;
  function scroll() {
    queued = false;
    const box = stage.getBoundingClientRect(),
      h = innerHeight;
    baseRotation =
      50 - 10 * clamp((h * 0.9 - box.top) / (box.height + h * 0.7));
    const p = paragraph.getBoundingClientRect();
    const progress = clamp((h * 0.85 - p.top) / (p.height + h * 0.4));
    words.forEach(
      (word, i) =>
        (word.style.opacity = reducedMotion.matches
          ? "1"
          : String(0.14 + 0.86 * clamp(progress * words.length - i))),
    );
    draw();
  }
  function queue() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(scroll);
    }
  }
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
  reducedMotion.addEventListener("change", queue);
  scroll();
}
