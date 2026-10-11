#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uTheme;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;


const vec3 SKY_L = vec3(0.655, 0.937, 0.996);
const vec3 RIM_L = vec3(1.0);
const vec3 CORE_L = vec3(0.905, 0.945, 0.985);


const vec3 SKY_D = vec3(0.055, 0.071, 0.098);
const vec3 RIM_D = vec3(0.150, 0.170, 0.210);
const vec3 CORE_D = vec3(0.095, 0.110, 0.140);


const float SCALE = 8.0;
const float BASE_DENSITY = 0.55;


const float COVERAGE = 0.45;
const float FADE_START = 0.5;
const float CEILING = 0.9;


const float SKYLINE_DIP = 0.1;
const float SKYLINE_RISE = 0.5;

const float OPACITY_L = 0.9;
const float OPACITY_D = 0.6;
const float WARP = 0.025;

const mat2 SPIN_A = mat2(0.80, 0.60, -0.60, 0.80);
const mat2 SPIN_B = mat2(1.60, 1.20, -1.20, 1.60);

const float PUFF_RATE[3] = float[3](0.1, 0.2, 0.5);
const float PUFF_ZOOM[3] = float[3](2.02, 2.03, 2.01);

const float FLOW_RATE[5] = float[5](0.1, 0.4, 0.7, 0.3, 0.3);
const float FLOW_GAIN[5] = float[5](0.5, 0.25, 0.125, 0.0625, 0.0325);

vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0;
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}



float cellular(vec2 x, float phase) {
  vec2 cell = floor(x);
  vec2 f = fract(x);
  float inv = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 site = 0.5 + 0.5 * sin(phase + TAU * hash22(cell + g));
      vec2 r = g + site - f;

      float d2 = dot(r, r);
      float d4 = d2 * d2;
      float d8 = d4 * d4;
      inv += 1.0 / (d8 * d8);
    }
  }
  return 1.0 - pow(inv, -0.125);
}




float lobe(vec2 cell, vec2 offset, vec2 f, mat2 R) {
  float sgn = 1.0 - 2.0 * mod(offset.x + offset.y, 2.0);
  return sgn * dot(hash22(cell + offset), R * (f - offset));
}

float curl(vec2 p, float ang) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  mat2 R = rot(ang + PI * (1.0 - mod(cell.x + cell.y, 2.0)));
  float n = mix(
    mix(lobe(cell, vec2(0.0, 0.0), f, R), lobe(cell, vec2(1.0, 0.0), f, R), w.x),
    mix(lobe(cell, vec2(0.0, 1.0), f, R), lobe(cell, vec2(1.0, 1.0), f, R), w.x),
    w.y
  );
  return 0.5 + n;
}

float puffField(vec2 p, float t) {
  float amp = 0.5;
  float sum = 0.0;
  for (int k = 0; k < 3; k++) {
    sum += amp * cellular(p, t * PUFF_RATE[k]);
    p = SPIN_A * p * PUFF_ZOOM[k];
    amp *= 0.5;
  }

  return (sum + 0.0625) / 0.9375;
}

float flowField(vec2 p, float t) {
  float sum = 0.0;
  for (int k = 0; k < 5; k++) {
    sum += FLOW_GAIN[k] * curl(p, t * FLOW_RATE[k]);
    p = SPIN_B * p;
  }
  return sum * 1.2;
}


float flowWarp(vec2 p, float t) {
  float sum = FLOW_GAIN[0] * curl(p, t * FLOW_RATE[0]);
  p = SPIN_B * p;
  sum += FLOW_GAIN[1] * curl(p, t * FLOW_RATE[1]);
  return sum * 1.2;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  float h = px.y / uRes.y;
  vec3 sky = mix(SKY_L, SKY_D, uTheme);

  float t = uTime;




  float sx = px.x / uRes.y;
  float ridge = curl(vec2(sx * 0.6 + t * 0.01, 4.7), 0.0);
  ridge = 0.7 * ridge + 0.3 * curl(vec2(sx * 1.5 - t * 0.006, 8.3), 0.0);
  ridge = 0.5 + (ridge - 0.5) * 2.0;
  float tower = smoothstep(0.4, 0.85, ridge);
  float lift = mix(-SKYLINE_DIP, SKYLINE_RISE, tower);


  if (h > CEILING + lift) {
    fragColor = vec4(sky, 1.0);
    return;
  }

  float churn = t * 0.5;
  float drift = t * 0.15;




  float unit = max(uRes.x, uRes.y);
  vec2 uv = vec2(px.x, -px.y) / unit;

  uv += flowWarp(uv * SCALE + vec2(0.0, churn * 0.5), churn) * WARP;

  vec2 q = uv * SCALE + vec2(0.0, drift);
  float shape = puffField(q, churn * 10.0);
  float detail = flowField(q, churn * 10.0);



  float band = COVERAGE * clamp(1.0 - h + lift * 0.9, 0.0, 1.0);
  shape = smoothstep(0.0, 1.0, shape) * band + BASE_DENSITY;
  detail = smoothstep(0.0, 1.0, detail) * band + BASE_DENSITY;

  float dens = shape * detail;
  dens *= smoothstep(0.0, 1.0, dens);

  vec3 rim = mix(RIM_L, RIM_D, uTheme);
  vec3 core = mix(CORE_L, CORE_D, uTheme);

  vec3 cloud = mix(rim, core, smoothstep(0.5, 0.99, dens));
  float cover = smoothstep(0.2, 0.5, dens);
  float fade = 1.0 - smoothstep(FADE_START + lift, CEILING + lift, h);
  float opacity = mix(OPACITY_L, OPACITY_D, uTheme);
  vec3 col = mix(sky, cloud, cover * fade * opacity);

  fragColor = vec4(col, 1.0);
}
