// The diorama: the Lens Agents control plane on the left, a Kubernetes cluster of nodes and Kata microVM pods
// in the middle (one pod opened up), the internet and the model providers on the right, the people who use it
// in front, and a private network behind a firewall at the back. Everything the chapters animate is built here.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {HorizontalTiltShiftShader} from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import {VerticalTiltShiftShader} from 'three/addons/shaders/VerticalTiltShiftShader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {CSS2DRenderer, CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {makeLobster} from './openclaw.js?v=1';

export {THREE, CSS2DObject};
export const C = {
  // three families: cyan = Lens Agents itself, red = the workload, ice = your data and your cluster;
  // green / red / yellow only ever mean allow / deny / secret.
  cyan: '#7fe3ff', claw: '#e5533d', ice: '#b9c8e8', green: '#5ee89a', red: '#ff6b76', amber: '#ffc857', gold: '#ffc857',
  violet: '#8d9cc4', pink: '#f59bd0', kube: '#6d8cff', white: '#eef2fa', grey: '#8b94ad',
};
export const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ─────────────────────────────────────────────────────────────── renderer, camera, post
const host = document.getElementById('world');
export const scene = new THREE.Scene();
scene.background = new THREE.Color('#080b14');
scene.fog = new THREE.FogExp2('#0a0e19', 0.0062);

export const camera = new THREE.PerspectiveCamera(30, 1, 0.3, 500);
export const renderer = new THREE.WebGLRenderer({antialias: false, powerPreference: 'high-performance', stencil: false});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
host.appendChild(renderer.domElement);

export const labelRenderer = new CSS2DRenderer({element: document.getElementById('labels')});

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 5;
controls.maxDistance = 160;
controls.maxPolarAngle = Math.PI * 0.47;
controls.screenSpacePanning = true;

const rt = new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType, samples: 4});
export const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.55, 0.8);
composer.addPass(bloom);
export const tiltH = new ShaderPass(HorizontalTiltShiftShader);
export const tiltV = new ShaderPass(VerticalTiltShiftShader);
tiltH.enabled = tiltV.enabled = false;
tiltH.uniforms.r.value = tiltV.uniforms.r.value = 0.52;
composer.addPass(tiltH);
composer.addPass(tiltV);
composer.addPass(new OutputPass());

export function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  camera.aspect = w / h;
  if (w < 900) camera.setViewOffset(w, h, 0, -h * 0.2, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  labelRenderer.setSize(w, h);
  tiltH.uniforms.h.value = 2.4 / w;
  tiltV.uniforms.v.value = 2.4 / h;
}

// ─────────────────────────────────────────────────────────────── lights
scene.add(new THREE.HemisphereLight('#a9c2ff', '#0b0d14', 1.05));
const cpLamp = new THREE.PointLight('#cfe0ff', 70, 30, 1.4);
cpLamp.position.set(-27, 9, 1);
scene.add(cpLamp);
const netLamp = new THREE.PointLight('#ffd8b0', 50, 26, 1.4);
netLamp.position.set(27, 8, -2);
scene.add(netLamp);
const sun = new THREE.DirectionalLight('#dce7ff', 1.55);
sun.position.set(-14, 30, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left: -42, right: 42, top: 30, bottom: -30, near: 1, far: 100});
sun.shadow.bias = -0.0004;
sun.shadow.radius = 5;
scene.add(sun);
const rim = new THREE.DirectionalLight('#ffb98a', 0.45);
rim.position.set(24, 8, -16);
scene.add(rim);
export const vmLight = new THREE.PointLight(C.cyan, 9, 13, 1.6);
vmLight.position.set(0, 5.2, 0.5);
scene.add(vmLight);
export const coreLight = new THREE.PointLight(C.claw, 10, 7, 1.8);
scene.add(coreLight);

// ─────────────────────────────────────────────────────────────── material helpers
export const time = {value: 0};
const std = (color, o = {}) => new THREE.MeshStandardMaterial({color, roughness: 0.55, metalness: 0.15, ...o});
export const glow = (hex, k = 2.2) => new THREE.MeshBasicMaterial({color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false});
export const emi = (hex, i = 1.2, base = '#141a28') => std(base, {emissive: new THREE.Color(hex), emissiveIntensity: i});

export function fresnelMat(hex, opacity = 1) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {uC: {value: new THREE.Color(hex)}, uO: {value: opacity}, uK: {value: 1}, uT: time},
    vertexShader: `varying vec3 vN; varying vec3 vW;
      void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uC; uniform float uO; uniform float uK; uniform float uT; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 v = normalize(cameraPosition - vW);
        float f = pow(1. - abs(dot(normalize(vN), v)), 3.);
        float scan = smoothstep(.985, 1., sin(vW.y*7. - uT*1.3)*.5+.5);
        float a = (.03 + f*.42 + scan*.06) * uO * uK;
        gl_FragColor = vec4(uC*(.35 + f*1.5 + scan*1.2), a);
      }`,
  });
}

export function flowMat(hex, len, base = 0.14) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {uC: {value: new THREE.Color(hex)}, uT: time, uA: {value: 0}, uB: {value: base}, uD: {value: Math.max(2, len * 0.9)}, uDir: {value: 1}, uS: {value: 1}},
    vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uC; uniform float uT; uniform float uA; uniform float uB; uniform float uD; uniform float uDir; uniform float uS; varying vec2 vU;
      void main(){
        float d = fract(vU.x*uD - uT*1.6*uDir*uS);
        float dash = smoothstep(0.,.12,d)*smoothstep(.5,.26,d);
        float edge = pow(abs(vU.y-.5)*2., 2.);
        float a = (uB*(.55+edge*.8) + uA*dash) * uS;
        gl_FragColor = vec4(uC*(.7 + uA*1.4), a);
      }`,
  });
}

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ─────────────────────────────────────────────────────────────── parts registry (hover, focus, labels)
export const parts = {};
export const pickables = [];
export function part(key, obj, info) {
  parts[key] = {key, obj, ...info, labels: []};
  obj.traverse(o => { if (o.isMesh) { o.userData.part = key; pickables.push(o); } });
  return parts[key];
}

export const allLabels = [];
export function label(title, {kicker = '', color = C.cyan, cls = '', at = V(0, 0, 0), parent = scene, part: pk} = {}) {
  const el = document.createElement('div');
  el.className = 'lb ' + cls;
  el.style.setProperty('--c', color);
  el.innerHTML = (kicker ? `<i>${kicker}</i>` : '') + `<b>${title}</b>`;
  const o = new CSS2DObject(el);
  o.position.copy(at);
  o.center.set(0.5, 1);
  parent.add(o);
  const L = {el, o, part: pk, set(t, k) { el.innerHTML = (k ?? kicker ? `<i>${k ?? kicker}</i>` : '') + `<b>${t}</b>`; }};
  if (pk && parts[pk]) parts[pk].labels.push(L);
  allLabels.push(L);
  return L;
}

function screenTex(lines, w = 512, h = 320) {
  return canvasTex(w, h, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0b1426'); gr.addColorStop(1, '#050810');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.font = '500 24px "DM Mono", monospace';
    lines.forEach(([t, c], i) => { g.fillStyle = c; g.fillText(t, 22, 48 + i * 36); });
  });
}

// ─────────────────────────────────────────────────────────────── ground
export const GROUND = -0.52;
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), std('#0d111c', {roughness: 0.9, metalness: 0}));
  g.rotation.x = -Math.PI / 2;
  g.position.y = GROUND;
  g.receiveShadow = true;
  scene.add(g);
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {uT: time},
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uT; varying vec3 vW;
      float line(float x, float w){ float d = abs(fract(x-.5)-.5); return 1.-smoothstep(0., w, d); }
      void main(){
        vec2 p = vW.xz;
        float g = max(line(p.x/2., .012), line(p.y/2., .012))*.5 + max(line(p.x/10., .004), line(p.y/10., .004))*.6;
        float fall = exp(-length(p - vec2(-2.,0.))*.035);
        gl_FragColor = vec4(vec3(.35,.55,.95)*g, g*.16*fall);
      }`,
  }));
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = GROUND + 0.02;
  scene.add(grid);
}

// ─────────────────────────────────────────────────────────────── the Kubernetes cluster
// A floor plate with nodes on it. Each node is a server slab that runs Kata pods: every pod is its own microVM.
export const CLUSTER = {x0: -14.5, x1: 15, z0: -17, z1: 8, top: 0};
export const clusterGroup = new THREE.Group();
scene.add(clusterGroup);
{
  const w = CLUSTER.x1 - CLUSTER.x0, d = CLUSTER.z1 - CLUSTER.z0;
  const plate = new THREE.Mesh(new RoundedBoxGeometry(w, 0.5, d, 3, 0.2), std('#111827', {roughness: 0.5, metalness: 0.45}));
  plate.position.set((CLUSTER.x0 + CLUSTER.x1) / 2, -0.25, (CLUSTER.z0 + CLUSTER.z1) / 2);
  plate.receiveShadow = true;
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.02, 0.52, d + 0.02)), new THREE.LineBasicMaterial({color: new THREE.Color(C.kube).multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.55}));
  edge.position.copy(plate.position);
  clusterGroup.add(plate, edge);
  part('cluster', clusterGroup, {title: 'Your Kubernetes cluster', kicker: 'namespace lens-agents-sandbox', color: C.kube, chapter: 'overview',
    text: 'Where the sandboxes run. With the kubernetes provisioner, the platform makes one Pod per sandbox in the <release>-sandbox namespace. Set sandbox.k8s.runtimeClassName (for example kata-clh) and every Pod boots as its own Kata microVM.'});
  label('Kubernetes cluster', {kicker: 'nodes · Kata microVM pods', color: C.kube, at: V(CLUSTER.x0 + 3.2, 0.4, CLUSTER.z1 - 0.3), part: 'cluster'});
}

