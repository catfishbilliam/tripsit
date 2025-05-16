precision highp float;

uniform vec2    u_resolution;
uniform vec2    u_c;
uniform int     u_colorMode;
uniform float   u_power;
uniform float   u_audioLevel;
uniform vec3    u_camPos;
uniform mat4    u_invProj;
uniform mat4    u_viewMat;

#define MAX_ITER 100
#define OUTLINE_BANDS 50
#define LINE_WIDTH 0.005

// Distance estimator for 3D Julia set
float juliaDE(vec3 z) {
  float dr = 1.0;
  float r  = length(z);
  for (int i = 0; i < MAX_ITER; i++) {
    if (r > 2.0) break;
    float theta = acos(z.z / r);
    float phi   = atan(z.y, z.x);
    float zr    = pow(r, u_power);
    float newTheta = theta * u_power;
    float newPhi   = phi   * u_power;
    z = zr * vec3(
      sin(newTheta) * cos(newPhi),
      sin(newPhi)   * sin(newTheta),
      cos(newTheta)
    ) + vec3(u_c, 0.0);
    dr = dr * u_power * pow(r, u_power - 1.0);
    r  = length(z);
  }
  return 0.5 * log(r) * r / dr;
}

// High-contrast complementary palettes (five options), with audio-driven pulse
vec3 getColor(float shade, int mode) {
  float t = smoothstep(0.0, 1.0, pow(shade, 0.3));
  vec3 c1;
  vec3 c2;
  if (mode == 0) {
    c1 = vec3(0.0, 0.0, 1.0);  // Blue
    c2 = vec3(1.0, 0.5, 0.0);  // Orange
  } else if (mode == 1) {
    c1 = vec3(0.5, 0.0, 1.0);  // Purple
    c2 = vec3(0.0, 1.0, 0.0);  // Lime
  } else if (mode == 2) {
    c1 = vec3(1.0, 0.0, 0.0);  // Red
    c2 = vec3(0.0, 1.0, 1.0);  // Cyan
  } else if (mode == 3) {
    c1 = vec3(1.0, 1.0, 0.0);  // Yellow
    c2 = vec3(0.0, 0.0, 1.0);  // Blue
  } else {
    c1 = vec3(1.0, 0.0, 1.0);  // Magenta
    c2 = vec3(0.0, 1.0, 0.0);  // Green
  }
  vec3 color = mix(c1, c2, t);
  // boost brightness and pulse to audio
  color *= (1.2 + u_audioLevel * 0.8);
  return clamp(color, 0.0, 1.0);
}

void main() {
  // Pixel → NDC
  vec2 ndc = (gl_FragCoord.xy / u_resolution) * 2.0 - 1.0;
  // Clip → eye space
  vec4 clip = vec4(ndc, -1.0, 1.0);
  vec4 eye  = u_invProj * clip;
  eye = vec4(eye.xy, -1.0, 0.0);
  // Ray origin & direction
  vec3 ro = u_camPos;
  vec3 rd = normalize((u_viewMat * eye).xyz);

  // Scale fractal with audio level
  float scaleFactor = 1.0 + u_audioLevel * 0.5;

  // Raymarching loop with scaling
  float tDist = 0.0;
  float d;
  int i;
  for (i = 0; i < MAX_ITER; i++) {
    vec3 p = ro + rd * tDist;
    vec3 pScaled = p / scaleFactor;
    d = juliaDE(pScaled) * scaleFactor;
    if (d < 0.01) break;
    tDist += d;
    if (tDist > 100.0) break;
  }

  if (d < 0.01) {
    float shade = float(i) / float(MAX_ITER);
    // Outline bands
    float band = mod(shade * float(OUTLINE_BANDS), 1.0);
    if (band < LINE_WIDTH || band > 1.0 - LINE_WIDTH) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    vec3 col = getColor(shade, u_colorMode);
    gl_FragColor = vec4(col, 1.0);
  } else {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  }
}