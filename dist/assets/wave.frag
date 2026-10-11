#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uTheme;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;


const int SOURCES = 33;
const float ORBIT = 2.67;
const float WAVELENGTH = 2.67;
const float SPREAD = 0.867;
const float PHASE_SPEED = 0.267;

const float STRENGTH = 0.4;


const vec3 L0 = vec3(1.0);
const vec3 L1 = vec3(0.90, 0.97, 1.0);
const vec3 L2 = vec3(0.655, 0.937, 0.996);
const vec3 L3 = vec3(0.86, 0.96, 1.0);
const vec3 L4 = vec3(0.60, 0.90, 0.98);


const vec3 D0 = vec3(0.039, 0.039, 0.039);
const vec3 D1 = vec3(0.050, 0.065, 0.090);
const vec3 D2 = vec3(0.070, 0.120, 0.165);
const vec3 D3 = vec3(0.055, 0.080, 0.110);
const vec3 D4 = vec3(0.085, 0.150, 0.205);

float h1(float n) {
  return fract(sin(n * 127.1) * 43758.5453123);
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = (2.0 * px - uRes) / uRes.y;
  float t = uTime * 0.5;

  float sum = 0.0;
  float norm = 0.0;
  for (int j = 1; j <= SOURCES; j++) {
    float i = float(j);
    float dir = 1.0 - 2.0 * mod(i, 2.0);
    float th = TAU * h1(i * 1.7) + dir * (0.10 + 0.25 * h1(i * 3.3)) * t;
    vec2 c = ORBIT * (0.6 + 0.8 * h1(i * 5.1)) * vec2(cos(th), sin(th));
    float r = length(uv - c);
    float k = TAU / max(WAVELENGTH * (1.0 + SPREAD * (2.0 * h1(i * 7.9) - 1.0)), 0.01);
    float a = inversesqrt(r + 0.25);
    sum += a * cos(k * (r - PHASE_SPEED * t) + PI * h1(i * 11.3));
    norm += a * a;
  }

  float g = clamp(0.5 + 0.5 * sum * inversesqrt(2.0 * max(norm, 1e-4)), 0.0, 1.0);

  vec3 c0 = mix(L0, D0, uTheme);
  vec3 c1 = mix(L1, D1, uTheme);
  vec3 c2 = mix(L2, D2, uTheme);
  vec3 c3 = mix(L3, D3, uTheme);
  vec3 c4 = mix(L4, D4, uTheme);

  vec3 col = mix(c0, c1, smoothstep(0.001, 1.4, g));
  col = mix(col, c2, smoothstep(0.5, 0.7, g));
  col = mix(col, c3, smoothstep(0.01, 1.5, g));
  col = mix(col, c4, smoothstep(0.6, 0.9, g));
  col = mix(c0, col, STRENGTH);

  fragColor = vec4(col, 1.0);
}