export const NODE_TOP = 0.9;
export const nodes = {};
function makeNode(key, x, z, w, d, name, focus = false) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, NODE_TOP, d, 3, 0.16), std('#1a2130', {roughness: 0.4, metalness: 0.6}));
  body.position.y = NODE_TOP / 2;
  body.castShadow = body.receiveShadow = true;
  const top = new THREE.Mesh(new RoundedBoxGeometry(w - 0.5, 0.04, d - 0.5, 2, 0.05), std('#141b28', {roughness: 0.6}));
  top.position.y = NODE_TOP + 0.01;
  top.receiveShadow = true;
  g.add(body, top);
  // front bezel: vents and status lights
  for (let i = 0; i < 6; i++) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.02), std('#0c111b'));
    v.position.set(-w / 2 + 1.1 + i * 1.05, NODE_TOP * 0.5, d / 2 + 0.005);
    g.add(v);
  }
  const leds = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glow(i ? C.green : C.kube, 2));
    l.position.set(w / 2 - 0.5 - i * 0.22, NODE_TOP * 0.5, d / 2 + 0.03);
    g.add(l);
    leds.push(l);
  }
  g.userData.leds = leds;
  clusterGroup.add(g);
  nodes[key] = g;
  part('node-' + key, g, {title: name, kicker: 'a Kubernetes node', color: C.kube, chapter: 'boot',
    text: focus
      ? 'The node the scheduler picked for this sandbox. Its kubelet asks the Kata runtime to start the Pod, and Kata boots a small VM with its own guest kernel around the containers. The node’s kernel needs nf_tables for the sandbox cage.'
      : 'Another machine in the cluster, running other people’s sandboxes. Each Pod is a separate microVM, so a sandbox cannot see its neighbours even on the same node.'});
  label(name, {kicker: focus ? 'kubelet · kata-clh' : 'kubelet', color: C.kube, cls: 'sm', at: V(-w / 2 + 1.2, NODE_TOP + 0.1, d / 2), parent: g, part: 'node-' + key});
  return g;
}
makeNode('a', 0, -1.2, 11.4, 13.6, 'node-a', true);
makeNode('b', -9.2, -12.3, 9, 7, 'node-b');
makeNode('c', 1.2, -12.3, 9, 7, 'node-c');
makeNode('d', 11.2, -12.3, 6.6, 7, 'node-d');

// Other sandboxes: small glass pods, each with a tiny workload inside.
export const miniPods = [];
{
  const spots = [['a', -3.0, -4.4, '#7aa2ff'], ['a', -0.2, -4.4, '#ffb454'], ['a', 2.6, -4.4, C.claw],
    ['b', -2.4, -1.2, C.claw], ['b', 0.4, -1.2, '#7aa2ff'], ['b', 2.8, 1.0, C.claw], ['b', -1.2, 1.6, '#c69cff'],
    ['c', -2.6, 1.0, '#ffb454'], ['c', 0.2, -1.4, C.claw], ['c', 2.8, 0.6, '#7aa2ff'],
    ['d', -1.2, -1.0, '#c69cff'], ['d', 1.4, 1.2, C.claw]];
  spots.forEach(([n, x, z, c], i) => {
    const g = new THREE.Group();
    g.position.set(x, NODE_TOP + 0.05, z);
    const m = fresnelMat(C.cyan, 0.9);
    const s = new THREE.Mesh(new RoundedBoxGeometry(1.7, 1.7, 1.7, 3, 0.12), m);
    s.position.y = 0.95;
    s.renderOrder = 8;
    const ped = new THREE.Mesh(new RoundedBoxGeometry(1.95, 0.14, 1.95, 2, 0.05), std('#161d2c', {metalness: 0.5}));
    ped.position.y = 0.07;
    const w = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.42, 0.4, 2, 0.08), std('#20140f', {emissive: new THREE.Color(c), emissiveIntensity: 1.1}));
    w.position.y = 0.55;
    w.castShadow = true;
    g.add(ped, s, w);
    g.userData = {mat: m, body: w, phase: i * 1.7};
    nodes[n].add(g);
    miniPods.push(g);
    part('pod-' + i, g, {title: ['Another OpenClaw', 'A Hermes agent', 'A Prism agent', 'A CI agent'][i % 4], kicker: n === 'a' ? 'a neighbour on node-a' : 'someone else’s sandbox', color: C.cyan, chapter: 'overview',
      text: n === 'a'
        ? 'Another sandbox on the same node. A node runs many sandbox Pods, each sized by its own CPU and memory requests. They share the machine but not a kernel: each is its own Kata microVM with its own nftables cage.'
        : 'A separate sandbox in the same cluster, in its own Kata microVM, with its own policy, credentials and budget. It cannot reach this one: each Pod has its own kernel and its own nftables cage.'});
  });
}

// kube-apiserver: where the platform's reconciler writes Pods.
export const apiserver = new THREE.Group();
apiserver.position.set(-11.6, 0, 3.6);
clusterGroup.add(apiserver);
{
  const b = new THREE.Mesh(new RoundedBoxGeometry(2.0, 1.4, 2.0, 3, 0.16), std('#172036', {metalness: 0.55, roughness: 0.32}));
  b.position.y = 0.7; b.castShadow = true;
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.07, 8, 7), glow(C.kube, 2.2));
  wheel.position.set(0, 0.75, 1.02);
  const hub = new THREE.Mesh(new THREE.CircleGeometry(0.18, 7), glow(C.kube, 2.2));
  hub.position.set(0, 0.75, 1.03);
  apiserver.add(b, wheel, hub);
  apiserver.userData.wheel = wheel;
  part('apiserver', apiserver, {title: 'kube-apiserver', kicker: 'the cluster’s own control plane', color: C.kube, chapter: 'boot',
    text: 'The platform’s reconciler writes one Pod per sandbox here (or one Sandbox custom resource with the agents.x-k8s.io controller). The scheduler picks a node, and its kubelet starts it.'});
  label('kube-apiserver', {kicker: 'scheduler · Pods', color: C.kube, cls: 'sm', at: V(0, 1.9, 0), parent: apiserver, part: 'apiserver'});
}

// Persistent volume: the sandbox's PVC, mounted at /data.
export const pv = new THREE.Group();
pv.position.set(-8.2, 0, 5.2);
clusterGroup.add(pv);
export let pvFill;
{
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.05, 48), std('#16223a', {metalness: 0.75, roughness: 0.28}));
  c.position.y = 0.52; c.castShadow = true;
  const rim1 = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.03, 8, 64), glow(C.ice, 1.8));
  rim1.rotation.x = Math.PI / 2; rim1.position.y = 1.05;
  pvFill = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.86, 64, 1, 0, 0.9), new THREE.MeshBasicMaterial({color: new THREE.Color(C.ice).multiplyScalar(1.6), toneMapped: false, side: THREE.DoubleSide, transparent: true, opacity: 0.85}));
  pvFill.rotation.x = -Math.PI / 2; pvFill.position.y = 1.06;
  pv.add(c, rim1, pvFill);
  part('pv', pv, {title: 'PersistentVolumeClaim', kicker: 'sandbox-data-<hash> · mounted at /data', color: C.ice, chapter: 'boot',
    text: 'The sandbox’s own disk. It survives stop, start and every new revision, so OpenClaw keeps its config, state and workspace across restarts. It is deleted with the sandbox.'});
  label('PVC · /data', {kicker: 'survives restarts', color: C.ice, cls: 'sm', at: V(0, 1.55, 0), parent: pv, part: 'pv'});
}

// Egress: the node network's way out to the internet.
export const egress = new THREE.Group();
egress.position.set(9.6, 0, 3.4);
clusterGroup.add(egress);
{
  const b = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.8, 1.6, 3, 0.14), std('#151c2b', {metalness: 0.6, roughness: 0.3}));
  b.position.y = 0.4; b.castShadow = true;
  egress.add(b);
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glow(C.cyan, 1.8));
    l.position.set(-0.45 + i * 0.3, 0.5, 0.81);
    egress.add(l);
  }
  part('egress', egress, {title: 'Cluster egress', kicker: 'node network · NAT', color: C.cyan, chapter: 'network',
    text: 'The cluster’s normal way out. By the time a packet from the sandbox gets here, the proxy inside the Pod has already decided it may leave, and dialed it itself.'});
  label('egress', {kicker: 'node network', color: C.cyan, cls: 'sm', at: V(0, 1.3, 0), parent: egress, part: 'egress'});
}

