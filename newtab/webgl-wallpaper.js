/**
 * LiveTab — WebGL Wallpaper (webgl-wallpaper.js)
 * Renders animated GLSL shaders on a canvas.
 * Uses delta-time clamping to prevent spiral-of-death on slow frames.
 * Respects fpsLimit setting (15 / 30 / 60).
 */

'use strict';

class WebGLWallpaper {
  constructor(settings) {
    this.settings   = settings;
    this.canvas     = document.getElementById('webgl-canvas');
    this.gl         = null;
    this.program    = null;
    this.rafId      = null;
    this.startTime  = performance.now();
    this.lastFrame  = 0;
    this._paused    = false;

    // Uniforms
    this.uTime       = null;
    this.uResolution = null;
    this.uMouse      = null;
    this.mouseX = 0.5; this.mouseY = 0.5;

    this._boundResize = this._resize.bind(this);
    this._boundMouse  = (e) => {
      this.mouseX = e.clientX / window.innerWidth;
      this.mouseY = 1 - e.clientY / window.innerHeight;
    };
  }

  async mount() {
    this.canvas.style.display = 'block';
    this.gl = this.canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance'
    }) || this.canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance'
    });

    if (!this.gl) {
      console.warn('[LiveTab] WebGL unavailable, falling back to CSS wallpaper');
      const css = new CSSWallpaper(this.settings);
      await css.mount();
      return;
    }

    this._resize();
    window.addEventListener('resize', this._boundResize);
    window.addEventListener('mousemove', this._boundMouse);

    const preset = this.settings.webglPreset || this.settings.wallpaperPreset || 'fluid';
    const fragSrc = this._getShader(preset);
    this._buildProgram(VERTEX_SHADER, fragSrc);
    this._startLoop();
  }

  _buildProgram(vertSrc, fragSrc) {
    const gl = this.gl;
    const vert = this._compile(gl.VERTEX_SHADER, vertSrc);
    const frag = this._compile(gl.FRAGMENT_SHADER, fragSrc);

    this.program = gl.createProgram();
    gl.attachShader(this.program, vert);
    gl.attachShader(this.program, frag);
    gl.linkProgram(this.program);
    gl.useProgram(this.program);

    // Full-screen triangle
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.uTime       = gl.getUniformLocation(this.program, 'u_time');
    this.uResolution = gl.getUniformLocation(this.program, 'u_resolution');
    this.uMouse      = gl.getUniformLocation(this.program, 'u_mouse');
  }

  _compile(type, src) {
    const gl     = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[LiveTab] Shader compile error:', gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  _startLoop() {
    let framesRendered = 0;
    const tick = (now) => {
      if (this._paused) return;
      this.rafId = requestAnimationFrame(tick);

      this.lastFrame = now;

      const t = Math.min((now - this.startTime) * 0.001, 3600); // clamp to 1h max
      const gl = this.gl;
      gl.uniform1f(this.uTime, t);
      gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
      gl.uniform2f(this.uMouse, this.mouseX, this.mouseY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      framesRendered++;
      // Capture a thumbnail after ~1 second (60 frames) directly from the active backbuffer
      if (framesRendered === 60) {
        try {
          const thumb = document.createElement('canvas');
          thumb.width = this.canvas.width / 4;
          thumb.height = this.canvas.height / 4;
          thumb.getContext('2d').drawImage(this.canvas, 0, 0, thumb.width, thumb.height);
          localStorage.setItem('lt_wallpaper_cache', thumb.toDataURL('image/jpeg', 0.5));
        } catch(e) {}
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.gl && this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  applySettings(s) {
    if ((s.webglPreset || s.wallpaperPreset) !== (this.settings.webglPreset || this.settings.wallpaperPreset)) {
      this.settings = s;
      cancelAnimationFrame(this.rafId);
      const fragSrc = this._getShader(s.webglPreset || s.wallpaperPreset || 'fluid');
      if (this.program) this.gl.deleteProgram(this.program);
      this._buildProgram(VERTEX_SHADER, fragSrc);
      this._startLoop();
    }
    this.settings = s;
  }

  pause()  { this._paused = true;  cancelAnimationFrame(this.rafId); }
  resume() { this._paused = false; this.lastFrame = 0; this._startLoop(); }
  destroy() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this._boundResize);
    window.removeEventListener('mousemove', this._boundMouse);
    this.canvas.style.display = 'none';
    if (this.gl && this.program) this.gl.deleteProgram(this.program);
  }

  /* ─── Shader library ─────────────────────────────── */
  _getShader(preset) {
    return SHADER_PRESETS[preset] || SHADER_PRESETS.fluid;
  }
}

/* ══════════ GLSL ══════════════════════════════════════ */

const VERTEX_SHADER = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const SHADER_PRESETS = {

  /* ── Fluid / lava lamp ─────────────────────────── */
  fluid: `
precision mediump float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;

vec3 palette(float t) {
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.263, 0.416, 0.557);
  return a + b * cos(6.28318 * (c * t + d));
}

float noise(vec2 p) {
  return sin(p.x * 3.1) * sin(p.y * 2.7) + 
         sin(p.x * 1.7 + p.y * 2.1) * 0.5 + 
         sin(p.x * 5.0 - p.y * 1.9) * 0.25;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);
  vec2 uv0 = uv;
  vec3 col = vec3(0.0);
  float t = u_time * 0.3;
  
  for (int i = 0; i < 4; i++) {
    uv = fract(uv * 1.5) - 0.5;
    float d = length(uv) * exp(-length(uv0));
    vec3 c = palette(length(uv0) + float(i) * 0.4 + t * 0.4);
    d = sin(d * 8.0 + t) / 8.0;
    d = abs(d);
    d = pow(0.01 / d, 1.2);
    col += c * d;
  }
  
  gl_FragColor = vec4(col, 1.0);
}
`,

  /* ── Galaxy / stars ────────────────────────────── */
  galaxy: `
precision mediump float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float star(vec2 uv, float size) {
  float d = length(uv);
  return smoothstep(size, 0.0, d) * (0.6 + 0.4 * sin(u_time * 3.0 + hash(floor(uv * 100.0)) * 10.0));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
  float t = u_time * 0.08;
  
  // Spiral galaxy rotation
  float angle = atan(uv.y, uv.x) + t;
  float radius = length(uv);
  vec2 rotUV = vec2(cos(angle), sin(angle)) * radius;
  
  // Nebula background
  vec3 col = vec3(0.02, 0.01, 0.06);
  float n = sin(rotUV.x * 8.0 + t) * sin(rotUV.y * 6.0 - t * 0.7);
  col += vec3(0.05, 0.02, 0.15) * smoothstep(0.0, 1.0, n) * (1.0 - radius);
  col += vec3(0.1,  0.05, 0.3)  * smoothstep(0.5, 0.0, radius);
  
  // Stars
  vec2 grid = fract(uv * 30.0 + vec2(t * 0.1));
  float s = star(grid - 0.5, 0.04 * hash(floor(uv * 30.0)));
  col += vec3(0.9, 0.95, 1.0) * s;
  
  // Bright core
  col += vec3(0.3, 0.2, 0.6) * (0.05 / (radius + 0.05));
  
  gl_FragColor = vec4(col, 1.0);
}
`,

  /* ── Perlin-style noise ─────────────────────────── */
  noise: `
precision mediump float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;

vec2 hash2(vec2 p) {
  p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i + vec2(0,0)), f - vec2(0,0)),
                 dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
             mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)),
                 dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.15;
  
  vec2 q = vec2(fbm(uv + vec2(0.0,  0.0)),
                fbm(uv + vec2(5.2,  1.3)));
  vec2 r = vec2(fbm(uv + 4.0 * q + vec2(1.7, 9.2) + t * 0.2),
                fbm(uv + 4.0 * q + vec2(8.3, 2.8) + t * 0.15));
  float f = fbm(uv + 4.0 * r);
  
  vec3 col = mix(vec3(0.10, 0.05, 0.30),
                 vec3(0.40, 0.10, 0.60),
                 clamp(f * f * 4.0, 0.0, 1.0));
  col = mix(col, vec3(0.10, 0.35, 0.55), clamp(length(q), 0.0, 1.0));
  col = mix(col, vec3(0.70, 0.60, 0.95), clamp(length(r.x), 0.0, 1.0));
  col *= f * 2.0 + 0.5;
  
  gl_FragColor = vec4(col, 1.0);
}
`
};
