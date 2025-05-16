// main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI }           from 'three/examples/jsm/libs/lil-gui.module.min.js';

let camera, renderer, controls, gui;
let quadScene, quadCamera, quadMesh;
let uniforms;
let audioContext, analyser, dataArray;
let dynamicMode = false;

const fractalStyles = {
  classic:  { name: 'Classic Julia',    c: new THREE.Vector2(0.285,  0.01), colorMode: 0, power: 2.0 },
  seahorse: { name: 'Seahorse Valley',   c: new THREE.Vector2(-0.742, 0.17), colorMode: 1, power: 2.0 },
  dragon:   { name: 'Dragon Julia',      c: new THREE.Vector2(-0.8,   0.156), colorMode: 2, power: 2.0 },
  power4:   { name: 'Power-4 Julia',     c: new THREE.Vector2(0.355,  0.355), colorMode: 3, power: 4.0 },
  power8:   { name: 'Power-8 Julia',     c: new THREE.Vector2(0.355,  0.355), colorMode: 4, power: 8.0 }
};

init();

async function init() {
  // —— Audio setup ——
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser     = audioContext.createAnalyser();
  analyser.fftSize = 256;
  dataArray    = new Uint8Array(analyser.frequencyBinCount);

  const trackSelect = document.getElementById('trackSelect');
  let audio = new Audio(`music/${trackSelect.value}`);
  audio.loop = true;
  audio.crossOrigin = 'anonymous';
  let srcNode = audioContext.createMediaElementSource(audio);
  srcNode.connect(analyser);
  analyser.connect(audioContext.destination);

  trackSelect.addEventListener('change', () => {
    const wasPlaying = !audio.paused;
    audio.pause();
    srcNode.disconnect();
    audio = new Audio(`music/${trackSelect.value}`);
    audio.loop = true;
    audio.crossOrigin = 'anonymous';
    srcNode = audioContext.createMediaElementSource(audio);
    srcNode.connect(analyser);
    analyser.connect(audioContext.destination);
    if (wasPlaying) audio.play();
  });

  // Play/Pause button
  const playBtn = document.getElementById('playBtn');
  playBtn.addEventListener('click', async () => {
    if (!dynamicMode) {
      await audioContext.resume();
      await audio.play().catch(e => console.warn('Audio play failed:', e));
      dynamicMode = true;
      playBtn.textContent = 'Pause Music & Motion';
    } else {
      audio.pause();
      dynamicMode = false;
      playBtn.textContent = 'Play Music & Motion';
    }
  });

  // Stop Motion button
  document.getElementById('stopMotionBtn')
    .addEventListener('click', () => {
      dynamicMode = false;
    });

  // Resume Motion button
  document.getElementById('resumeMotionBtn')
    .addEventListener('click', () => {
      dynamicMode = true;
    });

  // —— Three.js setup ——
  camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 100);
  camera.position.set(2,2,2);
  camera.lookAt(0,0,0);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('fractalCanvas') });
  renderer.setSize(window.innerWidth, window.innerHeight);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  quadScene  = new THREE.Scene();
  quadCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const geom = new THREE.PlaneGeometry(2,2);

  const fk = Object.keys(fractalStyles)[0];
  uniforms = {
    u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    u_c:          { value: fractalStyles[fk].c.clone() },
    u_colorMode:  { value: fractalStyles[fk].colorMode },
    u_power:      { value: fractalStyles[fk].power },
    u_audioLevel: { value: 0.0 },
    u_camPos:     { value: camera.position.clone() },
    u_invProj:    { value: camera.projectionMatrixInverse.clone() },
    u_viewMat:    { value: camera.matrixWorld.clone() }
  };

  const fragText = await fetch('./shader.frag').then(r=>r.text());
  const material = new THREE.ShaderMaterial({ uniforms, fragmentShader: fragText });

  quadMesh = new THREE.Mesh(geom, material);
  quadMesh.frustumCulled = false;
  quadScene.add(quadMesh);

  const select = document.getElementById('fractalSelect');
  select.innerHTML = '';
  Object.keys(fractalStyles).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = fractalStyles[key].name;
    select.appendChild(opt);
  });
  select.value = fk;
  select.addEventListener('change', e => {
    const s = fractalStyles[e.target.value];
    uniforms.u_c.value.copy(s.c);
    uniforms.u_colorMode.value = s.colorMode;
    uniforms.u_power.value     = s.power;
  });

  window.addEventListener('resize', onResize);

  // GUI
  const params = {
    cRe: uniforms.u_c.value.x,
    cIm: uniforms.u_c.value.y,
    power: uniforms.u_power.value,
    style: uniforms.u_colorMode.value
  };
  gui = new GUI();
  gui.add(params,'cRe',-1.5,1.5,0.01).name('Real c').listen()
     .onChange(v=>uniforms.u_c.value.x=v);
  gui.add(params,'cIm',-1.5,1.5,0.01).name('Imag c').listen()
     .onChange(v=>uniforms.u_c.value.y=v);
  gui.add(params,'power',2.0,16.0,0.1).name('Fractal power').listen()
     .onChange(v=>uniforms.u_power.value=v);
  gui.add(params,'style',{
    'Blue↔Orange':0,'Purple↔Lime':1,'Red↔Cyan':2,
    'Yellow↔Blue':3,'Magenta↔Green':4
  }).name('Palette').listen()
    .onChange(v=>uniforms.u_colorMode.value=v);

  animate();
}

function onResize(){
  renderer.setSize(window.innerWidth,window.innerHeight);
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  uniforms.u_resolution.value.set(window.innerWidth,window.innerHeight);
  uniforms.u_invProj.value.copy(camera.projectionMatrixInverse);
}

function animate(){
  requestAnimationFrame(animate);
  controls.update();

  analyser.getByteFrequencyData(dataArray);
  let low=0,mid=0,high=0;
  for(let i=0;i<8;i++) low+=dataArray[i];
  for(let i=8;i<16;i++) mid+=dataArray[i];
  for(let i=16;i<32;i++)high+=dataArray[i];
  const lowAvg=low/8/255, midAvg=mid/8/255, highAvg=high/16/255;
  uniforms.u_audioLevel.value = lowAvg;

  if(dynamicMode){
    const tRe = lowAvg*3-1.5,
          tIm = midAvg*3-1.5,
          tP  = highAvg*14+2,
          sf = 0.05;
    uniforms.u_c.value.x   += (tRe - uniforms.u_c.value.x)*sf;
    uniforms.u_c.value.y   += (tIm - uniforms.u_c.value.y)*sf;
    uniforms.u_power.value += (tP  - uniforms.u_power.value)*sf;
  }

  uniforms.u_camPos.value.copy(camera.position);
  uniforms.u_viewMat.value.copy(camera.matrixWorld);
  renderer.render(quadScene,quadCamera);
}