// ─────────────────────────────────────────────────────────────── the opened-up pod: one Kata microVM
export const VM = {x: 0, z: 0, w: 7.4, h: 7.4, d: 7.4, floor: NODE_TOP + 0.35};
VM.top = VM.floor + VM.h; VM.cy = VM.floor + VM.h / 2;
export const vm = new THREE.Group();
scene.add(vm);
export const vmInner = new THREE.Group();   // everything that boots
vm.add(vmInner);
{
  const ped = new THREE.Mesh(new RoundedBoxGeometry(VM.w + 0.9, 0.32, VM.d + 0.9, 3, 0.14), std('#161d2c', {roughness: 0.35, metalness: 0.5}));
  ped.position.y = NODE_TOP + 0.18;
  ped.castShadow = ped.receiveShadow = true;
  vm.add(ped);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(VM.w + 0.92, 0.03, VM.d + 0.92), glow(C.cyan, 1.4));
  lip.position.y = NODE_TOP + 0.34;
  vm.add(lip);
  part('pedestal', ped, {title: 'Kata runtime', kicker: 'runtimeClassName: kata-clh', color: C.cyan, chapter: 'boot',
    text: 'The kubelet hands this Pod to the Kata runtime, which boots a lightweight VM (here with Cloud Hypervisor) and runs the Pod’s containers inside it. Without a RuntimeClass the same Pod runs as ordinary containers; the cage inside is the same either way.'});
}
export const shellMat = fresnelMat(C.cyan, 1);
export const shell = new THREE.Mesh(new RoundedBoxGeometry(VM.w, VM.h, VM.d, 4, 0.28), shellMat);
shell.position.y = VM.cy;
shell.renderOrder = 10;
vm.add(shell);
export const shellEdges = new THREE.Group();
{
  const lm = new THREE.LineBasicMaterial({color: new THREE.Color(C.cyan).multiplyScalar(1.1), transparent: true, opacity: 0.22, toneMapped: false});
  shellEdges.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(VM.w - 0.1, VM.h - 0.1, VM.d - 0.1)), lm));
  const bm = new THREE.LineBasicMaterial({color: new THREE.Color(C.cyan).multiplyScalar(2.6), toneMapped: false, transparent: true, opacity: 1});
  const pts = [], hw = VM.w / 2 - 0.05, hh = VM.h / 2 - 0.05, hd = VM.d / 2 - 0.05, k = 0.7;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const c = V(sx * hw, sy * hh, sz * hd);
    pts.push(c, V(c.x - sx * k, c.y, c.z), c, V(c.x, c.y - sy * k, c.z), c, V(c.x, c.y, c.z - sz * k));
  }
  shellEdges.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), bm));
  shellEdges.position.y = VM.cy;
  shellEdges.userData.mats = [lm, bm];
  vm.add(shellEdges);
  part('shell', shell, {title: 'The sandbox Pod', kicker: 'one Kata microVM', color: C.cyan, chapter: 'overview',
    text: 'One sandbox: a Kubernetes Pod booted as a microVM with its own kernel. The agent only sees its own image, its volume and what the policy lets through the proxy gate. No port on it accepts connections from outside.'});
}
export const vmLabel = label('sandbox brisk-otter-0042', {kicker: 'Pod · Kata microVM · 500m CPU · 2Gi', color: C.cyan, at: V(-VM.w / 2 + 0.2, VM.top + 0.35, VM.d / 2), part: 'shell'});

// Layer stack: guest kernel, image layers, the /.lens emptyDir, the container's writable layer.
export const layers = {};
{
  const W = VM.w - 0.9, D = VM.d - 0.9, B = VM.floor;
  const kern = new THREE.Mesh(new RoundedBoxGeometry(W + 0.3, 0.22, D + 0.3, 2, 0.06), emi('#46609a', 0.45, '#10151f'));
  kern.position.y = B + 0.17; kern.castShadow = kern.receiveShadow = true;
  vmInner.add(kern);
  layers.kernel = kern;
  part('kernel', kern, {title: 'Guest kernel', kicker: 'Kata · its own', color: C.ice, chapter: 'boot',
    text: 'Kata boots the Pod with its own small Linux kernel. A workload that exploits a kernel bug exploits this kernel, not the node’s, and not the other sandboxes on the node.'});
  label('guest kernel', {kicker: 'kata', color: C.ice, cls: 'sm', at: V(W / 2 - 0.6, B + 0.22, D / 2 + 0.2), parent: vmInner, part: 'kernel'});

  layers.image = [];
  ['#34425f', '#3f4f70', '#4b5d82'].forEach((c, i) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(W, 0.12, D, 2, 0.04), emi(c, 0.35, '#151a26'));
    m.position.y = B + 0.38 + i * 0.16;
    m.castShadow = m.receiveShadow = true;
    vmInner.add(m);
    layers.image.push(m);
    part('image' + i, m, {title: `Image layer ${i + 1} of 3`, kicker: 'ghcr.io/openclaw/openclaw:2026.8.2 · read-only', color: C.violet, chapter: 'boot',
      text: 'The agent’s own container image, pinned by the template. The platform does not rebuild it: it overrides the command so the supervisor starts first, and seeds its tools next to it.'});
  });
  label('OpenClaw image', {kicker: 'read-only layers', color: C.violet, cls: 'sm', at: V(-W / 2 + 0.2, B + 0.72, D / 2 + 0.05), parent: vmInner, part: 'image2'});

  const rtl = new THREE.Mesh(new RoundedBoxGeometry(W, 0.08, D, 2, 0.03), emi(C.cyan, 0.5, '#0d2230'));
  rtl.position.y = B + 0.86; rtl.receiveShadow = true;
  vmInner.add(rtl);
  layers.runtime = rtl;
  part('runtime', rtl, {title: '/.lens', kicker: 'emptyDir · read-only to the agent', color: C.cyan, chapter: 'boot',
    text: 'An emptyDir the seed-supervisor init container fills with three static binaries: nexus-agent-sandbox (the supervisor), nft, and nexus-mcp. The agent container mounts it read-only.'});
  label('/.lens', {kicker: 'supervisor · nft · nexus-mcp', color: C.cyan, cls: 'sm', at: V(0.4, B + 0.9, D / 2 + 0.05), parent: vmInner, part: 'runtime'});

  const upMat = new THREE.MeshStandardMaterial({color: '#2e1c18', emissive: new THREE.Color(C.claw), emissiveIntensity: 0.22, transparent: true, opacity: 0.78, roughness: 0.4});
  const up = new THREE.Mesh(new RoundedBoxGeometry(W, 0.1, D, 2, 0.04), upMat);
  up.position.y = B + 1.0; up.receiveShadow = true;
  vmInner.add(up);
  layers.upper = up;
  part('upper', up, {title: 'Container writable layer', kicker: 'gone with the Pod', color: C.claw, chapter: 'boot',
    text: 'Anything written outside /data lands here and disappears when the Pod is replaced: on stop, on a new revision, or on delete. That is why the OpenClaw template points its config, state and workspace at /data.'});
  label('writable layer', {kicker: 'per Pod', color: C.claw, cls: 'sm', at: V(W / 2 - 1.1, B + 1.05, -D / 2 + 0.1), parent: vmInner, part: 'upper'});
}
export const SURF = VM.floor + 1.06;   // top of the writable layer, where the workload's filesystem "stands"

// The workload — a little OpenClaw — and the supervisor ring around it.
export const core = new THREE.Group();
core.position.set(-1.25, SURF + 0.78, 0.1);
vmInner.add(core);
export const lobster = makeLobster(core);
part('workload', core, {title: 'OpenClaw — the workload', kicker: 'openclaw gateway · uid 1000 (node)', color: C.claw, chapter: 'overview',
  text: 'The demo agent: an OpenClaw gateway with its browser Control UI, running as the image’s own unprivileged user. Watch its face. Every request it makes passes the proxy gate, and the only way to reach its UI is the sandbox ingress.'});
label('OpenClaw', {kicker: 'the workload · uid 1000', color: C.claw, at: V(-1.1, 1.05, 0), parent: core, part: 'workload'});

export const ring = new THREE.Group();
ring.position.copy(core.position);
vmInner.add(ring);
{
  const t1 = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.035, 10, 120), glow(C.cyan, 2.0));
  t1.rotation.x = Math.PI / 2;
  const t2 = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.018, 8, 120), glow(C.cyan, 1.2));
  t2.rotation.x = Math.PI / 2 + 0.25;
  ring.add(t1, t2);
  for (let i = 0; i < 6; i++) {
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), glow(C.cyan, 2.6));
    const a = i / 6 * Math.PI * 2;
    n.position.set(Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0);
    t1.add(n);
  }
  ring.userData.t1 = t1; ring.userData.t2 = t2;
  const hit = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.16, 6, 40), new THREE.MeshBasicMaterial({visible: false}));
  hit.rotation.x = Math.PI / 2;
  ring.add(hit);
  part('supervisor', ring, {title: 'nexus-agent-sandbox', kicker: 'the supervisor · PID 1 · root', color: C.cyan, chapter: 'boot',
    text: 'The container’s command is replaced with /.lens/nexus-agent-sandbox, built on lens-sandbox-core (the same core lns uses). As root it makes itself non-dumpable, installs the nftables cage, starts the proxy and DNS stub, dials the platform, and only then starts OpenClaw as uid 1000.'});
  label('nexus-agent-sandbox', {kicker: 'supervisor · lens-sandbox-core', color: C.cyan, cls: 'sm', at: V(-1.55, 0.1, 1.0), parent: ring, part: 'supervisor'});
}

// Init containers at the back of the pod.
export const procs = {};
{
  const defs = [
    ['seed', 'seed-supervisor', 'init container 1', V(-2.85, SURF + 0.55, -2.95), 'Runs the loader image and copies the three static binaries into the /.lens emptyDir, then exits. The agent image stays exactly as its vendor built it.'],
    ['discover', 'discover-image', 'init container 2', V(-1.75, SURF + 0.55, -2.95), 'Runs the agent image once with /.lens/nexus-agent-sandbox discover, and records the image’s own user, group and working directory, so the supervisor can drop to them later.'],
  ];
  const lm = new THREE.LineBasicMaterial({color: new THREE.Color(C.cyan).multiplyScalar(1.4), transparent: true, opacity: 0.55, toneMapped: false});
  let prev = null;
  for (const [k, t, kick, p, text] of defs) {
    const g = new THREE.Group();
    g.position.copy(p);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.34, 4, 12), emi(C.cyan, 1.1, '#0d1c28'));
    m.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 20), std('#1b2436', {metalness: 0.6, roughness: 0.3}));
    cap.position.y = -0.46;
    g.add(m, cap);
    vmInner.add(g);
    procs[k] = g;
    g.userData.mat = m.material;
    part(k, g, {title: t, kicker: kick, color: C.cyan, chapter: 'boot', text});
    label(t, {kicker: kick, color: C.cyan, cls: 'sm', at: V(0, 0.55, 0), parent: g, part: k});
    if (prev) vmInner.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([prev, p]), lm));
    prev = p;
  }
  vmInner.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([prev, V(-1.6, SURF + 1.2, -0.7), V(core.position.x - 0.8, core.position.y, core.position.z - 0.9)]), lm));
}

