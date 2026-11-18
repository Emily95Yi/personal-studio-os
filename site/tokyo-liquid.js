// A single, Hero-local WebGL pass. No textures, video, library or global canvas.
const vertex = `attribute vec2 a_position;
void main(){ gl_Position=vec4(a_position,0.,1.); }`;
const fragment = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform vec2 u_velocity;
uniform float u_force;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float a=.5,v=0.;for(int i=0;i<4;i++){v+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.02+1.7;a*=.5;}return v;}
void main(){
 vec2 uv=gl_FragCoord.xy/u_resolution;
 float aspect=u_resolution.x/u_resolution.y;
 vec2 p=(uv-.5)*vec2(aspect,1.);
 vec2 mouse=(u_pointer-.5)*vec2(aspect,1.);
 vec2 d=p-mouse;
 float influence=exp(-dot(d,d)*4.5)*u_force;
 p+=influence*(u_velocity*.3+vec2(-d.y,d.x)*.24);
 float t=u_time*.055;
 vec2 q=vec2(fbm(p*1.3+vec2(t,-t*.6)),fbm(p*1.3+vec2(4.1,-2.7)+t*.45));
 vec2 r=vec2(fbm(p*1.5+q*2.8+vec2(2.1,t*.6)),fbm(p*1.3+q*2.5+vec2(-t*.5,5.8)));
 float f=fbm(p*1.25+r*3.+q*1.2);
 float fold=sin(p.x*2.1-p.y*2.6+r.x*6.5+q.y*4.1+t);
 float silk=smoothstep(-.65,.85,fold);
 vec3 deep=vec3(.078,.149,.298),blue=vec3(.29,.37,.66);
 vec3 violet=vec3(.39,.33,.72),mist=vec3(.67,.75,.89),light=vec3(.88,.86,.97);
 vec3 col=mix(deep,blue,smoothstep(.18,.7,f));
 col=mix(col,violet,smoothstep(.28,.72,r.y)*.7);
 col=mix(col,mist,smoothstep(.2,.98,silk)*smoothstep(.25,.8,q.x)*.85);
 float edge=pow(1.-abs(fold),10.);
 col=mix(col,light,edge*.13);
 col+=vec3(.06,.035,.08)*pow(silk,3.);
 col*=.82+.18*(1.-smoothstep(.1,1.1,length(p*vec2(.65,1.))));
 float grain=(hash(gl_FragCoord.xy+fract(u_time))-.5)/180.;
 gl_FragColor=vec4(col+grain,1.);
}`;

export function mountLiquid(canvas) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let gl;
  try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' }); }
  catch { return () => {}; }
  if (!gl) return () => {};
  const shaders = [];
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    shaders.push(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      shaders.forEach(item => gl.deleteShader(item));
      gl.deleteProgram(program);
      return () => {};
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    shaders.forEach(item => gl.deleteShader(item));
    gl.deleteProgram(program);
    return () => {};
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = Object.fromEntries(['resolution', 'time', 'pointer', 'velocity', 'force']
    .map(name => [name, gl.getUniformLocation(program, 'u_' + name)]));
  let frame = 0, visible = true, lost = false, stopped = false, last = 0, elapsed = 0;
  let targetX = .5, targetY = .5, x = .5, y = .5, vx = 0, vy = 0, force = 0, targetForce = 0;
  let pointerTime = 0;
  const controller = new AbortController();
  const { signal } = controller;
  const hero = canvas.closest('.tk-hero');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1 : 1.5);
    const rect = hero.getBoundingClientRect();
    // The fragment shader remains below ~1.4 megapixels on large monitors.
    const scale = Math.min(dpr, 1440 / Math.max(rect.width, 1), Math.sqrt(1_400_000 / Math.max(rect.width * rect.height, 1)));
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    if (reduced.matches && !stopped && !lost) draw(performance.now());
  }
  function draw(now) {
    frame = 0;
    if (stopped || lost || !visible || document.hidden) return;
    const dt = Math.min((now - (last || now)) / 1000, .05);
    last = now;
    elapsed += dt;
    const blend = 1 - Math.exp(-dt * 6);
    const dx = (targetX - x) * blend, dy = (targetY - y) * blend;
    x += dx; y += dy;
    vx += (dx * 35 - vx) * blend; vy += (dy * 35 - vy) * blend;
    if (now - pointerTime > 160) targetForce *= .94;
    force += (targetForce - force) * blend;
    gl.uniform1f(uniforms.time, reduced.matches ? 8 : elapsed + 8);
    gl.uniform2f(uniforms.pointer, x, y);
    gl.uniform2f(uniforms.velocity, vx, vy);
    gl.uniform1f(uniforms.force, reduced.matches ? 0 : force);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    canvas.classList.add('is-ready');
    if (!reduced.matches) frame = requestAnimationFrame(draw);
  }
  function resume() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; last = 0;
    if (visible && !document.hidden && !lost && !stopped) draw(performance.now());
  }
  hero.addEventListener('pointermove', event => {
    if (reduced.matches) return;
    const rect = hero.getBoundingClientRect();
    targetX = (event.clientX - rect.left) / rect.width;
    targetY = 1 - (event.clientY - rect.top) / rect.height;
    targetForce = 1;
    pointerTime = performance.now();
  }, { passive: true, signal });
  hero.addEventListener('pointerleave', () => { targetForce = 0; }, { passive: true, signal });
  hero.addEventListener('pointerup', event => { if (event.pointerType === 'touch') targetForce = 0; }, { passive: true, signal });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true; cancelAnimationFrame(frame); canvas.classList.remove('is-ready');
  }, { signal });
  // Restoration falls back to the fully usable static composition until remount.
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); }, { threshold: 0 });
  observer.observe(hero);
  const size = new ResizeObserver(resize);
  size.observe(hero);
  document.addEventListener('visibilitychange', resume, { signal });
  reduced.addEventListener('change', resume, { signal });
  resize(); resume();
  return () => {
    stopped = true; controller.abort(); observer.disconnect(); size.disconnect(); cancelAnimationFrame(frame);
    gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}
