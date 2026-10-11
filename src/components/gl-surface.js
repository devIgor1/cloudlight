/** Small WebGL2 surface shared by the cloud and wave fragment shaders. */
const vertexSource = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

export async function createSurface(host, reducedMotion, signal) {
  const kind = host.dataset.shader;
  const fragmentSource = await fetch(`/assets/${kind}.frag`, { signal }).then(
    (r) => {
      if (!r.ok) throw new Error(`Shader unavailable: ${kind}`);
      return r.text();
    },
  );
  if (signal.aborted) return;
  const canvas = document.createElement("canvas");
  canvas.className = "shader-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: "low-power",
  });
  if (!gl) return;
  function shader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(error);
    }
    return s;
  }
  const program = gl.createProgram();
  let vert, frag;
  try {
    vert = shader(gl.VERTEX_SHADER, vertexSource);
    frag = shader(gl.FRAGMENT_SHADER, fragmentSource);
  } catch {
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return;
  }
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const pos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const res = gl.getUniformLocation(program, "uRes");
  const time = gl.getUniformLocation(program, "uTime");
  const theme = gl.getUniformLocation(program, "uTheme");
  let currentTheme = +document.documentElement.classList.contains("dark");
  let targetTheme = currentTheme;
  let elapsed = 0,
    frame = 0,
    last = 0,
    visible = false,
    lost = false;
  const scale = kind === "cloud" ? 0.36 : 0.35;
  const period = 1000 / (kind === "cloud" ? 60 : 30);
  const stillTime = kind === "cloud" ? 12 : 7;
  host.prepend(canvas);
  host.dataset.shaderReady = "true";
  function draw(t) {
    gl.uniform1f(time, t);
    gl.uniform1f(theme, currentTheme);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function resize() {
    const rect = host.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(res, canvas.width, canvas.height);
    draw(reducedMotion.matches ? stillTime : elapsed);
  }
  function tick(now) {
    frame = requestAnimationFrame(tick);
    const dt = now - last;
    if (dt < period - 1) return;
    last = now - (dt % period);
    elapsed += Math.min(dt, 50) / 1000;
    currentTheme +=
      (targetTheme - currentTheme) * (1 - Math.pow(0.92, dt / (1000 / 60)));
    draw(elapsed);
  }
  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (lost) return;
    if (reducedMotion.matches) {
      currentTheme = targetTheme;
      draw(stillTime);
    } else if (visible && !document.hidden) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const visibilityObserver = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      sync();
    },
    { rootMargin: "160px" },
  );
  visibilityObserver.observe(host);
  const themeObserver = new MutationObserver(() => {
    targetTheme = +document.documentElement.classList.contains("dark");
    if (reducedMotion.matches) sync();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  document.addEventListener("visibilitychange", sync);
  reducedMotion.addEventListener("change", sync);
  const onLost = (event) => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    canvas.style.display = "none";
    delete host.dataset.shaderReady;
  };
  canvas.addEventListener("webglcontextlost", onLost);
  resize();
  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    themeObserver.disconnect();
    document.removeEventListener("visibilitychange", sync);
    reducedMotion.removeEventListener("change", sync);
    canvas.removeEventListener("webglcontextlost", onLost);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
    delete host.dataset.shaderReady;
  };
}