// The proxy gate: the only way out of the pod.
export const GATE = V(2.1, SURF + 1.2, 2.0);
export const gate = new THREE.Group();
gate.position.set(GATE.x, 0, GATE.z);
vmInner.add(gate);
const lampMat = new THREE.MeshBasicMaterial({color: new THREE.Color(C.cyan).multiplyScalar(2.6), toneMapped: false});
const arm = new THREE.Group();
export const gateCtl = {open: 0, target: 0, shake: 0, blink: false, color: new THREE.Color(C.cyan), flashT: 0};
const curtainMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  uniforms: {uT: time, uC: {value: new THREE.Color(C.cyan)}, uF: {value: 0}, uB: {value: 1}},
  vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uT; uniform vec3 uC; uniform float uF; uniform float uB; varying vec2 vU;
    void main(){
      float lines = smoothstep(.6, 1., sin(vU.y*90.)*.5+.5);
      float sweep = 1. - smoothstep(0., .08, abs(fract(vU.y + uT*.45) - .5));
      float edge = smoothstep(.42, .5, abs(vU.x-.5)) + smoothstep(.45, .5, abs(vU.y-.5));
      float a = (.06 + lines*.06 + sweep*.22 + edge*.18 + uF*.45) * uB;
      gl_FragColor = vec4(uC*(1.2 + uF*2.), a);
    }`,
});
function signTex() {
  return canvasTex(1024, 256, (g, W) => {
    g.fillStyle = '#0a1220'; g.fillRect(0, 0, W, 256);
    g.strokeStyle = '#7fe3ff'; g.lineWidth = 6; g.strokeRect(8, 8, W - 16, 240);
    g.fillStyle = '#eaf9ff'; g.font = '800 96px "Outfit", system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText('BOUNDARY PROXY', W / 2, 124);
    g.fillStyle = '#7fe3ff'; g.font = '500 40px "DM Mono", monospace';
    g.fillText('every connection is checked here', W / 2, 198);
  });
}
{
  const pm = std('#1d2536', {metalness: 0.7, roughness: 0.3});
  const HW = 1.4, TOP = SURF + 4.0, armY = GATE.y, L = 2.55;
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new RoundedBoxGeometry(0.42, TOP - SURF, 0.5, 2, 0.08), pm);
    p.position.set(s * HW, SURF + (TOP - SURF) / 2, 0);
    p.castShadow = true;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, TOP - SURF - 0.3, 0.52), glow(C.cyan, 2));
    strip.position.set(s * (HW - 0.22), SURF + (TOP - SURF) / 2, 0);
    gate.add(p, strip);
  }
  const beam = new THREE.Mesh(new RoundedBoxGeometry(HW * 2 + 0.7, 0.85, 0.6, 2, 0.1), pm);
  beam.position.set(0, TOP + 0.3, 0);
  beam.castShadow = true;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 + 0.4, (HW * 2 + 0.4) / 4), new THREE.MeshBasicMaterial({map: signTex(), toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3)}));
  sign.position.set(0, TOP + 0.3, 0.31);
  const signBack = sign.clone(); signBack.rotation.y = Math.PI; signBack.position.z = -0.31;
  const lamps = [-1, 1].map(s => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), lampMat); l.position.set(s * (HW + 0.2), TOP + 0.9, 0); return l; });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 - 0.42, TOP - SURF - 0.1), curtainMat);
  curtain.position.set(0, SURF + (TOP - SURF) / 2, 0);
  const stripes = canvasTex(256, 16, (g, W, H) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#3fb6d6' : '#f4f8ff'; g.fillRect(i * W / 8, 0, W / 8, H); } });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(L, 0.26, 0.22), new THREE.MeshStandardMaterial({map: stripes, roughness: 0.45, emissive: new THREE.Color('#ffffff'), emissiveMap: stripes, emissiveIntensity: 0.5}));
  bar.position.x = -L / 2;
  bar.castShadow = true;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), lampMat);
  tip.position.x = -L;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 20), pm);
  hub.rotation.x = Math.PI / 2;
  arm.add(bar, tip, hub);
  arm.position.set(HW - 0.1, armY, 0.3);
  const laneMat = new THREE.MeshBasicMaterial({color: new THREE.Color(C.cyan).multiplyScalar(0.5), transparent: true, opacity: 0.16, depthWrite: false});
  const laneIn = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.9), laneMat);
  laneIn.rotation.x = -Math.PI / 2;
  laneIn.position.set(0, SURF + 0.07, -0.95);
  const stop = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 - 0.4, 0.12), new THREE.MeshBasicMaterial({color: new THREE.Color('#eef2fa').multiplyScalar(1.4), toneMapped: false, transparent: true, opacity: 0.7, depthWrite: false}));
  stop.rotation.x = -Math.PI / 2;
  stop.position.set(0, SURF + 0.08, -0.35);
  gate.add(beam, sign, signBack, ...lamps, curtain, arm, laneIn, stop);
  gateCtl.update = (dt, t) => {
    gateCtl.open += (gateCtl.target - gateCtl.open) * Math.min(1, dt * 6);
    gateCtl.shake = Math.max(0, gateCtl.shake - dt * 1.6);
    arm.rotation.z = -Math.PI / 2 * 0.9 * gateCtl.open + Math.sin(t * 38) * 0.06 * gateCtl.shake;
    gateCtl.flashT = Math.max(0, gateCtl.flashT - dt * 0.7);
    const on = gateCtl.blink ? (Math.sin(t * 9) > 0 ? 1 : 0.25) : 1;
    lampMat.color.copy(gateCtl.color).multiplyScalar((1.6 + gateCtl.flashT * 2.2) * on);
    curtainMat.uniforms.uC.value.copy(gateCtl.color);
    curtainMat.uniforms.uF.value = gateCtl.flashT * on + (gateCtl.blink ? 0.35 * on : 0);
    if (!gateCtl.blink && gateCtl.flashT <= 0) gateCtl.color.lerp(new THREE.Color(gateCtl.rest || C.cyan), Math.min(1, dt * 2));
  };
  gateCtl.signal = (hex, blink = false) => { gateCtl.color.set(hex); gateCtl.blink = blink; gateCtl.flashT = blink ? 0 : 1; };
  gateCtl.raise = () => { gateCtl.target = 1; };
  gateCtl.lower = () => { gateCtl.target = 0; };
  gateCtl.refuse = () => { gateCtl.shake = 1; };
  part('gate', gate, {title: 'The boundary proxy', kicker: 'supervisor · :3128 :3129 · DNS :5355', color: C.cyan, chapter: 'network',
    text: 'The only way out of the Pod. nftables sends every TCP connection the agent opens to the supervisor’s proxy (transparent :3129, or :3128 via HTTPS_PROXY) and every DNS query to its stub on :5355. The proxy reads the host name, checks it against the policy, swaps placeholders for real credentials, and writes an audit event.'});
}

// Ports in the pod walls: eth0 (right, to the internet) and the uplink (left, to the platform).
function port(size, color) {
  const g = new THREE.Group();
  const f = new THREE.Mesh(new RoundedBoxGeometry(size.x, size.y, size.z, 2, 0.05), std('#1d2638', {metalness: 0.7, roughness: 0.3}));
  const l = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.4 + 0.02, size.y * 0.55, size.z * 0.55), glow(color, 2));
  g.add(f, l);
  g.userData.light = l;
  return g;
}
export const NIC = V(VM.w / 2, SURF + 1.45, 2.85);
export const nic = port(V(0.36, 0.7, 1.0), C.cyan);
nic.position.copy(NIC);
vmInner.add(nic);
part('nic', nic, {title: 'eth0', kicker: 'the Pod’s network', color: C.cyan, chapter: 'network',
  text: 'The Pod’s one network interface. The only traffic that reaches it is traffic the proxy dialed itself, after the policy allowed it.'});
label('eth0', {kicker: 'pod network', color: C.cyan, cls: 'sm', at: V(0.3, 0.55, 0), parent: nic, part: 'nic'});

export const UPLINK = V(-VM.w / 2, SURF + 1.25, -0.9);
export const uplink = port(V(0.34, 1.5, 1.4), C.cyan);
uplink.position.copy(UPLINK);
vmInner.add(uplink);
part('uplink', uplink, {title: 'Outbound links to the platform', kicker: 'wss /v1/sandbox · /v1/sandbox/data', color: C.cyan, chapter: 'boot',
  text: 'The supervisor dials out to the platform over WebSockets, with its sandbox token: one control channel (policy frames down, audit events up) and one data tunnel (ingress traffic, as multiplexed streams). Drawn on their own for clarity; they leave over eth0 like everything else.'});
label('uplink', {kicker: 'dials out', color: C.cyan, cls: 'sm', at: V(-0.3, 0.9, 0), parent: uplink, part: 'uplink'});

export const PVSOCK = V(-VM.w / 2, SURF + 0.7, 2.0);
export const pvSock = port(V(0.3, 0.7, 0.9), C.ice);
pvSock.position.copy(PVSOCK);
vmInner.add(pvSock);

// Plates on the floor of the pod: where things "stand" in the guest.
export const plates = {};
function plate(key, pos, w, d, color, title, kicker, info) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, 0.08, d, 2, 0.03), new THREE.MeshStandardMaterial({color: '#0f1822', emissive: new THREE.Color(color), emissiveIntensity: 0.55, roughness: 0.4}));
  m.receiveShadow = true;
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.09, d)), new THREE.LineBasicMaterial({color: new THREE.Color(color).multiplyScalar(1.8), toneMapped: false}));
  g.add(m, e);
  vmInner.add(g);
  plates[key] = g;
  g.userData.mat = m.material;
  part(key, g, info);
  label(title, {kicker, color, cls: 'sm mono', at: V(-w / 2 + 0.1, 0.12, d / 2), parent: g, part: key});
  return g;
}
plate('p-data', V(-2.35, SURF + 0.04, 1.75), 1.9, 1.5, C.ice, '/data', 'PVC', {title: '/data ← the PVC', kicker: 'LENS_SANDBOX_WRITABLE_DIR', color: C.ice, chapter: 'boot',
  text: 'The persistent volume. The supervisor chowns it to the image’s user while it is still root. OpenClaw keeps openclaw.json, its state and its workspace here.'});
plate('p-port', V(1.6, SURF + 0.04, -1.9), 2.4, 1.1, C.pink, '127.0.0.1:18789', 'loopback only', {title: 'The Control UI port', kicker: 'gateway.bind: loopback · 18789', color: C.pink, chapter: 'ingress',
  text: 'OpenClaw’s gateway listens on loopback only. Nothing outside the Pod can connect to it. The one way in is the data tunnel: the supervisor dials 127.0.0.1:18789 for each ingress stream.'});
plate('p-tmp', V(-0.95, SURF + 0.04, 2.9), 0.8, 0.7, C.grey, '/tmp', 'files', {title: '/tmp', kicker: 'files the policy writes', color: C.grey, chapter: 'credentials',
  text: 'Where the supervisor writes the policy’s files before the agent starts, for example /tmp/nexus-kubeconfig. They hold placeholders, never real values.'});

// ─────────────────────────────────────────────────────────────── the control plane (outside the cluster)
export const CP = {x: -29, z: 0, w: 13, d: 19, top: 1.0};
export const cpGroup = new THREE.Group();
scene.add(cpGroup);
{
  const base = new THREE.Mesh(new RoundedBoxGeometry(CP.w, CP.top + 0.5, CP.d, 3, 0.3), std('#141a28', {roughness: 0.42, metalness: 0.55}));
  base.position.set(CP.x, (CP.top - 0.5) / 2 - 0.02, CP.z);
  base.castShadow = base.receiveShadow = true;
  const lip = new THREE.Mesh(new THREE.BoxGeometry(CP.w - 0.3, 0.03, CP.d - 0.3), glow(C.cyan, 0.9));
  lip.position.set(CP.x, CP.top + 0.005, CP.z);
  cpGroup.add(base, lip);
  part('cp', cpGroup, {title: 'The Lens Agents control plane', kicker: 'helm chart lens-agents', color: C.cyan, chapter: 'overview',
    text: 'The platform server, its database and the Admin UI. It decides everything the sandboxes may do and records everything they did, but it never runs an agent itself. It is drawn outside the cluster; the Helm chart can also run it inside the same cluster.'});
  label('Lens Agents control plane', {kicker: 'nexus · postgres · admin UI', color: C.cyan, at: V(CP.x - CP.w / 2 + 3.4, CP.top + 0.2, CP.z + CP.d / 2 - 0.2), part: 'cp'});
}
export const CPT = CP.top;
export const nexus = new THREE.Group();
nexus.position.set(CP.x + 0.4, CPT, CP.z - 1.2);
scene.add(nexus);
{
  const b = new THREE.Mesh(new RoundedBoxGeometry(3.0, 5.6, 3.0, 3, 0.24), std('#151c2b', {metalness: 0.55, roughness: 0.32}));
  b.position.y = 2.8; b.castShadow = true;
  nexus.add(b);
  nexus.userData.rings = [];
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(3.04, 0.06, 3.04), glow(C.cyan, 1.5));
    r.position.y = 0.8 + i * 0.8;
    nexus.add(r);
    nexus.userData.rings.push(r);
  }
  const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), glow(C.cyan, 3));
  top.position.y = 6.3;
  nexus.add(top);
  nexus.userData.top = top;
  part('nexus', nexus, {title: 'Platform server (nexus)', kicker: ':3002 HTTP · :3003 HTTPS', color: C.cyan, chapter: 'overview',
    text: 'One Node service that holds it all together: the REST API, the MCP endpoints, authentication, policies, credentials, the audit trail, the reconciler that creates Pods, the sandbox WebSocket channels, the forward proxy and the LLM proxy. Any number of replicas can run.'});
  label('platform server', {kicker: 'nexus · REST · MCP · WebSockets', color: C.cyan, at: V(0, 7.0, 0), parent: nexus, part: 'nexus'});
}
// Satellite modules on the platform: each a named face of the server.
export const mods = {};
function mod(key, x, z, title, kicker, color, text, chapter, w = 1.8, h = 1.1) {
  const g = new THREE.Group();
  g.position.set(x, CPT, z);
  const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, 1.4, 3, 0.14), std('#172036', {metalness: 0.55, roughness: 0.3}));
  b.position.y = h / 2; b.castShadow = true;
  const s = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.07, 0.02), glow(color, 2.4));
  s.position.set(0, h * 0.62, 0.71);
  const s2 = s.clone(); s2.position.y = h * 0.4; s2.scale.x = 0.6;
  g.add(b, s, s2);
  g.userData.strip = s;
  scene.add(g);
  mods[key] = g;
  part(key, g, {title, kicker, color, chapter, text});
  label(title, {kicker, color, cls: 'sm', at: V(0, h + 0.3, 0), parent: g, part: key});
  return g;
}
mod('llmproxy', CP.x + 4.2, CP.z - 5.4, 'LLM proxy', '/v1/projects/…/llm/<backend>', C.pink,
  'Managed inference. Sandboxes call it as their model endpoint. It checks the org halt, the policy, the provider and the budget, masks PII, calls the provider with the platform’s key, and meters the usage.', 'inference');
mod('fwdproxy', CP.x + 4.4, CP.z - 1.6, 'forward proxy', 'CONNECT · :3003 TLS', C.cyan,
  'For egress rules with transport: upstream, the sandbox proxy does not dial the internet itself. It tunnels through here, authenticated, so the connection leaves from the platform (or from a cluster relay).', 'network');
mod('mcpgw', CP.x - 4.2, CP.z + 3.6, 'MCP gateway', '/projects/{id}/mcp', C.amber,
  'One MCP endpoint per project. Admins attach MCP servers to it as upstreams. It merges their tools into one catalog (<upstream>__<tool>), filters it per caller with the policy’s allowedTools, and makes each upstream call itself with the stored credential, so the caller never holds it.', 'mcp');
mod('ingress', CP.x + 4.2, CP.z + 6.2, 'sandbox ingress', '*.sb.example.com', C.pink,
  'The front door for exposed ports. It matches the host name to a sandbox and a port, checks the port’s auth (private: a signed-in project member), writes an audit record, and sends the request down the sandbox’s own data tunnel.', 'ingress', 2.2, 1.3);
mod('vault', CP.x - 4.3, CP.z - 1.2, 'credentials', 'encrypted · write-only', C.gold,
  'Project credentials, stored encrypted with the installation’s ENCRYPTION_KEY. The API never returns a value. The real value only leaves in a policy frame, to the supervisor of a sandbox whose policy references it.', 'credentials', 1.6, 1.3);
export const pg = new THREE.Group();
pg.position.set(CP.x - 4.2, CPT, CP.z - 6.0);
scene.add(pg);
{
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.55, 40), std('#1a2440', {metalness: 0.6, roughness: 0.3}));
    c.position.y = 0.3 + i * 0.62; c.castShadow = true;
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.025, 6, 48), glow('#6d8cff', 1.6));
    r.rotation.x = Math.PI / 2; r.position.y = 0.58 + i * 0.62;
    pg.add(c, r);
  }
  part('pg', pg, {title: 'PostgreSQL', kicker: 'state · audit · LISTEN/NOTIFY', color: C.kube, chapter: 'policy',
    text: 'Everything the platform knows: orgs, projects, sandboxes, policies, bindings, encrypted credentials, spending, and the audit trail. A policy write fires pg_notify, and every server replica LISTENs, so a change reaches running sandboxes in about a quarter of a second.'});
  label('PostgreSQL', {kicker: 'LISTEN / NOTIFY', color: C.kube, cls: 'sm', at: V(0, 2.3, 0), parent: pg, part: 'pg'});
}
export let adminScreen;
export const admin = new THREE.Group();
admin.position.set(CP.x - 3.4, CPT, CP.z + 7.6);
scene.add(admin);
{
  const base = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.1, 0.7, 2, 0.04), std('#1c2434', {metalness: 0.7}));
  base.position.y = 0.05;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.1), std('#1c2434', {metalness: 0.7}));
  neck.position.set(0, 0.45, -0.12);
  const fr = new THREE.Mesh(new RoundedBoxGeometry(3.2, 2.0, 0.14, 2, 0.06), std('#161d2b', {metalness: 0.6, roughness: 0.3}));
  fr.position.set(0, 1.8, 0); fr.castShadow = true;
  adminScreen = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.8), new THREE.MeshBasicMaterial({map: adminTex(), toneMapped: false}));
  adminScreen.position.set(0, 1.8, 0.075);
  admin.add(base, neck, fr, adminScreen);
  admin.rotation.y = 0.3;
  part('admin', admin, {title: 'Admin UI', kicker: 'nexus-ui · React', color: C.cyan, chapter: 'rbac',
    text: 'Where admins manage orgs, teams, projects, sandboxes, policies, credentials and spending, and read the audit trail. It talks to the same REST API as nexusctl.'});
  label('Admin UI', {kicker: 'orgs · policies · audit', color: C.cyan, cls: 'sm', at: V(0, 3.1, 0), parent: admin, part: 'admin'});
}
function adminTex() {
  return canvasTex(600, 360, (g, W, H) => {
    g.fillStyle = '#0c1220'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#131b2e'; g.fillRect(0, 0, 130, H);
    g.fillStyle = '#7fe3ff'; g.font = '700 20px "Outfit", sans-serif'; g.fillText('Lens Agents', 14, 32);
    ['Sandboxes', 'Policies', 'Credentials', 'Audit', 'Spending'].forEach((t, i) => { g.fillStyle = i === 0 ? '#eef2fa' : '#8b94ad'; g.font = '400 16px "Outfit", sans-serif'; g.fillText(t, 16, 74 + i * 30); });
    [['brisk-otter-0042', 'started', '#5ee89a'], ['calm-heron-0107', 'started', '#5ee89a'], ['quick-lynx-0311', 'stopped', '#ffc857']].forEach(([n, s, c], i) => {
      const y = 50 + i * 54;
      g.fillStyle = i ? '#ffffff08' : '#7fe3ff18'; g.beginPath(); g.roundRect(146, y, 440, 42, 6); g.fill();
      g.fillStyle = c; g.beginPath(); g.arc(166, y + 21, 6, 0, 7); g.fill();
      g.fillStyle = '#eef2fa'; g.font = '500 17px "DM Mono", monospace'; g.fillText(n, 182, y + 27);
      g.fillStyle = '#9ea8c2'; g.font = '400 15px "DM Mono", monospace'; g.fillText(s, 500, y + 27);
    });
    g.fillStyle = '#9ea8c2'; g.font = '400 14px "DM Mono", monospace';
    ['sandbox-proxy  GET registry.npmjs.org  200', 'llm-proxy      POST bedrock/…        200', 'sandbox-proxy  GET telemetry.evil…   403'].forEach((t, i) => g.fillText(t, 150, 244 + i * 28));
  });
}

// ─────────────────────────────────────────────────────────────── people (in front)
export let cliScreen;
export const cli = new THREE.Group();
cli.position.set(-33.4, GROUND + 0.02, 13.2);
scene.add(cli);
function desk(g, w = 3.6) {
  const top = new THREE.Mesh(new RoundedBoxGeometry(w, 0.14, 2.0, 2, 0.05), std('#262f40', {roughness: 0.5}));
  top.position.y = 1.4; top.castShadow = top.receiveShadow = true;
  g.add(top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), std('#1b2130'));
    l.position.set(sx * (w / 2 - 0.2), 0.7, sz * 0.8);
    g.add(l);
  }
}
{
  desk(cli);
  const fr = new THREE.Mesh(new RoundedBoxGeometry(3.0, 1.9, 0.12, 2, 0.06), std('#161d2b', {metalness: 0.6, roughness: 0.3}));
  fr.position.set(0, 2.55, -0.5); fr.castShadow = true;
  cliScreen = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.72), new THREE.MeshBasicMaterial({map: screenTex([['$ nexusctl sandbox list', '#5ee89a'], ['  brisk-otter-0042  started', '#9ea8c2'], ['  calm-heron-0107   started', '#9ea8c2']]), toneMapped: false}));
  cliScreen.position.set(0, 2.55, -0.43);
  cli.add(fr, cliScreen);
  cli.rotation.y = 0.35;
  part('cli', cli, {title: 'nexusctl', kicker: 'the CLI · Rust', color: C.cyan, chapter: 'boot',
    text: 'The command line for the platform, served by the platform itself (curl …/install.sh | sh). nexusctl auth login signs you in through Lens ID in the browser; every other verb calls the REST API.'});
  label('nexusctl', {kicker: 'CLI', color: C.cyan, at: V(-1.3, 3.8, -0.5), parent: cli, part: 'cli'});
}
export function setCliScreen(lines) { cliScreen.material.map.dispose(); cliScreen.material.map = screenTex(lines); }

export const desktop = new THREE.Group();
desktop.position.set(-26.4, GROUND + 0.02, 14.4);
scene.add(desktop);
{
  desk(desktop);
  const lid = new THREE.Group();
  lid.position.set(0, 1.5, -0.4);
  lid.rotation.x = -0.25;
  const l = new THREE.Mesh(new RoundedBoxGeometry(2.4, 1.6, 0.08, 2, 0.05), std('#2c323d', {metalness: 0.55, roughness: 0.38}));
  l.position.y = 0.8;
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshBasicMaterial({map: canvasTex(440, 280, (g, W, H) => {
    g.fillStyle = '#1a1512'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d97757'; g.font = '700 22px "Outfit", sans-serif'; g.fillText('Claude', 18, 34);
    g.fillStyle = '#2a211c'; g.beginPath(); g.roundRect(18, 56, 300, 46, 10); g.fill();
    g.fillStyle = '#e8ddd4'; g.font = '400 15px "Outfit", sans-serif'; g.fillText('What changed in the payments pods?', 30, 84);
    g.fillStyle = '#9ea8c2'; g.font = '400 14px "DM Mono", monospace'; g.fillText('⚙ lens-agents · k8s__list_pods', 30, 134);
    g.fillStyle = '#e8ddd4'; g.font = '400 15px "Outfit", sans-serif'; g.fillText('Two pods restarted after the 14:02 deploy…', 30, 172);
  }), toneMapped: false}));
  sc.position.set(0, 0.8, 0.045);
  lid.add(l, sc);
  const deck = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.08, 1.5, 2, 0.04), std('#2c323d', {metalness: 0.55, roughness: 0.38}));
  deck.position.set(0, 1.51, 0.3);
  desktop.add(deck, lid);
  desktop.rotation.y = 0.12;
  part('desktop', desktop, {title: 'An MCP client', kicker: 'Claude Desktop · Cursor · VS Code', color: C.amber, chapter: 'mcp',
    text: 'Mode 1: an MCP-connected agent. It runs on your laptop, but its tools come from the project’s MCP gateway, authenticated with an API token (lns_…). It gets governed access to the same upstreams, and every call is audited.'});
  label('MCP client', {kicker: 'on your laptop · Mode 1', color: C.amber, at: V(-1.2, 3.4, -0.4), parent: desktop, part: 'desktop'});
}

export const browser = new THREE.Group();
browser.position.set(-18.4, GROUND + 0.02, 14.0);
scene.add(browser);
export let browserScreen;
export function browserTex(state = 'ui') {
  return canvasTex(520, 330, (g, W, H) => {
    g.fillStyle = '#0c1220'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1b2438'; g.fillRect(0, 0, W, 44);
    ['#56658a', '#56658a', '#56658a'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(20 + i * 20, 22, 6, 0, 7); g.fill(); });
    g.fillStyle = '#0c1220'; g.beginPath(); g.roundRect(84, 10, 420, 24, 6); g.fill();
    g.fillStyle = '#9ea8c2'; g.font = '14px "DM Mono", monospace';
    g.fillText(state === 'login' ? 'agents.example.com/sandbox-ingress/login' : 'web--brisk-otter-0042.sb.example.com', 96, 27);
    if (state === 'login') {
      g.fillStyle = '#7fe3ff'; g.font = '700 22px "Outfit", sans-serif'; g.fillText('Sign in with Lens ID', 140, 150);
      g.fillStyle = '#7fe3ff33'; g.beginPath(); g.roundRect(170, 180, 180, 40, 8); g.fill();
      g.fillStyle = '#eef2fa'; g.font = '500 16px "Outfit", sans-serif'; g.fillText('Continue', 226, 206);
    } else if (state === 'off') {
      g.fillStyle = '#3a4560'; g.font = '500 18px "DM Mono", monospace'; g.fillText('502 · Bad gateway', 170, 180);
    } else {
      g.fillStyle = '#e5533d'; g.font = '700 22px "Outfit", sans-serif'; g.fillText('🦞 OpenClaw', 24, 82);
      g.fillStyle = '#9ea8c2'; g.font = '400 14px "Outfit", sans-serif'; g.fillText('Control UI · signed in as you@example.com', 24, 106);
      g.fillStyle = '#ffffff0c'; g.beginPath(); g.roundRect(24, 124, 472, 150, 8); g.fill();
      g.fillStyle = '#dfe6f5'; g.font = '400 15px "Outfit", sans-serif';
      g.fillText('you: summarise #incidents from today', 40, 156);
      g.fillStyle = '#ffb3a6'; g.fillText('openclaw: 3 threads · 1 open incident (payments)', 40, 188);
      g.fillStyle = '#3a4560'; g.fillRect(40, 214, 300, 10); g.fillRect(40, 236, 240, 10);
    }
  });
}
{
  desk(browser, 3.4);
  const fr = new THREE.Mesh(new RoundedBoxGeometry(3.1, 2.0, 0.12, 2, 0.06), std('#161d2b', {metalness: 0.6, roughness: 0.3}));
  fr.position.set(0, 2.6, -0.5); fr.castShadow = true;
  browserScreen = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.84), new THREE.MeshBasicMaterial({map: browserTex('ui'), toneMapped: false}));
  browserScreen.position.set(0, 2.6, -0.43);
  browser.add(fr, browserScreen);
  browser.rotation.y = -0.18;
  part('browser', browser, {title: 'Your browser', kicker: 'web--brisk-otter-0042.sb.example.com', color: C.pink, chapter: 'ingress',
    text: 'You open the sandbox’s Control UI at its own host name. The request goes to the platform’s sandbox ingress, never straight to the Pod: the Pod has no inbound port to connect to.'});
  label('browser', {kicker: 'OpenClaw Control UI', color: C.pink, at: V(-1.3, 3.9, -0.5), parent: browser, part: 'browser'});
}
export function setBrowser(state) { browserScreen.material.map.dispose(); browserScreen.material.map = browserTex(state); }

// ─────────────────────────────────────────────────────────────── a private network behind a firewall (connectivity)
export const PRIV = {x: -19, z: -24};
export const privGroup = new THREE.Group();
scene.add(privGroup);
export const relay = new THREE.Group();
export const privApi = new THREE.Group();
export const privSvc = new THREE.Group();
export const firewall = new THREE.Group();
{
  const base = new THREE.Mesh(new RoundedBoxGeometry(14, 0.6, 8, 3, 0.2), std('#141a26', {roughness: 0.5, metalness: 0.45}));
  base.position.set(PRIV.x, -0.22, PRIV.z);
  base.receiveShadow = true;
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(14.02, 0.62, 8.02)), new THREE.LineBasicMaterial({color: new THREE.Color(C.ice).multiplyScalar(1.2), toneMapped: false, transparent: true, opacity: 0.4}));
  edge.position.copy(base.position);
  privGroup.add(base, edge);
  part('priv', privGroup, {title: 'A private network', kicker: 'prod cluster · no inbound ports', color: C.ice, chapter: 'mcp',
    text: 'A customer or production environment behind a firewall: a Kubernetes cluster and internal services. Nothing here accepts connections from the internet.'});
  label('prod · behind a firewall', {kicker: 'your private network', color: C.ice, at: V(PRIV.x - 5.6, 0.2, PRIV.z + 3.9), part: 'priv'});

  // the firewall: a low wall all around the network, with one outbound opening on the side that faces the platform
  const GAP = {x: PRIV.x + 1.6, z: PRIV.z + 3.75, w: 1.5};
  firewall.position.set(GAP.x, 0, GAP.z);
  const bm = std('#3a2020', {emissive: new THREE.Color('#ff6b76'), emissiveIntensity: 0.12, roughness: 0.8});
  const brick = new RoundedBoxGeometry(0.86, 0.34, 0.3, 1, 0.04);
  const wall = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    for (let r = 0; r < 3; r++) for (let t = (r % 2) * 0.45 + 0.45; t < len - 0.3; t += 0.9) {
      const x = x0 + ux * t, z = z0 + uz * t;
      if (Math.abs(z - GAP.z) < 0.01 && Math.abs(x - GAP.x) < GAP.w / 2 + 0.43) continue;
      const m = new THREE.Mesh(brick, bm);
      m.position.set(x - GAP.x, 0.25 + r * 0.37, z - GAP.z);
      m.rotation.y = -Math.atan2(uz, ux);
      m.castShadow = true;
      firewall.add(m);
    }
  };
  const X0 = PRIV.x - 6.75, X1 = PRIV.x + 6.75, Z0 = PRIV.z - 3.75, Z1 = PRIV.z + 3.75;
  wall(X0, Z0, X1, Z0); wall(X1, Z0, X1, Z1); wall(X1, Z1, X0, Z1); wall(X0, Z1, X0, Z0);
  const door = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 32, Math.PI), glow(C.cyan, 2.2));
  door.position.set(0, 0.12, 0);
  firewall.add(door);
  scene.add(firewall);
  part('firewall', firewall, {title: 'The firewall', kicker: 'inbound: closed · outbound: allowed', color: C.red, chapter: 'mcp',
    text: 'It surrounds the whole network. No inbound ports, no VPN. The one thing that crosses it is a normal outbound HTTPS connection the relay opens, and the platform sends its requests back down that connection.'});

  privApi.position.set(PRIV.x - 3.2, 0, PRIV.z - 1.2);
  const ab = new THREE.Mesh(new RoundedBoxGeometry(1.8, 1.3, 1.8, 3, 0.14), std('#172036', {metalness: 0.55}));
  ab.position.y = 0.65; ab.castShadow = true;
  const aw = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.06, 8, 7), glow(C.kube, 2.2));
  aw.position.set(0, 0.7, 0.92);
  privApi.add(ab, aw);
  scene.add(privApi);
  part('privapi', privApi, {title: 'prod kube-apiserver', kicker: 'a registered cluster', color: C.kube, chapter: 'mcp',
    text: 'The Kubernetes API of the private cluster. The relay calls it with impersonation headers for the principal the platform names, so the cluster’s own RBAC still applies.'});
  label('prod kube-apiserver', {kicker: 'impersonation', color: C.kube, cls: 'sm', at: V(0, 1.8, 0), parent: privApi, part: 'privapi'});

  privSvc.position.set(PRIV.x - 3.4, 0, PRIV.z + 2.2);
  const sb = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 32), std('#131a28', {emissive: new THREE.Color(C.ice), emissiveIntensity: 0.08, metalness: 0.5}));
  sb.position.y = 0.55; sb.castShadow = true;
  privSvc.add(sb);
  scene.add(privSvc);
  part('privsvc', privSvc, {title: 'incidents.internal', kicker: 'an internal MCP server', color: C.ice, chapter: 'mcp',
    text: 'An MCP server that only exists inside the private network. It is attached as an upstream with a cluster set, so the gateway reaches it through that cluster’s relay tunnel.'});
  label('incidents.internal', {kicker: 'MCP upstream · via tunnel', color: C.ice, cls: 'sm mono', at: V(0, 1.5, 0), parent: privSvc, part: 'privsvc'});

  relay.position.set(PRIV.x + 2.6, 0, PRIV.z + 1.2);
  const rb = new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.8, 1.5, 3, 0.14), std('#161d2c', {metalness: 0.6}));
  rb.position.y = 0.9; rb.castShadow = true;
  const rl = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.06, 1.54), glow(C.cyan, 1.8));
  rl.position.y = 1.5;
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0), std('#2a3448'));
  ant.position.set(0.45, 2.3, -0.4);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), glow(C.cyan, 2.4));
  tip.position.set(0.45, 2.82, -0.4);
  relay.add(rb, rl, ant, tip);
  scene.add(relay);
  part('relay', relay, {title: 'nexus-kube-relay', kicker: 'tunnel mode · dials out', color: C.cyan, chapter: 'mcp',
    text: 'A small deployment inside the private network. In tunnel mode it opens an outbound WebSocket to the platform’s /v1/tunnel with its lnst_ token, and the platform sends requests back over that connection as multiplexed streams.'});
  label('kube-relay', {kicker: 'outbound tunnel', color: C.cyan, cls: 'sm', at: V(0, 3.2, 0), parent: relay, part: 'relay'});
}

// ─────────────────────────────────────────────────────────────── the internet and the model providers
export const NET_C = V(28, 0, -1);
export const DEST = {
  npm:    {host: 'registry.npmjs.org', pos: V(24.6, 0, -8.4), h: 3.4, color: '#e0443e', note: 'plugins'},
  slack:  {host: 'slack.com', pos: V(28.2, 0, -4.4), h: 4.4, color: '#e8b86b', note: 'OpenClaw’s channel'},
  github: {host: 'api.github.com', pos: V(30.2, 0, 0.4), h: 4.8, color: '#b9c4d8', note: 'not in the policy'},
  paste:  {host: 'pastebin.com', pos: V(29.0, 0, 5.2), h: 3.0, color: '#8a8cf7', note: 'project allows · org does not'},
  evil:   {host: 'telemetry.evil.example', pos: V(25.4, 0, 8.6), h: 2.8, color: '#ff5d6c', note: 'the policy denies it'},
};
export const MCPUP = {
  atlassian: {host: 'mcp.atlassian.com', pos: V(32.2, 0, -12.2), h: 4.2, color: '#2684ff', note: 'MCP upstream · OAuth',
    text: 'A SaaS MCP server. Once attached to the project as an upstream, only the platform’s MCP gateway talks to it, with OAuth tokens it keeps encrypted. Agents and people see its tools in the gateway’s catalog.'},
};
export const PROV = {
  bedrock:    {host: 'Amazon Bedrock', pos: V(21.4, 0, -19.5), h: 5.6, color: '#ff9f43', note: 'model provider'},
  openrouter: {host: 'OpenRouter', pos: V(27.6, 0, -18.2), h: 4.6, color: '#9fb0ff', note: 'model provider'},
};
{
  const ground = new THREE.Mesh(new THREE.CircleGeometry(11, 64), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: {uT: time},
    vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uT; varying vec2 vU; void main(){ float r = length(vU-.5)*2.; float ring = smoothstep(.02,0.,abs(fract(r*4.-uT*.12)-.5)-.47); float a = (1.-r)*.12 + ring*(1.-r)*.25; gl_FragColor = vec4(vec3(.4,.6,1.)*1.2, a); }`,
  }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(NET_C.x, GROUND + 0.03, NET_C.z);
  scene.add(ground);
  label('the internet', {kicker: 'and SaaS APIs', color: C.white, at: V(31.5, 0, 9.8)});
}
function winTex(color) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 8; y += 14) for (let x = 10; x < w - 8; x += 18) {
      if (Math.random() < 0.62) { g.fillStyle = color; g.globalAlpha = 0.25 + Math.random() * 0.75; g.fillRect(x, y, 10, 6); }
    }
  });
}
function tower(key, d, chapter, kind) {
  const g = new THREE.Group();
  g.position.copy(d.pos);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.16, 40), std('#121827', {metalness: 0.5, roughness: 0.35}));
  pad.position.y = -0.44; pad.receiveShadow = true;
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.025, 6, 60), glow('#56658a', 1.2));
  padRing.rotation.x = Math.PI / 2; padRing.position.y = -0.36;
  g.add(pad, padRing);
  const body = kind === 'prov'
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, d.h, 6), new THREE.MeshStandardMaterial({color: '#131a28', emissive: new THREE.Color(d.color), emissiveMap: winTex('#ffffff'), emissiveIntensity: 0.4, metalness: 0.4, roughness: 0.35}))
    : new THREE.Mesh(new RoundedBoxGeometry(1.5, d.h, 1.5, 3, 0.14), new THREE.MeshStandardMaterial({color: '#131a28', emissive: '#ffffff', emissiveMap: winTex('#ffe6c4'), emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.35}));
  body.position.y = -0.36 + d.h / 2;
  body.castShadow = true;
  g.add(body);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), glow(C.grey, 1.2));
  beacon.position.y = -0.36 + d.h + 0.35;
  g.add(beacon);
  scene.add(g);
  d.group = g; d.beacon = beacon;
  d.port = V(d.pos.x - 0.9, 1.8, d.pos.z);
  part(key, g, {title: d.host, kicker: d.note, color: C.ice, chapter,
    text: d.text || (kind === 'prov'
      ? 'A model provider. Sandboxes never call it directly: the platform’s LLM proxy does, with the platform’s own key, so usage is metered and budgets hold.'
      : 'An outside destination. Whether the agent may reach it is decided by the policy table inside the sandbox’s proxy, before the packet ever leaves the Pod.')});
  d.label = label(d.host, {kicker: d.note, color: C.ice, cls: 'mono sm', at: V(0, d.h + 0.9, 0), parent: g, part: key});
}
for (const [k, d] of Object.entries(DEST)) tower('dest-' + k, d, 'network', 'dest');
for (const [k, d] of Object.entries(PROV)) tower('prov-' + k, d, 'inference', 'prov');
for (const [k, d] of Object.entries(MCPUP)) tower('mcpup-' + k, d, 'mcp', 'prov');

