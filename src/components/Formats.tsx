import { useEffect, useRef } from "react";
import { FormatIcon } from "./FormatIcon";
import "./Formats.css";

// Examples of transferable files. Uploads preserve bytes and do not filter by
// extension; these cards do not imply in-browser previews or format conversion.
const formats = [
  { name: "MP4", icon: "film", tone: "sky" },
  { name: "MOV", icon: "video", tone: "cyan" },
  { name: "WEBM", icon: "clapperboard", tone: "stone" },
  { name: "JPG", icon: "camera", tone: "peach" },
  { name: "PNG", icon: "image", tone: "orange" },
  { name: "PSD", icon: "layers", tone: "sky" },
  { name: "AI", icon: "pen-tool", tone: "orange" },
  { name: "FIG", icon: "shapes", tone: "rose" },
  { name: "PDF", icon: "file-text", tone: "rose" },
  { name: "ZIP", icon: "file-archive", tone: "yellow" },
  { name: "WAV", icon: "waves", tone: "emerald" },
  { name: "MP3", icon: "music", tone: "emerald" },
  { name: "BLEND", icon: "box", tone: "stone" },
  { name: "OBJ", icon: "shapes", tone: "cyan" },
  { name: "TTF", icon: "type", tone: "yellow" },
  { name: "SVG", icon: "pen-tool", tone: "peach" },
  { name: "RAW", icon: "camera", tone: "sky" },
  { name: "TIFF", icon: "image", tone: "stone" },
  { name: "DOCX", icon: "file-text", tone: "rose" },
  { name: "XLSX", icon: "table", tone: "emerald" },
  { name: "JSON", icon: "braces", tone: "yellow" },
  { name: "CSV", icon: "table", tone: "cyan" },
  { name: "7Z", icon: "file-archive", tone: "orange" },
  { name: "GLB", icon: "box", tone: "peach" },
] as const;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function Formats() {
  const stageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const stage = stageRef.current!;
    const grid = gridRef.current!;
    const cards = Array.from(grid.children) as HTMLElement[];
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const target = { x: 0.5, y: 0.5, intensity: 0 };
    const current = { ...target };
    const velocity = { x: 0, y: 0, intensity: 0 };
    let frame = 0;
    let scrollFrame = 0;
    let last = 0;
    let baseRotation = 50;
    let columns = 8;

    function draw() {
      grid.style.transform = reducedMotion.matches
        ? "rotateX(44deg)"
        : `rotateX(${baseRotation - (current.y - 0.5) * 6 * current.intensity}deg) rotateY(${(current.x - 0.5) * 8 * current.intensity}deg)`;
      const rows = Math.ceil(cards.length / columns);
      cards.forEach((card, index) => {
        const x = ((index % columns) + 0.5) / columns;
        const y = (Math.floor(index / columns) + 0.5) / rows;
        const force = reducedMotion.matches
          ? 0
          : Math.max(
              0,
              1 - Math.hypot((current.x - x) * 1.6, current.y - y) / 0.34,
            ) * current.intensity;
        card.style.transform = `translateZ(${44 * force}px) scale(${1 + 0.08 * force})`;
        card.style.boxShadow = `0 ${8 + 22 * force}px ${24 + 30 * force}px -${14 - 4 * force}px rgba(16,42,67,${0.18 + 0.18 * force})`;
      });
    }

    function tick(now: number) {
      const dt = Math.min((now - last) / 1000 || 1 / 60, 1 / 30);
      last = now;
      let unsettled = false;
      for (const key of ["x", "y", "intensity"] as const) {
        const stiffness = key === "intensity" ? 120 : 160;
        const damping = key === "intensity" ? 20 : 22;
        const mass = key === "intensity" ? 1 : 0.6;
        velocity[key] +=
          (((target[key] - current[key]) * stiffness -
            velocity[key] * damping) /
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

    function move(event: PointerEvent) {
      if (event.pointerType === "touch" || reducedMotion.matches) return;
      const box = stage.getBoundingClientRect();
      target.x = clamp((event.clientX - box.left) / box.width);
      target.y = clamp((event.clientY - box.top) / box.height);
      target.intensity = 1;
      start();
    }

    function leave() {
      target.x = target.y = 0.5;
      target.intensity = 0;
      if (!reducedMotion.matches) start();
    }

    function update() {
      scrollFrame = 0;
      const box = stage.getBoundingClientRect();
      baseRotation =
        50 -
        10 *
          clamp(
            (innerHeight * 0.9 - box.top) / (box.height + innerHeight * 0.7),
          );
      columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
      draw();
    }

    function queueUpdate() {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(update);
    }

    function motionChange() {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
      frame = 0;
      Object.assign(target, { x: 0.5, y: 0.5, intensity: 0 });
      Object.assign(current, target);
      Object.assign(velocity, { x: 0, y: 0, intensity: 0 });
      update();
    }

    const resize = new ResizeObserver(queueUpdate);
    resize.observe(stage);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerleave", leave);
    window.addEventListener("scroll", queueUpdate, { passive: true });
    reducedMotion.addEventListener("change", motionChange);
    update();

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
      resize.disconnect();
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", leave);
      window.removeEventListener("scroll", queueUpdate);
      reducedMotion.removeEventListener("change", motionChange);
    };
  }, []);

  return (
    <section
      id="formats"
      className="formats section-width"
      aria-labelledby="formats-heading"
    >
      <a className="formats-link" href="#perguntas">
        Qualquer formato, até 1 GB
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </a>
      <h2 id="formats-heading">
        Do primeiro rascunho
        <br />à última edição.
      </h2>
      <div className="format-mask">
        <div className="format-stage" ref={stageRef}>
          <ul
            className="format-grid"
            ref={gridRef}
            aria-label="Exemplos de formatos aceitos para envio"
            role="list"
          >
            {formats.map(({ name, icon, tone }) => (
              <li className={`format-tile format-tone-${tone}`} key={name}>
                <FormatIcon name={icon} />
                <span>{name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p>
        Vídeos, imagens, documentos e projetos, preservados como você enviou.
        <br />
        Até 1 GB por transferência, em até 20 arquivos.
      </p>
    </section>
  );
}