// ─────────────────────────────────────────────────────────────── pipes
export const pipes = {};
export function pipe(key, pts, color, {r = 0.07, base = 0.14, tension = 0.3} = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', tension);
  const len = curve.getLength();
  const mat = flowMat(color, len, base);
  const seg = Math.max(24, Math.round(len * 8));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 10, false), mat);
  m.renderOrder = 5;
  const sheath = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r * 1.9, 10, false),
    new THREE.MeshStandardMaterial({color: '#0e1422', transparent: true, opacity: 0.35, roughness: 0.2, metalness: 0.3, depthWrite: false}));
  const g = new THREE.Group();
  g.add(sheath, m);
  scene.add(g);
  pipes[key] = {curve, mat, g, len, pulse: 0};
  return pipes[key];
}
const at = (o, x, y, z) => o.position.clone().add(V(x, y, z));
const nexusL = at(nexus, 1.55, 0, 0);
// platform ↔ pod
pipe('ctl', [nexusL.clone().add(V(0, 4.2, -0.6)), V(-18, 7.6, -1.6), V(-9, 6.2, -1.2), UPLINK.clone().add(V(-0.2, 0.45, -0.3))], C.cyan, {r: 0.075});
pipe('data', [nexusL.clone().add(V(0, 3.4, 0.1)), V(-18, 6.4, 0.2), V(-9, 5.3, -0.6), UPLINK.clone().add(V(-0.2, -0.05, 0.1))], C.pink, {r: 0.075});
pipe('https', [at(mods.fwdproxy, -0.95, 0.5, 0.1).add(V(0, 0.2, 0)), V(-18, 5.2, 1.2), V(-9, 4.5, 0.2), UPLINK.clone().add(V(-0.2, -0.5, 0.4))], C.cyan, {r: 0.06, base: 0.1});
pipe('reconcile', [nexusL.clone().add(V(0, 1.4, 0.8)), V(-19, 2.6, 2.6), apiserver.position.clone().add(V(-1.05, 0.9, 0))], C.kube, {r: 0.06});
pipe('schedule', [apiserver.position.clone().add(V(0.6, 1.2, -0.8)), V(-8.4, 3.0, 1.0), V(-VM.w / 2 - 0.4, NODE_TOP + 0.6, 0.5)], C.kube, {r: 0.05, base: 0.1});
pipe('pvc', [pv.position.clone().add(V(0.8, 0.8, -0.3)), V(-5.4, 2.0, 3.0), PVSOCK.clone().add(V(-0.2, 0, 0))], C.ice, {r: 0.09});
// platform internals
pipe('pg', [at(pg, 0.95, 1.2, 0.3), V(CP.x - 1.8, CPT + 1.7, CP.z - 3.6), at(nexus, -1.5, 1.6, -0.6)], C.kube, {r: 0.06});
pipe('vault', [at(mods.vault, 0.8, 0.7, 0), at(nexus, -1.5, 2.4, 0.4)], C.gold, {r: 0.05});
pipe('llm-in', [at(mods.llmproxy, -0.9, 0.6, 0.3), at(nexus, 1.5, 1.2, -1.2)], C.pink, {r: 0.05});
pipe('mcp-in', [at(mods.mcpgw, 0.9, 0.6, -0.3), at(nexus, -1.5, 1.0, 1.4)], C.amber, {r: 0.05});
pipe('ing-in', [at(mods.ingress, -0.6, 0.8, -0.7), V(CP.x + 2.4, CPT + 2.4, CP.z + 2.6), at(nexus, 1.0, 2.0, 1.5)], C.pink, {r: 0.06});
// people → platform
pipe('browser', [at(browser, 0, 2.6, -0.8), V(-21, 4.2, 10.4), at(mods.ingress, 1.1, 0.9, 0.3)], C.pink, {r: 0.06});
pipe('desktop', [at(desktop, 0, 2.6, -0.6), V(-30, 4.4, 9), at(mods.mcpgw, 0, 1.1, 0.7)], C.amber, {r: 0.05});
pipe('cli', [at(cli, 0, 3.4, -0.6), V(-33, 7, 6), at(nexus, -1.0, 4.4, 1.5)], C.cyan, {r: 0.05});
pipe('admin', [at(admin, 0.4, 2.4, -0.3), V(CP.x - 1.6, CPT + 4.6, CP.z + 4), at(nexus, -0.6, 3.6, 1.5)], C.cyan, {r: 0.045, base: 0.08});
// pod → internet
pipe('net', [NIC.clone().add(V(0.2, 0, 0)), V(6.4, 2.8, 3.0), egress.position.clone().add(V(-0.6, 0.8, 0))], C.cyan, {r: 0.09});
const hub = egress.position.clone().add(V(0.9, 0.6, 0));
for (const [k, d] of Object.entries(DEST)) {
  const mid = hub.clone().lerp(d.port, 0.5); mid.y = 3.2;
  pipe('to-' + k, [hub, mid, d.port], '#6f82a8', {r: 0.035, base: 0.06, tension: 0.5});
}
// platform → internet (upstream transport) and → providers
const fwdTop = at(mods.fwdproxy, 0.2, 1.3, 0);
pipe('upstream', [fwdTop, V(-16, 15.5, -6), V(8, 15, -6), V(20, 7, -3), V(NET_C.x - 3.5, 2.2, -2.2)], C.cyan, {r: 0.07, base: 0.1});
const llmTop = at(mods.llmproxy, 0.2, 1.3, 0);
for (const [k, d] of Object.entries(PROV)) {
  pipe('llm-' + k, [llmTop, V(-14, 17.5, -14), V(8, 17, -17), V(d.pos.x - 1.2, d.h + 1.2, d.pos.z + 0.6), d.port.clone().add(V(0, 1.0, 0.4))], C.pink, {r: 0.07, base: 0.1});
}
const gwTop = at(mods.mcpgw, 0, 1.3, 0);
for (const [k, d] of Object.entries(MCPUP)) {
  pipe('mcp-' + k, [gwTop, V(-22, 19, -4), V(6, 20, -13), V(d.pos.x - 1.2, d.h + 1.2, d.pos.z + 0.6), d.port.clone().add(V(0, 1.0, 0.4))], C.amber, {r: 0.07, base: 0.1});
}
// relay tunnel: dialed out from the private network, through the firewall, to the platform
pipe('tunnel', [at(relay, -0.2, 1.4, 0.8), V(PRIV.x + 1.6, 0.75, PRIV.z + 3.75), V(PRIV.x - 1.5, 1.8, PRIV.z + 7), V(-25, 4.4, -11), at(nexus, -0.5, 4.8, -1.6)], C.cyan, {r: 0.08});
pipe('relay-api', [at(relay, -0.8, 1.1, 0), at(privApi, 0.95, 0.8, 0.2)], C.kube, {r: 0.05});
pipe('relay-svc', [at(relay, -0.8, 0.8, 0.5), at(privSvc, 0.75, 0.6, 0)], C.ice, {r: 0.05});

part('pipe-ctl', pipes.ctl.g, {title: 'Control channel', kicker: 'wss /v1/sandbox · sandbox token', color: C.cyan, chapter: 'policy',
  text: 'The supervisor’s WebSocket to the platform, dialed out from the Pod. Down it come policy frames: the network rules, the proxy CA, credential values, env and files. Up it go audit events. A policy change sends a new frame, and the supervisor swaps its rules live.'});
part('pipe-data', pipes.data.g, {title: 'Data tunnel', kicker: 'wss /v1/sandbox/data · bored-mplex', color: C.pink, chapter: 'ingress',
  text: 'The supervisor’s second outbound WebSocket. Ingress requests arrive on it as multiplexed streams, each naming its target port. The supervisor checks the name against its declared ports and dials 127.0.0.1.'});
part('pipe-https', pipes.https.g, {title: 'HTTPS to the platform', kicker: 'LLM proxy · MCP gateway · forward proxy', color: C.cyan, chapter: 'inference',
  text: 'Calls the agent makes to the platform itself: its model endpoint, its MCP gateway, and upstream-transport egress. They pass the boundary proxy like everything else, which injects the sandbox’s own token on the way.'});
part('pipe-tunnel', pipes.tunnel.g, {title: 'Relay tunnel', kicker: 'wss /v1/tunnel · lnst_ token', color: C.cyan, chapter: 'mcp',
  text: 'Opened from inside the private network, outbound through the firewall. The platform sends Kubernetes API calls and tunnel-routed TCP back down it as streams.'});
part('pipe-upstream', pipes.upstream.g, {title: 'Upstream egress', kicker: 'transport: upstream', color: C.cyan, chapter: 'network',
  text: 'A rule with transport: upstream leaves from the platform’s forward proxy instead of from the cluster. One egress point to allow-list, audited as forward-proxy.'});
part('pipe-net', pipes.net.g, {title: 'Direct egress', kicker: 'transport: direct', color: C.green, chapter: 'network',
  text: 'A rule with transport: direct is dialed by the sandbox proxy straight out through the cluster’s network.'});
