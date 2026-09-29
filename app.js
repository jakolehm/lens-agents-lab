import {
  THREE, CSS2DObject, C, V, scene, camera, renderer, labelRenderer, controls, composer, tiltH, tiltV, resize, time,
  parts, pickables, allLabels, label, vm, vmInner, shell, shellMat, shellEdges, layers, core, lobster, ring, procs, gate,
  gateCtl, GATE, NIC, nic, UPLINK, uplink, PVSOCK, pvSock, plates, SURF, VM, NODE_TOP, nodes, miniPods, apiserver, pv, pvFill,
  egress, nexus, mods, pg, admin, adminScreen, cli, setCliScreen, desktop, browser, setBrowser, relay, privApi, privSvc, firewall,
  PRIV, privGroup, CP, DEST, PROV, MCPUP, NET_C, pipes, glow, vmLight, coreLight, cpGroup, clusterGroup, CLUSTER,
} from './world.js?v=1';

// ─────────────────────────────────────────────────────────────── small helpers
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeOut = t => 1 - (1 - t) ** 3;
const backOut = t => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const esc = s => String(s).replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));
const clock = () => new Date().toTimeString().slice(0, 8);
const SLUG = 'brisk-otter-0042';
const WEB_HOST = `web--${SLUG}.sb.example.com`;

let paused = false, speed = 1;
const tweens = [];
function tween(dur, fn, ease = t => t) {
  return new Promise(res => tweens.push({t: 0, dur: Math.max(dur, 1e-4), fn, ease, res}));
}
const sleep = s => tween(s, () => {});
function stepTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i];
    w.t += dt;
    const k = Math.min(1, w.t / w.dur);
    w.fn(w.ease(k));
    if (k >= 1) { tweens.splice(i, 1); w.res(); }
  }
}

// ─────────────────────────────────────────────────────────────── effects: packets, bursts, floating text
const SPH = new THREE.SphereGeometry(0.13, 18, 12);
const packets = new Set();
class Packet {
  constructor(color, text = '', size = 1) {
    this.g = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({color: col(color, 3), toneMapped: false, transparent: true});
    this.m = new THREE.Mesh(SPH, this.mat);
    this.m.scale.setScalar(size);
    this.g.add(this.m);
    this.halo = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({color: col(color, 1), toneMapped: false, transparent: true, opacity: 0.25, depthWrite: false}));
    this.halo.scale.setScalar(size * 2.1);
    this.g.add(this.halo);
    this.ghosts = [];
    for (let i = 0; i < 7; i++) {
      const gm = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({color: col(color, 2), toneMapped: false, transparent: true, opacity: 0.5 * (1 - i / 7), depthWrite: false}));
      gm.scale.setScalar(size * (0.8 - i * 0.09));
      scene.add(gm);
      this.ghosts.push(gm);
    }
    this.hist = [];
    this.el = document.createElement('div');
    this.el.className = 'pk' + (text ? '' : ' off');
    this.el.textContent = text;
    this.el.style.setProperty('--c', color);
    this.lab = new CSS2DObject(this.el);
    this.lab.center.set(0.5, 1);
    this.g.add(this.lab);
    scene.add(this.g);
    packets.add(this);
    this.hold = 0;
  }
  color(hex) {
    this.mat.color.copy(col(hex, 3));
    this.halo.material.color.copy(col(hex, 1));
    this.ghosts.forEach(g => g.material.color.copy(col(hex, 2)));
    this.el.style.setProperty('--c', hex);
    return this;
  }
  text(t) { this.el.textContent = t; this.el.classList.toggle('off', !t); return this; }
  get pos() { return this.g.position; }
  at(p) { this.g.position.copy(p); this.hist = []; return this; }
  along(curve, dur, a = 0, b = 1, pk) {
    return tween(dur, k => {
      curve.getPointAt(clamp(lerp(a, b, k), 0, 1), this.g.position);
      if (pk) pipes[pk].pulse = 1;
    }, easeIO);
  }
  pipe(key, dur, back = false) { return this.along(pipes[key].curve, dur, back ? 1 : 0, back ? 0 : 1, key); }
  to(p, dur, arc = 0) {
    const s = this.g.position.clone();
    return tween(dur, k => {
      this.g.position.lerpVectors(s, p, k);
      this.g.position.y += Math.sin(k * Math.PI) * arc;
    }, easeIO);
  }
  path(pts, dur) { return this.along(new THREE.CatmullRomCurve3([this.g.position.clone(), ...pts], false, 'catmullrom', 0.4), dur); }
  update(t) {
    this.hist.unshift(this.g.position.clone());
    if (this.hist.length > 30) this.hist.pop();
    this.ghosts.forEach((g, i) => { const h = this.hist[Math.min(this.hist.length - 1, (i + 1) * 2)]; if (h) g.position.copy(h); });
    const s = this.hold ? 1 + Math.sin(t * 9) * 0.25 : 1;
    this.halo.scale.setScalar(2.1 * s * this.m.scale.x);
  }
  async die(dur = 0.35) {
    const s0 = this.m.scale.x;
    await tween(dur, k => { this.m.scale.setScalar(s0 * (1 - k) + 1e-3); this.halo.material.opacity = 0.25 * (1 - k); this.ghosts.forEach(g => g.material.opacity *= 0.85); });
    this.remove();
  }
  remove() {
    scene.remove(this.g);
    this.ghosts.forEach(g => scene.remove(g));
    this.lab.element.remove();
    packets.delete(this);
  }
}
const RING = new THREE.RingGeometry(0.4, 0.5, 48);
function burst(pos, color, size = 1.4) {
  const m = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({color: col(color, 2.5), toneMapped: false, transparent: true, side: THREE.DoubleSide, depthWrite: false}));
  m.position.copy(pos);
  m.lookAt(camera.position);
  scene.add(m);
  tween(0.75, k => { m.scale.setScalar(0.3 + k * size * 2); m.material.opacity = 1 - k; }, easeOut).then(() => scene.remove(m));
}
function fx(pos, text, color = C.white) {
  const el = document.createElement('div');
  el.className = 'fx';
  el.style.setProperty('--c', color);
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.copy(pos);
  scene.add(o);
  setTimeout(() => { scene.remove(o); el.remove(); }, 1900);
}
const top = (o, y = 0) => o.getWorldPosition(new THREE.Vector3()).add(V(0, y, 0));

// ─────────────────────────────────────────────────────────────── files on /data and in the writable layer
const FILE = new THREE.BoxGeometry(0.26, 0.34, 0.035);
const tok = {data: [], upper: []};
const slot = {
  data: i => plates['p-data'].position.clone().add(V(-0.75 + (i % 6) * 0.3, 0.24, -0.35 + Math.floor(i / 6) * 0.42)),
  upper: i => V(2.55 + (i % 3) * 0.3, SURF + 0.2, -0.1 + Math.floor(i / 3) * 0.38),
};
function addTok(where, {from, dur = 0.6} = {}) {
  const m = new THREE.Mesh(FILE, new THREE.MeshStandardMaterial({color: '#141a26', emissive: new THREE.Color(where === 'data' ? C.ice : C.claw), emissiveIntensity: 1.1, roughness: 0.4}));
  m.castShadow = true;
  const p = slot[where](tok[where].length);
  m.position.copy(from || p);
  vmInner.add(m);
  tok[where].push(m);
  if (from) tween(dur, k => { m.position.lerpVectors(from, p, k); m.position.y += Math.sin(k * Math.PI) * 0.8; }, easeIO);
  else { m.scale.setScalar(0.001); tween(0.4, k => m.scale.setScalar(Math.max(1e-3, k)), backOut); }
  return m;
}
function clearTok(where) {
  tok[where].splice(0).forEach(m => tween(0.5, k => m.scale.setScalar(Math.max(1e-3, 1 - k))).then(() => vmInner.remove(m)));
}

// Credential key held by the proxy once the policy frame carries it.
const gateKey = new THREE.Group();
{
  const km = glow(C.gold, 2.6);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 8, 24), km);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.07), km);
  shaft.position.x = 0.32;
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.07), km);
  bit.position.set(0.46, -0.08, 0);
  gateKey.add(bow, shaft, bit);
  gateKey.scale.setScalar(1.2);
  gateKey.visible = false;
  scene.add(gateKey);
}
const GATE_KEY_POS = V(GATE.x + 1.7, SURF + 5.6, GATE.z);

// ─────────────────────────────────────────────────────────────── the audit trail
const SRCC = {'rest-api': C.cyan, 'mcp-tool': C.amber, 'k8s-proxy': C.kube, 'forward-proxy': C.cyan, 'sandbox-proxy': C.claw, 'llm-proxy': C.pink, 'aws-proxy': C.gold};
const audit = [];
let auditFilter = 'all';
const auditList = $('#audit-list'), auditChip = $('#audit-chip'), auditPanel = $('#audit-panel');
function auditRow(e, fresh) {
  const d = document.createElement('div');
  d.className = 'audit-row' + (fresh ? ' new' : '');
  d.style.setProperty('--c', e.color);
  d.innerHTML = `<time>${e.t}</time><s></s><span><span class="sx" style="--c:${SRCC[e.src] || C.grey}">${e.src}</span>${e.html}</span>`;
  return d;
}
// One row per request the platform saw. `result` colours it: success, failure (a policy said no) or error.
function log(src, html, result = 'success', extra = {}) {
  const color = result === 'success' ? C.green : result === 'failure' ? C.red : C.amber;
  const e = {t: clock(), src, html, color, result, ...extra};
  audit.unshift(e);
  if (audit.length > 120) audit.pop();
  $('#audit-n').textContent = audit.length;
  auditChip.style.setProperty('--c', color);
  auditChip.classList.remove('ping'); void auditChip.offsetWidth; auditChip.classList.add('ping');
  if (!auditPanel.hidden) { auditList.querySelector('.audit-empty')?.remove(); auditList.prepend(auditRow(e, true)); while (auditList.children.length > 80) auditList.lastChild.remove(); }
  if (current?.id === 'rbac') refreshPanel();
}
function toggleAudit(open = auditPanel.hidden) {
  auditPanel.hidden = !open;
  auditChip.setAttribute('aria-expanded', open);
  if (open) { auditList.innerHTML = ''; audit.length ? audit.forEach(e => auditList.appendChild(auditRow(e))) : auditList.innerHTML = '<p class="audit-empty">Nothing yet. Try a button in the chapter card.</p>'; }
}
auditChip.onclick = () => toggleAudit();
$('#audit-x').onclick = () => toggleAudit(false);

// ─────────────────────────────────────────────────────────────── state
const S = {
  vm: 'started',            // gone | creating | started | stopping | stopped
  boot: -1, hop: -1, ihop: -1, ghop: -1,
  // The org-scoped policy bound to all_sandboxes: a ceiling, never a grant.
  ceiling: {'registry.npmjs.org': true, 'slack.com': true, '*.slack.com': true, 'api.github.com': true, 'pastebin.com': false},
  // The sandbox's embedded policy "openclaw".
  rules: [
    {pattern: 'registry.npmjs.org', verdict: 'allow', transport: 'direct', on: true},
    {pattern: 'slack.com', verdict: 'allow', transport: 'direct', on: true},
    {pattern: '*.slack.com', verdict: 'allow', transport: 'direct', on: true},
    {pattern: 'pastebin.com', verdict: 'allow', transport: 'direct', on: true},
    {pattern: 'api.github.com', verdict: 'allow', transport: 'direct', on: false},
    {pattern: 'telemetry.evil.example', verdict: 'deny', transport: 'direct', on: true},
  ],
  halted: false,
  live: null,               // the last policy frame the supervisor received
  pushing: 0,
  cred: {stored: true, referenced: false},
  inf: {enabled: true, provider: 'bedrock', limit: 500, used: 38, pii: true},
  ing: {cookie: false, auth: 'private'},
  relay: {up: true},
  ups: {atlassian: 'none', incidents: 'none'},     // none | pending | ready | error
  allowed: new Set(['atlassian__getJiraIssue', 'atlassian__searchJiraIssuesUsingJql', 'incidents__listIncidents', 'incidents__getIncident']),
  who: 'member',
  term: {},
  seen: new Set(),
};
const snapshot = () => ({ceiling: {...S.ceiling}, rules: S.rules.map(r => ({...r})), halted: S.halted, cred: S.cred.stored && S.cred.referenced});
S.live = snapshot();

function covers(pat, host) {
  if (pat === '*' || pat === host) return true;
  if (pat.startsWith('*.')) return host.endsWith(pat.slice(1));
  return false;
}
// A project grant survives only where an org ceiling entry covers it. Denies always stand.
function evaluate(host, P = S.live) {
  if (P.halted) return {verdict: 'deny', why: 'org halted · deny-all', src: 'halt'};
  const on = P.rules.filter(r => r.on && covers(r.pattern, host));
  const r = on.find(r => r.pattern === host) || on[0];
  if (!r) return {verdict: 'deny', why: 'no rule · networkDefaultVerdict: deny', src: 'default'};
  if (r.verdict === 'deny') return {verdict: 'deny', why: `denied by ${r.pattern}`, rule: r, src: 'project'};
  const cap = Object.entries(P.ceiling).some(([p, v]) => v && (p === r.pattern || p === '*' || (p.startsWith('*.') && r.pattern.endsWith(p.slice(1)))));
  if (!cap) return {verdict: 'deny', why: 'clipped by the org ceiling (drift)', rule: r, src: 'ceiling', clipped: true};
  return {verdict: 'allow', why: `allowed by ${r.pattern}`, rule: r, transport: r.transport, src: 'project'};
}
const VCOL = {allow: C.green, deny: C.red};

// ─────────────────────────────────────────────────────────────── sandbox lifecycle
const coreP = core.position.clone().add(V(0.8, -0.05, 0.25));
function setVmPresence(k) {
  shellMat.uniforms.uO.value = k;
  shellEdges.userData.mats[0].opacity = 0.22 * k;
  shellEdges.userData.mats[1].opacity = k;
  vmLight.intensity = 9 * k;
}
function popIn(o, on = true, dur = 0.5) {
  const s0 = o.scale.x;
  return tween(dur, k => o.scale.setScalar(Math.max(1e-3, lerp(s0, on ? 1 : 0, k))), on ? backOut : easeIO);
}
const vmPieces = () => [layers.kernel, ...layers.image, layers.runtime, layers.upper, procs.seed, procs.discover, ring, gate, core, nic, uplink, pvSock, ...Object.values(plates)];
function setState(s) {
  S.vm = s;
  const st = $('#vmstate');
  st.className = 'state ' + ({started: '', creating: 'boot', stopping: 'stopped', stopped: 'stopped', gone: 'gone'}[s]);
  st.querySelector('span').textContent = s === 'gone' ? 'no sandbox' : `${SLUG} · ${s}`;
  refresh();
}
function setCore(k) { lobster.power(k); coreLight.intensity = 6 * k; }

const BOOT = [
  ['nexusctl sandbox create', 'POST /v1/projects/{p}/sandboxes · a new revision, desired_state: started', 'cli'],
  ['Reconciler → Pod', 'the platform writes a Pod with runtimeClassName: kata-clh', 'apiserver'],
  ['Scheduler → node-a', 'nodeSelector runtime=kata · the kubelet takes it', 'node-a'],
  ['Kata boots a microVM', 'Cloud Hypervisor · its own guest kernel', 'pedestal'],
  ['Image + PVC', 'openclaw:2026.8.2 read-only · /data from sandbox-data-<hash>', 'image2'],
  ['init: seed-supervisor', 'copies nexus-agent-sandbox, nft, nexus-mcp into /.lens', 'seed'],
  ['init: discover-image', 'records the image’s user (uid 1000), group and workdir', 'discover'],
  ['Supervisor · PID 1', 'non-dumpable · nftables inet lens_sandbox · proxy :3128/:3129 · DNS :5355', 'supervisor'],
  ['Dial the platform', 'wss /v1/sandbox → policy frame · wss /v1/sandbox/data for ingress', 'uplink'],
  ['Start OpenClaw', 'CA + files written · drop to uid 1000 · openclaw gateway on 127.0.0.1:18789', 'workload'],
];
let booting = false;
async function boot({pace = null, fast = false} = {}) {
  if (booting) return;
  booting = true;
  const T = fast ? 0.5 : 1;
  const step = async i => { S.boot = i; if (current.id === 'boot') refreshPanel(); if (pace) await pace(i); };
  setState('creating');
  vmPieces().forEach(o => o.scale.setScalar(0.001));
  setVmPresence(0); setCore(0);
  clearTok('upper');
  gateKey.visible = false;
  setBrowser('off');

  stage([cli, nexus]);
  await step(0);
  setCliScreen([['$ nexusctl sandbox create \\', '#5ee89a'], ['    -f sandbox.yaml --volume /data', '#5ee89a'], ['  revision 1 · pending', '#9ea8c2']]);
  log('rest-api', `<b>POST</b> /v1/projects/acme/sandboxes <u>· ${SLUG}</u>`);
  term('boot', '<span class="pr">$</span> nexusctl sandbox create --project acme -f sandbox.yaml --volume /data\ncreated <span class="cy">' + SLUG + '</span> · revision 1 · desired_state started');
  const p0 = new Packet(C.cyan, 'POST /sandboxes').at(pipes.cli.curve.getPointAt(0));
  await p0.pipe('cli', 0.9 * T); p0.die();
  await tween(0.6 * T, k => nexus.userData.rings.forEach((r, i) => r.material.color.copy(col(C.cyan, 1.5 + 2 * Math.max(0, Math.sin(k * 12 - i))))));

  await step(1);
  stage([nexus, apiserver]);
  const p1 = new Packet(C.kube, 'Pod · kata-clh').at(pipes.reconcile.curve.getPointAt(0));
  await p1.pipe('reconcile', 1.0 * T); p1.die();
  burst(top(apiserver, 1.2), C.kube, 0.9);

  await step(2);
  stage([apiserver, nodes.a, ...VMBOX]);
  const p2 = new Packet(C.kube, 'bind → node-a').at(pipes.schedule.curve.getPointAt(0));
  await p2.pipe('schedule', 0.8 * T); p2.die();
  nodes.a.userData.leds.forEach(l => l.material.color.copy(col(C.green, 3)));

  await step(3);
  stage(VMBOX);
  await tween(0.9 * T, k => setVmPresence(k), easeOut);
  await popIn(layers.kernel, true, 0.45 * T);

  await step(4);
  for (const m of layers.image) {
    const y = m.position.y;
    m.scale.setScalar(1); m.position.y = y + 3;
    tween(0.5 * T, k => { m.position.y = lerp(y + 3, y, k); }, easeOut);
    await sleep(0.18 * T);
  }
  await sleep(0.3 * T);
  await Promise.all([popIn(pvSock, true, 0.35 * T), popIn(plates['p-data'], true, 0.35 * T)]);
  pipes.pvc.pulse = 1;
  clearTok('data');
  for (let i = 0; i < S.dataN; i++) setTimeout(() => addTok('data'), i * 60);

  await step(5);
  await popIn(procs.seed, true, 0.35 * T);
  const r = layers.runtime; const ry = r.position.y;
  r.scale.setScalar(1); r.position.y = ry + 2.5;
  await tween(0.5 * T, k => { r.position.y = lerp(ry + 2.5, ry, k); }, easeOut);
  fx(procs.seed.position.clone().add(V(0, 1.1, 0)), '→ /.lens', C.cyan);

  await step(6);
  await popIn(procs.discover, true, 0.35 * T);
  fx(procs.discover.position.clone().add(V(0, 1.1, 0)), 'uid 1000 · /home/node', C.cyan);
  await popIn(layers.upper, true, 0.4 * T);

  await step(7);
  await Promise.all([popIn(ring, true, 0.6 * T), popIn(gate, true, 0.6 * T), popIn(nic, true, 0.4 * T)]);
  fx(GATE.clone().add(V(0, 2.2, 0)), 'nftables: policy drop', C.cyan);

  await step(8);
  stage([nexus, ...VMBOX]);
  await popIn(uplink, true, 0.35 * T);
  const up = new Packet(C.cyan, 'wss /v1/sandbox', 0.7).at(UPLINK.clone());
  await up.pipe('ctl', 0.9 * T, true); up.die();
  S.live = snapshot();
  const pf = new Packet(C.cyan, 'policy frame').at(pipes.ctl.curve.getPointAt(0));
  await pf.pipe('ctl', 1.0 * T);
  await pf.to(GATE.clone().add(V(0, 1.6, 0)), 0.5 * T); pf.die();
  fx(GATE.clone().add(V(0, 2.2, 0)), 'rules · CA · credentials · env', C.cyan);
  if (S.live.cred) showKey();
  const dt = new Packet(C.pink, 'wss /v1/sandbox/data', 0.6).at(UPLINK.clone());
  dt.pipe('data', 0.8 * T, true).then(() => dt.die());

  await step(9);
  await Promise.all([popIn(plates['p-tmp'], true, 0.3 * T), popIn(plates['p-port'], true, 0.3 * T)]);
  await popIn(core, true, 0.6 * T);
  lobster.mood('surprised', 1.2);
  await tween(0.6 * T, k => setCore(k));
  const np = new Packet(C.cyan, 'npm · @openclaw plugin').at(coreP.clone());
  await np.along(W2G(), 0.6 * T); np.color(C.green);
  await np.along(G2N(), 0.35 * T);
  await np.pipe('net', 0.4 * T);
  await np.pipe('to-npm', 0.5 * T); np.die();
  log('sandbox-proxy', `<b>GET</b> registry.npmjs.org/@openclaw/amazon-bedrock <u>· 200</u>`);
  lobster.mood('happy', 2.6).say('hi! I’m OpenClaw, in a Kata microVM', {dur: 3.2});
  setCliScreen([['$ nexusctl sandbox get ' + SLUG, '#5ee89a'], ['  state     started', '#9ea8c2'], ['  revision  1 · active', '#9ea8c2'], ['  url  ' + SLUG + '.sb…', '#7fe3ff']]);
  setBrowser(S.ing.cookie ? 'ui' : 'login');
  await step(10);
  booting = false;
  setState('started');
}
S.dataN = 2;
function showKey() {
  if (gateKey.visible) return;
  gateKey.position.copy(GATE_KEY_POS);
  gateKey.visible = true;
  burst(GATE_KEY_POS.clone(), C.gold, 0.8);
}
async function stopVm() {
  if (S.vm !== 'started') return;
  stage([...VMBOX, pv]);
  log('rest-api', `<b>POST</b> /v1/projects/acme/sandboxes/${SLUG}/stop`);
  term('boot', `<span class="pr">$</span> nexusctl sandbox stop ${SLUG}\n<span class="am">stopped</span> · Pod deleted · PVC kept`);
  setState('stopping');
  lobster.mood('sleep', 0).say('zzz…', {dur: 2});
  clearTok('upper');
  gateKey.visible = false;
  await Promise.all([tween(0.7, k => setCore(1 - k)), popIn(ring, false, 0.5), popIn(gate, false, 0.5), popIn(procs.seed, false, 0.4), popIn(procs.discover, false, 0.4), popIn(uplink, false, 0.4)]);
  await Promise.all([popIn(core, false, 0.4), popIn(layers.upper, false, 0.4), popIn(layers.runtime, false, 0.4), ...layers.image.map(l => popIn(l, false, 0.4)), popIn(layers.kernel, false, 0.4), ...Object.values(plates).map(p => popIn(p, false, 0.4)), popIn(nic, false, 0.3), popIn(pvSock, false, 0.3)]);
  await tween(0.5, k => setVmPresence(1 - k * 0.8));
  setBrowser('off');
  setState('stopped');
}
async function startVm() {
  if (S.vm !== 'stopped' && S.vm !== 'gone') return;
  if (S.vm === 'stopped') {
    log('rest-api', `<b>POST</b> /v1/projects/acme/sandboxes/${SLUG}/start`);
    term('boot', `<span class="pr">$</span> nexusctl sandbox start ${SLUG}\n<span class="ok">started</span> · a new Pod on the same PVC · /data is back, the writable layer is new`);
  }
  await boot({fast: true});
}
async function deleteVm() {
  if (S.vm === 'started') await stopVm();
  if (S.vm !== 'stopped') return;
  log('rest-api', `<b>DELETE</b> /v1/projects/acme/sandboxes/${SLUG}`);
  term('boot', `<span class="pr">$</span> nexusctl sandbox delete ${SLUG}\ndeleted · Pod, PVC, embedded policy and embedded credentials <span class="er">gone</span>`);
  clearTok('data'); S.dataN = 0;
  await tween(0.8, k => { pvFill.scale.setScalar(Math.max(1e-3, 1 - k)); setVmPresence(0.2 * (1 - k)); });
  setState('gone');
}
async function recreate() {
  pvFill.scale.setScalar(1);
  S.dataN = S.dataN || 1;
  await boot({fast: false});
}
async function writeFile(where) {
  if (S.vm !== 'started') return notRunning();
  stage([coreP, plates['p-data'], slot.upper(0)], 3);
  const target = where === 'data' ? '/data/workspace/notes.md' : '/var/tmp/cache.bin';
  lobster.mood('think', 1.2).say(`writing ${target}`, {spin: true, dur: 1.4}).turn(-0.4);
  addTok(where, {from: coreP.clone(), dur: 0.7});
  if (where === 'data') { S.dataN++; pipes.pvc.pulse = 1; }
  await sleep(0.8);
  lobster.turn(0).mood('happy', 2).say(where === 'data' ? 'saved on my PVC' : 'saved in my writable layer', {dur: 2.4});
  term('boot', `<span class="pr">sandbox$</span> echo … > ${target}\n<span class="ok">✓</span> <span class="cm"># ${where === 'data' ? 'on the PVC: survives stop, start and new revisions' : 'in the Pod’s writable layer: gone when the Pod goes'}</span>`);
}
async function execShell() {
  if (S.vm !== 'started') return notRunning();
  const admin = S.who === 'admin';
  stage([cli, nexus, ...VMBOX]);
  const p = new Packet(C.cyan, 'exec · id').at(pipes.cli.curve.getPointAt(0));
  await p.pipe('cli', 0.8);
  if (!admin) {
    p.color(C.red).text('403 · needs project ADMIN'); burst(p.pos.clone(), C.red);
    log('rest-api', `<b>POST</b> …/sandboxes/${SLUG}/exec <u>· 403 · project MEMBER</u>`, 'failure');
    term(current.id, `<span class="pr">$</span> nexusctl sandbox exec ${SLUG} -- id\n<span class="er">Error: 403 Forbidden — exec requires project ADMIN</span>`);
    await sleep(0.8); p.die(); return;
  }
  await p.pipe('ctl', 0.9);
  await p.path([ring.position.clone().add(V(0, 0.6, 0))], 0.4);
  p.text('sh · uid 1000');
  lobster.watch(p.g).mood('surprised', 2.4).say('a shell appeared next to me', {dur: 3});
  setTimeout(() => lobster.watch(null), 2600);
  await sleep(0.8); p.die();
  log('rest-api', `<b>POST</b> …/sandboxes/${SLUG}/exec <u>· project ADMIN</u>`);
  term(current.id, `<span class="pr">$</span> nexusctl sandbox exec ${SLUG} -- id\nuid=1000(node) gid=1000(node)`);
}
function notRunning() { fx(V(0, VM.top, 0), 'no running sandbox — start it first', C.red); }

// ─────────────────────────────────────────────────────────────── the network path out of the pod
const HOLD_AT = () => GATE.clone().add(V(0, 0, -0.6));
const W2G = () => new THREE.CatmullRomCurve3([coreP.clone(), V((coreP.x + GATE.x) / 2, SURF + 1.6, 0.7), HOLD_AT()], false, 'catmullrom', 0.4);
const G2N = () => new THREE.CatmullRomCurve3([HOLD_AT(), V(GATE.x, GATE.y, GATE.z + 0.6), V(GATE.x + 0.9, SURF + 1.4, NIC.z), NIC.clone()], false, 'catmullrom', 0.3);
const G2U = () => new THREE.CatmullRomCurve3([HOLD_AT(), V(GATE.x - 0.4, GATE.y + 1.2, GATE.z - 1.0), V(-1.0, SURF + 2.6, -1.4), V(-2.8, SURF + 1.6, -0.9), UPLINK.clone().add(V(0.2, -0.5, 0.4))], false, 'catmullrom', 0.3);
let hopTimer;
function hop(i) { S.hop = i; if (current.id === 'network') refreshPanel(); clearTimeout(hopTimer); if (i >= 0) hopTimer = setTimeout(() => { S.hop = -1; if (current.id === 'network') refreshPanel(); }, 6000); }

// Out through the gate to the Nexus-bound HTTPS pipe; returns the packet sitting at the platform end.
async function toPlatform(p, label) {
  p.color(C.green).text(label);
  gateCtl.signal(C.green); gateCtl.raise();
  await p.along(G2U(), 0.8);
  gateCtl.lower();
  await p.pipe('https', 1.0, true);
}
async function backToPod(p) {
  await p.pipe('https', 0.9);
  await p.along(G2U(), 0.7, 1, 0);
  await p.along(W2G(), 0.6, 1, 0);
}

async function request(k, {cmd} = {}) {
  const d = DEST[k];
  cmd = cmd || `curl https://${d.host}`;
  if (S.vm !== 'started') return notRunning();
  stage(VMFOCUS(), 4.6);
  const p = new Packet(C.cyan, `CONNECT ${d.host}:443`).at(coreP.clone());
  lobster.turn(0.45).mood('think', 0).say(esc(cmd), {spin: true, dur: 90}).watch(p.g);
  try {
    hop(0);
    await p.along(W2G(), 0.9);
    hop(1); await sleep(0.15);
    hop(2); await sleep(0.15);
    const v = evaluate(d.host);
    hop(3);
    gateCtl.signal(VCOL[v.verdict]);
    if (v.verdict === 'deny') {
      gateCtl.refuse();
      p.color(C.red).text('403 Forbidden');
      burst(p.pos.clone(), C.red);
      lobster.mood('ouch', 3).say('403 — the policy said no', {dur: 3.2});
      fx(p.pos.clone().add(V(0, 0.6, 0)), v.why, C.red);
      log('sandbox-proxy', `<b>GET</b> ${d.host}/ <u>· 403 · ${esc(v.why)}</u>`, 'failure');
      await p.along(W2G(), 0.8, 1, 0);
      burst(coreP.clone(), C.red, 0.8);
      p.die();
      term('network', `<span class="pr">$</span> ${esc(cmd)}\n<span class="er">curl: (56) CONNECT tunnel failed, response 403</span> <span class="cm"># ${esc(v.why)}</span>`);
      return 'deny';
    }
    const inject = k === 'slack' && S.live.cred;
    p.color(C.green).text(d.host);
    if (inject) {
      const kp = new Packet(C.gold, '', 0.7).at(GATE_KEY_POS.clone());
      await kp.to(p.pos.clone(), 0.45); kp.die();
      p.color(C.gold).text('Authorization: Bearer xoxb-••••');
      burst(p.pos.clone(), C.gold, 0.9);
      fx(p.pos.clone().add(V(0, 0.7, 0)), '__lens_cred → real token', C.gold);
    }
    lobster.mood('think', 0).say(`allowed → ${d.host}`, {spin: true, dur: 90});
    gateCtl.raise();
    await sleep(0.3);
    if (v.transport === 'upstream') {
      hop(4);
      await p.along(G2U(), 0.8);
      gateCtl.lower();
      await p.pipe('https', 1.0, true);
      stage([mods.fwdproxy, NET_C.clone().add(V(0, 6, 0)), d.pos.clone().add(V(0, d.h, 0))], 6);
      hop(5);
      p.text('via forward proxy');
      await p.to(top(mods.fwdproxy, 1.3), 0.4);
      await p.pipe('upstream', 1.6);
      await p.to(d.port.clone(), 0.5);
      log('forward-proxy', `<b>CONNECT</b> ${d.host}:443 <u>· sandbox ${SLUG}</u>`);
    } else {
      hop(4);
      await p.along(G2N(), 0.45);
      gateCtl.lower();
      stage([GATE, egress, d.pos.clone().add(V(0, d.h + 0.6, 0))], 4.4);
      hop(5);
      await p.pipe('net', 0.55);
      await p.pipe('to-' + k, 0.9);
    }
    hop(6);
    burst(d.beacon.getWorldPosition(V(0, 0, 0)), C.green, 0.8);
    d.flash = 1;
    const code = k === 'slack' ? (inject ? '200 · {"ok":true}' : '200 · {"ok":false,"error":"not_authed"}') : '200 OK';
    p.color(k === 'slack' && !inject ? C.amber : C.green).text(code);
    log('sandbox-proxy', `<b>${k === 'slack' ? 'POST' : 'GET'}</b> ${d.host}${k === 'slack' ? '/api/chat.postMessage' : '/'} <u>· 200${inject ? ' · injected' : ''}${v.transport === 'upstream' ? ' · upstream' : ''}</u>`);
    stage(VMFOCUS(), 4.6);
    if (v.transport === 'upstream') {
      await p.to(NET_C.clone().add(V(-3.5, 2.2, -2.2)), 0.4);
      await p.pipe('upstream', 1.3, true);
      await backToPod(p);
    } else {
      await p.pipe('to-' + k, 0.7, true);
      await p.pipe('net', 0.45, true);
      gateCtl.raise();
      await p.along(G2N(), 0.4, 1, 0);
      gateCtl.lower();
      await p.along(W2G(), 0.6, 1, 0);
    }
    burst(coreP.clone(), C.green, 0.8);
    p.die();
    if (k === 'slack' && !inject) lobster.mood('sad', 3).say('not_authed… I have no Slack token', {dur: 3.2});
    else lobster.mood('happy', 2.6).say(inject ? 'posted! I never saw the token' : `${esc(code)} ✓`, {dur: 3});
    term('network', `<span class="pr">$</span> ${esc(cmd)}\n<span class="ok">${esc(code)}</span>`);
    if (k === 'slack') term('credentials', `<span class="pr">sandbox$</span> ${esc(cmd)}\n${inject ? '<span class="ok">{"ok":true,"channel":"C0INCIDENTS"}</span>' : '<span class="er">{"ok":false,"error":"not_authed"}</span>'}`);
    return 'allow';
  } finally { lobster.watch(null).turn(0); gateCtl.lower(); }
}
async function dnsLookup(host) {
  if (S.vm !== 'started') return notRunning();
  stage(VMFOCUS(), 4.6);
  const p = new Packet(C.cyan, `DNS ${host}`, 0.75).at(coreP.clone());
  lobster.turn(0.45).mood('think', 0).say(`nslookup ${host}`, {spin: true, dur: 30}).watch(p.g);
  await p.along(W2G(), 0.8);
  const v = evaluate(host);
  if (v.verdict === 'deny') {
    gateCtl.signal(C.red); gateCtl.refuse();
    p.color(C.red).text('NXDOMAIN'); burst(p.pos.clone(), C.red);
    fx(p.pos.clone().add(V(0, 0.6, 0)), 'the DNS stub only resolves allowed names', C.red);
    await p.along(W2G(), 0.7, 1, 0); p.die();
    lobster.watch(null).turn(0).mood('surprised', 2.6).say('NXDOMAIN? it doesn’t exist for me', {dur: 3});
    term('network', `<span class="pr">$</span> nslookup ${host}\n<span class="er">** server can't find ${host}: NXDOMAIN</span>`);
  } else {
    p.color(C.green);
    await p.along(G2N(), 0.4); await p.pipe('net', 0.5); p.text('A 104.16.x.x');
    await p.pipe('net', 0.5, true); await p.along(G2N(), 0.3, 1, 0); await p.along(W2G(), 0.6, 1, 0); p.die();
    lobster.watch(null).turn(0).mood('happy').say('resolved ✓');
    term('network', `<span class="pr">$</span> nslookup ${host}\n<span class="ok">Address: 104.16.x.x</span>`);
  }
}
async function bypass() {
  if (S.vm !== 'started') return notRunning();
  stage(VMFOCUS(), 4.6);
  const p = new Packet(C.cyan, 'direct → 1.1.1.1:443').at(coreP.clone());
  lobster.turn(0.45).mood('think', 0).say('sneaking past the proxy…', {spin: true, dur: 30}).watch(p.g);
  await p.to(V(1.2, SURF + 1.8, 0.9), 0.6);
  p.text('nftables: redirect → :3129');
  burst(p.pos.clone(), C.cyan, 0.7);
  await p.to(GATE.clone().add(V(-0.3, 0, 0.2)), 0.5);
  gateCtl.signal(C.red); gateCtl.refuse();
  p.color(C.red).text('no SNI → refused');
  burst(p.pos.clone(), C.red);
  fx(p.pos.clone().add(V(0, 0.6, 0)), 'there is no route around the proxy', C.red);
  await p.along(W2G(), 0.7, 1, 0); p.die();
  lobster.watch(null).turn(0).mood('ouch', 3).say('nope — nftables caught me', {dur: 3.2});
  term('network', `<span class="pr">$</span> curl --noproxy '*' https://1.1.1.1\n<span class="er">curl: (35) TLS connect error</span>\n<span class="cm"># nftables redirected it anyway; with no host name the proxy refuses it.\n# The agent has no CAP_NET_ADMIN, so it cannot rewrite the table.</span>`);
}
function setTransport(t) {
  const r = S.rules.find(r => r.pattern === 'registry.npmjs.org');
  r.transport = t;
  pushPolicy(`registry.npmjs.org → transport: ${t}`);
}

// ─────────────────────────────────────────────────────────────── policy writes and propagation
// UI → REST → Postgres → pg_notify → every replica rebuilds → a new policy frame down the control channel.
async function pushPolicy(what, {channel = 'sandbox_policy_changed', from = 'admin'} = {}) {
  S.pushing++;
  refresh();
  stage([admin, nexus, pg, ...VMBOX], 6);
  const route = from === 'cli' ? 'cli' : 'admin';
  const p = new Packet(C.cyan, 'PUT policy', 0.7).at(pipes[route].curve.getPointAt(0));
  log('rest-api', `<b>${channel === 'org_halt_changed' ? 'POST' : 'PATCH'}</b> ${channel === 'org_halt_changed' ? '/v1/orgs/acme/halt' : '/v1/projects/acme/sandboxes/' + SLUG} <u>· ${esc(what)}</u>`);
  await p.pipe(route, 0.8);
  p.text('write');
  await p.pipe('pg', 0.6, true);
  burst(top(pg, 2.0), C.kube, 0.8);
  p.color(C.kube).text(`NOTIFY ${channel}`);
  await sleep(0.25);
  await p.pipe('pg', 0.6);
  p.die();
  fx(top(nexus, 7.4), 'coalesce 250 ms · rebuild', C.cyan);
  if (S.vm === 'started') {
    const f = new Packet(C.cyan, 'policy frame').at(pipes.ctl.curve.getPointAt(0));
    await f.pipe('ctl', 1.0);
    await f.to(GATE.clone().add(V(0, 1.6, 0)), 0.45); f.die();
    burst(GATE.clone().add(V(0, 1.2, 0)), C.cyan, 1.0);
    fx(GATE.clone().add(V(0, 2.4, 0)), 'rules swapped live', C.cyan);
  }
  if (channel === 'org_halt_changed' || channel === 'sandbox_binding_changed') miniPods.forEach((m, i) => setTimeout(() => { m.userData.flash = 1; }, i * 80));
  S.live = snapshot();
  gateCtl.rest = S.live.halted ? C.red : C.cyan;
  if (S.live.cred) showKey(); else gateKey.visible = false;
  S.pushing--;
  refresh();
}
function toggleRule(pattern) {
  const r = S.rules.find(r => r.pattern === pattern);
  r.on = !r.on;
  return pushPolicy(`${r.on ? '+' : '−'} ${pattern}`);
}
function toggleCeiling(pattern) {
  S.ceiling[pattern] = !S.ceiling[pattern];
  return pushPolicy(`org ceiling ${S.ceiling[pattern] ? '+' : '−'} ${pattern}`, {channel: 'sandbox_binding_changed'});
}
async function toggleHalt() {
  S.halted = !S.halted;
  term('policy', S.halted
    ? '<span class="pr">$</span> curl -X POST …/v1/orgs/acme/halt -d \'{"reason":"suspected exfiltration"}\'\n<span class="er">halted</span> · egress refused · inference refused · deny-all pushed to every sandbox\n<span class="cm"># sandboxes keep running; nothing is destroyed</span>'
    : '<span class="pr">$</span> curl -X DELETE …/v1/orgs/acme/halt\n<span class="ok">lifted</span> · each sandbox gets its own policy back');
  await pushPolicy(S.halted ? 'emergency halt' : 'halt lifted', {channel: 'org_halt_changed'});
}

// ─────────────────────────────────────────────────────────────── ingress: the browser opens the Control UI
function ihop(i) { S.ihop = i; if (current.id === 'ingress') refreshPanel(); }
async function openUI({as = 'you'} = {}) {
  stage([browser, mods.ingress, nexus], 5);
  const p = new Packet(C.pink, `GET ${WEB_HOST}`).at(pipes.browser.curve.getPointAt(0));
  ihop(0);
  await p.pipe('browser', 1.0);
  ihop(1);
  fx(top(mods.ingress, 1.8), `*.sb.example.com → ${SLUG} · port web`, C.pink);
  await sleep(0.3);
  ihop(2);
  if (S.vm !== 'started') {
    p.color(C.red).text('404 Not found'); burst(p.pos.clone(), C.red);
    log('sandbox-proxy', `sandbox.expose.request <b>GET</b> / <u>· 404 · no live tunnel</u>`, 'failure');
    fx(top(mods.ingress, 2.4), 'no live tunnel: same 404 as an unknown slug', C.red);
    await p.pipe('browser', 0.8, true); p.die();
    setBrowser('off');
    term('ingress', `<span class="pr">browser</span> https://${WEB_HOST}/\n<span class="er">404 Not found</span> <span class="cm"># the sandbox is not running, so it has no data tunnel</span>`);
    ihop(-1); return;
  }
  if (S.ing.auth === 'private' && !S.ing.cookie && as === 'you') {
    p.color(C.amber).text('302 → sign in');
    burst(p.pos.clone(), C.amber, 0.8);
    log('sandbox-proxy', `sandbox.expose.request <b>GET</b> / <u>· 302 · not signed in</u>`, 'failure');
    await p.pipe('browser', 0.8, true);
    setBrowser('login');
    fx(top(browser, 4.2), 'Sign in with Lens ID (OIDC + PKCE)', C.amber);
    await sleep(1.0);
    p.text('/.nexus-auth/callback?token=…');
    await p.pipe('browser', 0.9);
    p.color(C.gold).text('Set-Cookie: nexus_sandbox_ingress_session');
    burst(p.pos.clone(), C.gold, 0.8);
    S.ing.cookie = true;
    await p.pipe('browser', 0.8, true);
    fx(top(browser, 4.2), 'session cookie · 8 h · Domain=.sb.example.com', C.gold);
    p.color(C.pink).text(`GET ${WEB_HOST}`);
    await p.pipe('browser', 0.9);
  }
  if (as === 'outsider') {
    p.color(C.red).text('401 Unauthorized'); burst(p.pos.clone(), C.red);
    fx(top(mods.ingress, 2.4), 'not a member of project acme', C.red);
    log('sandbox-proxy', `sandbox.expose.request <b>GET</b> / <u>· 401 · api_token outside project acme</u>`, 'failure');
    await p.pipe('browser', 0.8, true); p.die();
    term('ingress', `<span class="pr">$</span> curl -H "Authorization: Bearer lns_…" https://${WEB_HOST}/\n<span class="er">401 Unauthorized</span> <span class="cm"># canAccessSandboxExpose: no access to project acme</span>`);
    ihop(-1); return;
  }
  ihop(3);
  p.text(S.ing.auth === 'private' ? 'x-forwarded-user: you@example.com' : 'anonymous · public port');
  await p.pipe('ing-in', 0.6);
  ihop(4);
  stage([nexus, ...VMBOX], 5);
  p.text('stream · {type:"ingress", port:"web"}');
  await p.pipe('data', 1.1);
  ihop(5);
  await p.path([ring.position.clone().add(V(-0.6, 0.8, -0.8))], 0.4);
  p.text('dial 127.0.0.1:18789');
  await p.path([plates['p-port'].position.clone().add(V(0, 0.4, 0))], 0.5);
  burst(p.pos.clone(), C.pink, 0.8);
  ihop(6);
  lobster.watch(p.g).mood('happy', 2.6).say(S.ing.auth === 'private' ? 'hi you@example.com! here’s my Control UI' : 'someone opened my Control UI', {dur: 3});
  p.text('101 · WebSocket');
  await sleep(0.4);
  await p.path([ring.position.clone().add(V(-0.6, 0.8, -0.8)), UPLINK.clone().add(V(0.3, 0, 0))], 0.6);
  stage([browser, mods.ingress, nexus, ...VMBOX], 6);
  await p.pipe('data', 0.9, true);
  await p.pipe('ing-in', 0.5, true);
  await p.pipe('browser', 0.8, true);
  burst(p.pos.clone(), C.pink, 0.8);
  p.die(); lobster.watch(null);
  setBrowser('ui');
  log('sandbox-proxy', `sandbox.expose.request <b>GET</b> / <u>· 200 · port web · ${S.ing.auth}</u>`);
  term('ingress', `<span class="pr">browser</span> https://${WEB_HOST}/\n<span class="ok">200 OK</span> · OpenClaw Control UI <span class="cm"># ${S.ing.auth === 'private' ? 'signed in as you@example.com' : 'public port: anyone with the URL'}</span>`);
  setTimeout(() => ihop(-1), 3000);
}
async function directToPod() {
  stage([browser, ...VMBOX], 6);
  const p = new Packet(C.pink, 'TCP 10.42.3.17:18789').at(top(browser, 2.6));
  await p.to(NIC.clone().add(V(0.6, 0, 0.2)), 1.4, 6);
  p.color(C.red).text('refused · nothing listens there'); burst(p.pos.clone(), C.red);
  fx(NIC.clone().add(V(0, 1.2, 0)), 'the gateway binds loopback · no Service, no containerPort', C.red);
  await sleep(0.9);
  await p.to(top(browser, 2.6), 1.2, 4); p.die();
  term('ingress', `<span class="pr">$</span> curl http://10.42.3.17:18789/\n<span class="er">curl: (7) Failed to connect: Connection refused</span>\n<span class="cm"># the only route in is the tunnel the sandbox dialed out</span>`);
}
async function unknownSlug() {
  stage([browser, mods.ingress], 4);
  const p = new Packet(C.pink, 'GET web--quiet-mole-9999…').at(pipes.browser.curve.getPointAt(0));
  await p.pipe('browser', 0.9);
  p.color(C.red).text('404 Not found'); burst(p.pos.clone(), C.red);
  fx(top(mods.ingress, 2.2), 'unknown slug, unknown port, no tunnel: all 404', C.red);
  await p.pipe('browser', 0.8, true); p.die();
  term('ingress', `<span class="pr">browser</span> https://web--quiet-mole-9999.sb.example.com/\n<span class="er">404 Not found</span> <span class="cm"># nothing to enumerate</span>`);
}
function toggleAuth() {
  S.ing.auth = S.ing.auth === 'private' ? 'public' : 'private';
  log('rest-api', `<b>PATCH</b> /v1/projects/acme/sandboxes/${SLUG} <u>· exposedPorts web auth: ${S.ing.auth} · new revision</u>`);
  term('ingress', `<span class="cm"># exposedPorts[web].auth = ${S.ing.auth} — a port change is a new revision, so the Pod restarts</span>\n${S.ing.auth === 'public' ? '<span class="am">openclaw: no ingress identity header; serving the Control UI with no authentication</span>' : 'openclaw: auth.mode trusted-proxy · userHeader x-forwarded-user'}`);
  refresh();
}

// ─────────────────────────────────────────────────────────────── credentials
async function storeCred() {
  if (S.cred.stored) return;
  stage([cli, mods.vault, nexus], 4);
  const p = new Packet(C.gold, 'xoxb-… (stdin)', 0.8).at(pipes.cli.curve.getPointAt(0));
  await p.pipe('cli', 0.9);
  await p.pipe('vault', 0.6, true); p.die();
  burst(top(mods.vault, 1.6), C.gold);
  S.cred.stored = true;
  log('rest-api', `<b>POST</b> /v1/projects/acme/credentials <u>· slack-bot-token · value never returned</u>`);
  term('credentials', '<span class="pr">$</span> nexusctl credential create slack-bot-token --project acme --value-stdin \\\n    --inject domain=slack.com,header=Authorization,format="Bearer {value}"\n<span class="ok">created</span> slack-bot-token <span class="cm"># encrypted with ENCRYPTION_KEY</span>');
  refresh();
}
async function referenceCred() {
  if (!S.cred.stored) await storeCred();
  S.cred.referenced = !S.cred.referenced;
  term('credentials', S.cred.referenced
    ? '<span class="cm"># policy: credentials: [{credentialName: slack-bot-token, envVarKey: SLACK_BOT_TOKEN}]</span>'
    : '<span class="cm"># policy: the credential reference is removed</span>');
  if (S.cred.referenced && S.vm === 'started') {
    stage([mods.vault, nexus, ...VMBOX], 6);
    const k = new Packet(C.gold, 'value → supervisor', 0.8).at(pipes.vault.curve.getPointAt(0));
    k.pipe('vault', 0.6).then(async () => { await k.pipe('ctl', 1.1); await k.to(GATE_KEY_POS.clone(), 0.5); k.die(); });
  }
  await pushPolicy(S.cred.referenced ? '+ credential slack-bot-token' : '− credential slack-bot-token');
  if (S.cred.referenced && S.vm === 'started') lobster.watch(gateKey).mood('surprised', 2.4).say('the proxy holds the key, not me', {dur: 3.2});
  setTimeout(() => lobster.watch(null), 2600);
}
function echoToken() {
  if (S.vm !== 'started') return notRunning();
  term('credentials', `<span class="pr">sandbox$</span> echo $SLACK_BOT_TOKEN\n${S.live.cred ? '<span class="gd">__lens_cred:9d1c4e70-5b2a-4f0e-a7c1-2f64d0b8e913__</span> <span class="cm"># a placeholder, never the value</span>' : '<span class="cm">(empty — the policy references no credential)</span>'}`);
  lobster.mood('think', 2.4).say(S.live.cred ? 'my token is just a placeholder' : 'I have no token at all', {dur: 2.8});
}
async function peekSupervisor() {
  if (S.vm !== 'started') return notRunning();
  stage([coreP, ring], 3);
  const p = new Packet(C.claw, 'read /proc/1/environ', 0.7).at(coreP.clone());
  lobster.watch(p.g).mood('think', 0).say('peeking at the supervisor…', {spin: true, dur: 10});
  await p.path([ring.position.clone().add(V(-1.1, 0.3, 1.0))], 0.7);
  p.color(C.red).text('EACCES'); burst(p.pos.clone(), C.red);
  fx(p.pos.clone().add(V(0, 0.6, 0)), 'PR_SET_DUMPABLE=0 · other uid', C.red);
  await p.path([coreP.clone()], 0.6); p.die();
  lobster.watch(null).mood('sad', 3).say('permission denied', {dur: 3});
  term('credentials', '<span class="pr">sandbox$</span> cat /proc/1/environ\n<span class="er">cat: /proc/1/environ: Permission denied</span>\n<span class="cm"># the supervisor is root and non-dumpable; LENS_SANDBOX_* was scrubbed from the agent’s env</span>');
}

// ─────────────────────────────────────────────────────────────── inference
function ghop(i) { S.ghop = i; if (current.id === 'inference') refreshPanel(); }
// rehydra swaps each detected value for a typed tag, keeps the map for this one call, and swaps back in the answer.
const PII = {
  prompt: 'reply to Dana Kim, dana@example.com, about card 4111 1111 1111 1111',
  masked: 'reply to <PII type="PERSON" id="p1"/>, <PII type="EMAIL" id="e2"/>, about card <PII type="CREDIT_CARD" id="c3"/>',
  answer: 'Hi <PII type="PERSON" id="p1"/>, the refund to your card is on its way.',
  rehydrated: 'Hi Dana Kim, the refund to your card is on its way.',
  raw: 'Hi Dana Kim, the refund to card 4111 1111 1111 1111 is on its way.',
  byType: '{"PERSON":1,"EMAIL":1,"CREDIT_CARD":1}',
};
function togglePii() {
  S.inf.pii = !S.inf.pii;
  S.inf.lastPii = null;
  return pushPolicy(S.inf.pii ? 'piiMasking: {types: [PERSON, EMAIL, CREDIT_CARD, …]}' : 'piiMasking removed');
}
async function askModel({prompt = 'summarise #incidents from today'} = {}) {
  if (S.vm !== 'started') return notRunning();
  const pii = prompt === PII.prompt;
  stage(VMFOCUS(), 4.6);
  const p = new Packet(C.cyan, 'POST /v1/messages').at(coreP.clone());
  lobster.turn(0.45).mood('think', 0).say(esc(prompt), {spin: true, dur: 90}).watch(p.g);
  try {
    await p.along(W2G(), 0.8);
    ghop(0);
    p.color(C.gold).text('Authorization: Bearer <sandbox token>');
    fx(p.pos.clone().add(V(0, 0.7, 0)), 'placeholder → sandbox token (Nexus host only)', C.gold);
    await sleep(0.4);
    stage([mods.llmproxy, mods.fwdproxy, nexus, ...VMBOX], 6);
    await toPlatform(p, `…/llm/${S.inf.provider}`);
    await p.to(top(mods.llmproxy, 1.4), 0.4);
    const deny = async (code, why) => {
      p.color(C.red).text(`${code} · ${why}`); burst(p.pos.clone(), C.red);
      log('llm-proxy', `<b>POST</b> ${S.inf.provider}/model/invoke <u>· ${code} · ${esc(why)}</u>`, 'failure');
      stage([mods.llmproxy, ...VMBOX], 6);
      await p.to(top(mods.fwdproxy, 1.0), 0.3);
      await backToPod(p); burst(coreP.clone(), C.red, 0.8); p.die();
      lobster.mood(code === 429 ? 'sad' : 'ouch', 3).say(`${code} — ${why}`, {dur: 3.2});
      term('inference', `<span class="pr">openclaw</span> POST $ANTHROPIC_BASE_URL/v1/messages\n<span class="er">${code} ${code === 429 ? 'Too Many Requests · Retry-After: 3600' : 'Forbidden'}</span> <span class="cm"># ${esc(why)}</span>`);
    };
    ghop(1); await sleep(0.3);
    if (S.live.halted || S.halted) return deny(403, 'organization halted');
    ghop(2); await sleep(0.3);
    if (!S.inf.enabled) return deny(403, 'managed inference not enabled by this project’s policy');
    ghop(3); await sleep(0.3);
    if (S.inf.used >= S.inf.limit) return deny(429, `sandbox budget: $${(S.inf.used / 100).toFixed(2)} of $${(S.inf.limit / 100).toFixed(2)} used`);
    ghop(4);
    if (S.inf.pii) {
      p.text(pii ? 'reply to <PERSON>, <EMAIL>, about card <CREDIT_CARD>' : 'rehydra: nothing to mask');
      if (pii) {
        ['Dana Kim → <PII type="PERSON"/>', 'dana@example.com → <PII type="EMAIL"/>', '4111 … 1111 → <PII type="CREDIT_CARD"/>']
          .forEach((t, i) => setTimeout(() => fx(top(mods.llmproxy, 2.2 + i * 0.8), t, C.pink), i * 350));
        burst(p.pos.clone(), C.pink, 1.0);
        await sleep(1.4);
      } else { fx(top(mods.llmproxy, 2.2), 'PII scan · clean', C.pink); await sleep(0.6); }
    } else if (pii) {
      p.color(C.red).text('no piiMasking · the raw text goes out');
      fx(top(mods.llmproxy, 2.2), 'Dana Kim · dana@example.com · 4111 … leave the platform', C.red);
      await sleep(1.0);
    }
    ghop(5);
    const pv = PROV[S.inf.provider];
    stage([mods.llmproxy, pv.pos.clone().add(V(0, pv.h, 0))], 8);
    p.color(C.pink).text(`${S.inf.provider} · platform key`);
    await p.pipe('llm-' + S.inf.provider, 1.8);
    burst(pv.beacon.getWorldPosition(V(0, 0, 0)), C.pink, 0.9);
    pv.flash = 1;
    const cost = 11;
    p.color(C.green).text(`200 · ${pii ? (S.inf.pii ? 'Hi <PERSON>, the refund…' : 'Hi Dana Kim, the refund…') : 'Here is today’s summary…'}`);
    await sleep(0.2);
    await p.pipe('llm-' + S.inf.provider, 1.5, true);
    ghop(6);
    S.inf.used += cost;
    if (pii && S.inf.pii) { p.text('rehydrated → Hi Dana Kim, …'); fx(top(mods.llmproxy, 2.2), '<PII type="PERSON" id="p1"/> → Dana Kim', C.pink); }
    if (pii) S.inf.lastPii = {masked: S.inf.pii};
    log('llm-proxy', `<b>POST</b> ${S.inf.provider}/model/invoke <u>· 200 · 2 104 in / 388 out · $0.${String(cost).padStart(2, '0')}${S.inf.pii && pii ? ' · piiMasking ' + PII.byType : ''}</u>`);
    stage([mods.llmproxy, ...VMBOX], 6);
    await p.to(top(mods.fwdproxy, 1.0), 0.3);
    await backToPod(p);
    burst(coreP.clone(), C.green, 0.8); p.die();
    lobster.mood('happy', 2.6).say('the model answered ✓', {dur: 3});
    term('inference', `<span class="pr">openclaw</span> POST $ANTHROPIC_BASE_URL/v1/messages\n<span class="ok">200</span> · metered $0.${String(cost).padStart(2, '0')} · spent $${(S.inf.used / 100).toFixed(2)} of $${(S.inf.limit / 100).toFixed(2)} today`);
    refresh();
  } finally { lobster.watch(null).turn(0); setTimeout(() => ghop(-1), 2500); }
}
async function directProvider() {
  const saved = S.live;
  if (S.vm !== 'started') return notRunning();
  stage(VMFOCUS(), 4.6);
  const p = new Packet(C.cyan, 'CONNECT bedrock-runtime…:443').at(coreP.clone());
  lobster.turn(0.45).mood('think', 0).say('calling Bedrock myself…', {spin: true, dur: 20}).watch(p.g);
  await p.along(W2G(), 0.8);
  const v = evaluate('bedrock-runtime.us-east-1.amazonaws.com', saved);
  gateCtl.signal(C.red); gateCtl.refuse();
  p.color(C.red).text('403 Forbidden'); burst(p.pos.clone(), C.red);
  fx(p.pos.clone().add(V(0, 0.6, 0)), 'unmetered egress is not in the policy', C.red);
  log('sandbox-proxy', `<b>POST</b> bedrock-runtime.us-east-1.amazonaws.com/ <u>· 403 · ${esc(v.why)}</u>`, 'failure');
  await p.along(W2G(), 0.7, 1, 0); p.die();
  lobster.watch(null).turn(0).mood('ouch', 3).say('only the metered road is open', {dur: 3});
  term('inference', `<span class="pr">sandbox$</span> curl https://bedrock-runtime.us-east-1.amazonaws.com/…\n<span class="er">403</span> <span class="cm"># metering happens only through the managed endpoint (ADR-003); the provider host stays denied</span>`);
}

// ─────────────────────────────────────────────────────────────── the MCP gateway: upstreams a project attaches
const UPSTREAMS = {
  atlassian: {display: 'Atlassian', url: 'https://mcp.atlassian.com/v1/mcp', route: 'direct', auth: 'OAuth (Login)', tools: ['getJiraIssue', 'searchJiraIssuesUsingJql', 'createJiraIssue']},
  incidents: {display: 'Incidents', url: 'http://incidents.internal:8080/mcp', route: 'tunnel · prod', auth: 'none', tools: ['listIncidents', 'getIncident', 'resolveIncident']},
};
const catalog = () => Object.entries(UPSTREAMS).filter(([k]) => S.ups[k] === 'ready').flatMap(([k, u]) => u.tools.map(t => `${k}__${t}`));
const upstreamOf = tool => tool.split('__')[0];

async function reachUpstream(p, k) {
  if (k === 'atlassian') {
    stage([mods.mcpgw, MCPUP.atlassian.group], 8);
    await p.pipe('mcp-atlassian', 1.6);
    burst(p.pos.clone(), C.amber, 0.8);
    MCPUP.atlassian.flash = 1;
    return true;
  }
  stage([mods.mcpgw, nexus, relay, privSvc, firewall], 7);
  await p.pipe('mcp-in', 0.5);
  await p.to(pipes.tunnel.curve.getPointAt(1), 0.3);
  if (!S.relay.up) {
    p.color(C.red).text('no tunnel for cluster prod'); burst(p.pos.clone(), C.red);
    await sleep(0.8);
    return false;
  }
  await p.pipe('tunnel', 1.4, true);
  await p.pipe('relay-svc', 0.5);
  burst(p.pos.clone(), C.ice, 0.7);
  return true;
}
async function leaveUpstream(p, k, reached) {
  if (k === 'atlassian') return p.pipe('mcp-atlassian', 1.4, true);
  if (reached) { await p.pipe('relay-svc', 0.5, true); await p.pipe('tunnel', 1.3); }
  await p.pipe('mcp-in', 0.5, true);
}
// The gateway lists the upstream's tools and stores them; open sessions hear notifications/tools/list_changed.
async function discover(p, k) {
  p.color(C.amber).text('tools/list');
  const ok = await reachUpstream(p, k);
  if (ok) p.text(`${UPSTREAMS[k].tools.length} tools`);
  await leaveUpstream(p, k, ok);
  if (!ok) return false;
  S.ups[k] = 'ready';
  fx(top(mods.mcpgw, 2.2), `+ ${UPSTREAMS[k].tools.map(t => `${k}__${t}`).join(' · ')}`, C.amber);
  fx(top(mods.mcpgw, 3.0), 'notifications/tools/list_changed', C.amber);
  refresh();
  return true;
}
async function addUpstream(k) {
  if (S.ups[k] !== 'none') return;
  const u = UPSTREAMS[k];
  const route = k === 'atlassian' ? 'admin' : 'cli';
  stage([route === 'admin' ? admin : cli, nexus, mods.mcpgw], 8);
  if (k === 'atlassian') term('mcp', `<span class="cm"># Admin UI → MCP Gateway → Add MCP Upstream</span>\nname atlassian · Streamable HTTP · ${u.url}\ncredential atlassian-oauth · OAuth (Login) · Cluster: Direct (no tunnel)`);
  else term('mcp', `<span class="pr">$</span> nexusctl connector create --project acme --name incidents \\\n    --display-name Incidents --url ${u.url} --cluster prod`);
  const p = new Packet(C.cyan, `POST /mcp-servers · ${k}`, 0.8).at(pipes[route].curve.getPointAt(0));
  await p.pipe(route, 0.8);
  await p.pipe('mcp-in', 0.5, true);
  if (k === 'atlassian') {
    S.ups[k] = 'pending';
    p.color(C.amber).text('status pending · Awaiting Auth');
    burst(p.pos.clone(), C.amber, 0.8);
    log('rest-api', `<b>POST</b> /v1/projects/acme/mcp-servers <u>· atlassian · pending: awaiting auth</u>`);
    await sleep(0.9); p.die();
    refresh();
    return;
  }
  const ok = await discover(p, k);
  p.die();
  if (!ok) S.ups[k] = 'error';
  log('rest-api', `<b>POST</b> /v1/projects/acme/mcp-servers <u>· incidents · cluster prod · ${ok ? 'ready' : 'error: tunnel down'}</u>`, ok ? 'success' : 'error');
  term('mcp', ok ? `created incidents · <span class="ok">ready</span> · 3 tools · transport tunnel` : `created incidents · <span class="er">error</span> · cluster prod has no live tunnel`);
  refresh();
}
async function authorizeUpstream(k = 'atlassian') {
  if (S.ups[k] !== 'pending') return;
  stage([admin, nexus, mods.mcpgw], 8);
  const p = new Packet(C.cyan, 'Authorize · oauth/start', 0.8).at(pipes.admin.curve.getPointAt(0));
  await p.pipe('admin', 0.8);
  fx(top(nexus, 7.4), 'discovery · PKCE · dynamic client registration', C.cyan);
  log('rest-api', `<b>POST</b> …/mcp-servers/atlassian/credentials/atlassian-oauth/oauth/start <u>· authorizeUrl</u>`);
  await p.pipe('mcp-in', 0.5, true);
  p.color(C.amber).text('popup · sign in at Atlassian');
  stage([mods.mcpgw, MCPUP.atlassian.group], 8);
  await p.pipe('mcp-atlassian', 1.6);
  burst(p.pos.clone(), C.amber, 0.8);
  fx(p.pos.clone().add(V(0, 1.2, 0)), 'you consent in the popup', C.amber);
  await sleep(0.5);
  p.text('code → /v1/mcp-servers/oauth/callback');
  await p.pipe('mcp-atlassian', 1.4, true);
  stage([mods.vault, nexus, mods.mcpgw], 7);
  p.color(C.gold).text('tokens · encrypted on your grant');
  await p.pipe('mcp-in', 0.5);
  await p.pipe('vault', 0.5, true);
  burst(p.pos.clone(), C.gold, 0.8);
  log('rest-api', `<b>GET</b> /v1/mcp-servers/oauth/callback <u>· access + refresh token stored</u>`);
  await p.pipe('vault', 0.5);
  await p.pipe('mcp-in', 0.5, true);
  await discover(p, k);
  p.die();
  term('mcp', `<span class="cm"># the popup closed · the grant belongs to the person who signed in\n# the platform refreshes the token before it expires</span>\natlassian · <span class="ok">ready</span> · 3 tools`);
}
async function callTool(from, tool) {
  const k = upstreamOf(tool);
  const sandbox = from === 'sandbox';
  if (sandbox && S.vm !== 'started') return notRunning();
  let p;
  if (sandbox) {
    stage(VMFOCUS(), 4.6);
    p = new Packet(C.amber, `nexus-mcp · ${tool}`).at(coreP.clone());
    lobster.turn(0.45).mood('think', 0).say(tool, {spin: true, dur: 90}).watch(p.g);
    await p.along(W2G(), 0.8);
    p.color(C.gold).text('Bearer <sandbox token>');
    fx(p.pos.clone().add(V(0, 0.7, 0)), 'the proxy adds it for NEXUS_MCP_URL', C.gold);
    await sleep(0.4);
    stage([mods.mcpgw, nexus, ...VMBOX], 7);
    await toPlatform(p, `/projects/acme/mcp · ${tool}`);
    await p.to(top(mods.mcpgw, 1.2), 0.7, 1.5);
  } else {
    stage([desktop, mods.mcpgw], 5);
    p = new Packet(C.amber, `tools/call ${tool}`).at(pipes.desktop.curve.getPointAt(0));
    await p.pipe('desktop', 1.0);
  }
  const who = sandbox ? `sandbox ${SLUG}` : 'you@example.com';
  const back = async ok => {
    if (sandbox) {
      stage([mods.mcpgw, ...VMBOX], 6);
      await p.to(top(mods.fwdproxy, 1.0), 0.6);
      await backToPod(p);
      burst(coreP.clone(), ok ? C.green : C.red, 0.8);
    } else {
      stage([desktop, mods.mcpgw], 5);
      await p.pipe('desktop', 0.9, true);
      burst(p.pos.clone(), ok ? C.amber : C.red, 0.8);
    }
    p.die();
  };
  const caller = sandbox ? '<span class="pr">openclaw</span>' : '<span class="pr">mcp client</span>';
  try {
    if (S.halted) {
      p.color(C.red).text('isError · connector traffic suspended'); burst(p.pos.clone(), C.red);
      log('mcp-tool', `<b>${tool}</b> <u>· ${who} · org halted</u>`, 'failure');
      await back(false);
      term('mcp', `${caller} ${tool}(…)\n<span class="er">This organization is under an emergency halt; connector traffic is suspended.</span>`);
      return;
    }
    if (!catalog().includes(tool) || !S.allowed.has(tool)) {
      p.color(C.red).text('-32601 Method not found'); burst(p.pos.clone(), C.red);
      fx(top(mods.mcpgw, 2.0), S.ups[k] === 'ready' ? 'not in allowedTools: never registered for this caller' : 'no ready upstream offers it', C.red);
      await back(false);
      if (sandbox) lobster.mood('surprised', 2.6).say('that tool doesn’t exist for me', {dur: 3});
      term('mcp', `${caller} ${tool}(…)\n<span class="er">MCP error -32601: Method not found</span> <span class="cm"># a hidden tool looks exactly like a missing one</span>`);
      return;
    }
    p.color(C.gold).text(k === 'atlassian' ? 'Authorization from the OAuth grant' : 'through cluster prod');
    fx(top(mods.mcpgw, 2.0), `${tool} → ${UPSTREAMS[k].display} · ${UPSTREAMS[k].tools.find(t => tool.endsWith(t))}`, C.amber);
    await sleep(0.4);
    const ok = await reachUpstream(p, k);
    const answer = ok ? (k === 'atlassian' ? '3 issues · PAY-4121 …' : '2 open incidents') : 'Tool call failed';
    p.color(ok ? C.green : C.red).text(ok ? answer : 'isError · Tool call failed');
    await leaveUpstream(p, k, ok);
    log('mcp-tool', `<b>${tool}</b> <u>· ${who} · ${ok ? 'upstream ' + k : 'upstream unreachable'}</u>`, ok ? 'success' : 'error');
    await back(ok);
    if (sandbox) lobster.mood(ok ? 'happy' : 'sad', 2.6).say(ok ? `${answer} ✓` : 'the upstream is unreachable', {dur: 3});
    term('mcp', `${caller} ${tool}(…)\n${ok ? `<span class="ok">${answer}</span>` : '<span class="er">isError: Tool call failed</span> <span class="cm"># cluster prod has no tunnel</span>'}`);
  } finally { if (sandbox) lobster.watch(null).turn(0); }
}
function toggleTool(t) {
  S.allowed.has(t) ? S.allowed.delete(t) : S.allowed.add(t);
  log('rest-api', `<b>PATCH</b> policy openclaw · connectors[${upstreamOf(t)}].allowedTools <u>· ${S.allowed.has(t) ? '+' : '−'} ${t}</u>`);
  refresh();
}
async function toggleRelay() {
  S.relay.up = !S.relay.up;
  stage([relay, firewall, nexus], 7);
  if (S.relay.up) {
    const p = new Packet(C.cyan, 'wss /v1/tunnel · lnst_…').at(pipes.tunnel.curve.getPointAt(0));
    await p.pipe('tunnel', 1.6); p.die();
    burst(top(nexus, 5), C.cyan, 0.9);
    fx(top(firewall, 3.4), 'outbound only · no hole in the firewall', C.cyan);
    term('mcp', '<span class="cm"># the relay (RELAY_MODE=tunnel) dialed out to /v1/tunnel</span>\ntunnel <span class="ok">up</span> · cluster prod reachable');
  } else {
    burst(top(relay, 2.2), C.red, 0.9);
    term('mcp', '<span class="cm"># the relay pod is gone</span>\ntunnel <span class="er">down</span> · nothing can reach incidents.internal');
  }
  refresh();
}

// ─────────────────────────────────────────────────────────────── identity
async function raiseOwnCap() {
  if (S.vm !== 'started') return notRunning();
  stage([coreP, nexus, ...VMBOX], 6);
  const p = new Packet(C.claw, 'set_spending_limit $1000').at(coreP.clone());
  lobster.turn(0.45).mood('think', 0).say('I’ll just raise my own budget…', {spin: true, dur: 20}).watch(p.g);
  await p.along(W2G(), 0.8);
  await toPlatform(p, 'mcp set_spending_limit');
  await p.to(top(nexus, 3), 0.5);
  p.color(C.red).text('403 · needs a human session'); burst(p.pos.clone(), C.red);
  log('mcp-tool', `<b>set_spending_limit</b> <u>· 403 · a sandbox token cannot lift its own cap</u>`, 'failure');
  await p.to(top(mods.fwdproxy, 1.0), 0.4);
  await backToPod(p); p.die();
  lobster.watch(null).turn(0).mood('ouch', 3).say('403 — only a person can raise it', {dur: 3});
  term('rbac', '<span class="pr">openclaw</span> set_spending_limit({"actorType":"sandbox","limitCents":100000})\n<span class="er">403 Forbidden</span> <span class="cm"># spending-limit changes require a human session</span>');
}

// ─────────────────────────────────────────────────────────────── panels
function yaml(lines) {
  return '<pre class="yaml">' + lines.map(L => {
    const o = typeof L === 'string' ? {t: L} : L;
    let t = esc(o.t);
    t = t.replace(/(#.*)$/, '<span class="cm">$1</span>')
      .replace(/^(\s*-?\s*)([\w.~\/-]+)(:)(?=\s|$)/, '$1<span class="k">$2</span>$3')
      .replace(/(:\s)(allow)\b/, '$1<span class="v-a">$2</span>').replace(/(:\s)(deny)\b/, '$1<span class="v-d">$2</span>')
      .replace(/(:\s)(\d[\w.]*)$/, '$1<span class="n">$2</span>');
    const src = o.src ? `<span class="src">${o.src}</span>` : '';
    return `<span class="l${o.hl ? ' hl' : ''}${o.dim ? ' dim' : ''}${o.ch ? ' click' : ''}" ${o.ch ? `data-ch="${o.ch}"` : ''} style="${o.c ? '--hc:' + o.c : ''}">${src}${t || ' '}</span>`;
  }).join('') + '</pre>';
}
const SANDBOX_YAML = () => [
  {t: '# nexusctl sandbox create -f sandbox.yaml --volume /data'},
  {t: 'image: ghcr.io/openclaw/openclaw:2026.8.2', ch: 'boot'}, {t: 'command: …  # patch openclaw.json, exec openclaw gateway', ch: 'boot'},
  {t: 'cpu: 500m', ch: 'boot'}, {t: 'memory: 2Gi', ch: 'boot'},
  {t: 'env:', ch: 'boot'}, {t: '  LENS_SANDBOX_WRITABLE_DIR: /data', ch: 'boot'}, {t: '  OPENCLAW_CONFIG_PATH: /data/openclaw.json', ch: 'boot'}, {t: '  OPENCLAW_NO_AUTO_UPDATE: "1"', ch: 'boot'},
  {t: 'exposedPorts:', ch: 'ingress'}, {t: '  - name: web', ch: 'ingress'}, {t: '    port: 18789', ch: 'ingress'}, {t: `    auth: ${S.ing.auth}`, ch: 'ingress'},
  {t: 'policy:', ch: 'policy'}, {t: '  name: openclaw', ch: 'policy'}, {t: '  networkDefaultVerdict: deny', ch: 'network'},
  {t: '  allowedDomains:', ch: 'network'},
  ...S.rules.filter(r => r.on).flatMap(r => [{t: `    - pattern: ${r.pattern}`, ch: 'network'}, {t: `      verdict: ${r.verdict}`, ch: 'network'}, ...(r.verdict === 'allow' ? [{t: `      transport: ${r.transport}`, ch: 'network'}] : [])]),
  ...(S.cred.referenced ? [{t: '  credentials:', ch: 'credentials'}, {t: '    - credentialName: slack-bot-token', ch: 'credentials'}, {t: '      envVarKey: SLACK_BOT_TOKEN', ch: 'credentials'}] : []),
  {t: '  managedInference:', ch: 'inference'}, {t: `    enabled: ${S.inf.enabled}`, ch: 'inference'}, {t: `    provider: ${S.inf.provider}`, ch: 'inference'},
];
function term(ch, html) {
  (S.term[ch] = S.term[ch] || []).push(html);
  if (S.term[ch].length > 6) S.term[ch].shift();
  if (current?.id === ch) { const t = $('#term'); if (t) { t.innerHTML = S.term[ch].join('\n'); t.scrollTop = 1e6; } }
}
const termBox = (ch, hint) => `<section class="card pane"><h3>Terminal <em>${hint || 'what the agent sees'}</em></h3><pre class="term" id="term">${(S.term[ch] || ['<span class="cm"># try the buttons on the left</span>']).join('\n')}</pre></section>`;
const rowsOf = (list, on) => list.map(([t, s, c], i) => `<div class="row ${on === i ? 'on' : on > i ? 'done' : ''}" style="--c:${c}"><span class="ic">${i + 1}</span><span class="tx"><b>${t}</b><small>${s}</small></span></div>`).join('');

let overviewTab = 'yaml', overviewOpen = false;
function piiCard() {
  const L = S.inf.lastPii;
  const row = (who, text, c) => `<b>${who}</b><span style="color:${c}">${esc(text)}</span>`;
  const body = !L ? '<p class="audit-empty">Ask with PII in the prompt to compare what each side sees.</p>'
    : `<div class="kv">${row('OpenClaw sent', PII.prompt, '#c9d2e6')}${row('provider saw', L.masked ? PII.masked : PII.prompt, L.masked ? C.pink : C.red)}${row('provider said', L.masked ? PII.answer : PII.raw, L.masked ? C.pink : C.red)}${row('OpenClaw got', L.masked ? PII.rehydrated : PII.raw, '#c9d2e6')}${L.masked ? row('audit', 'byType ' + PII.byType + ' · values never stored', C.cyan) : ''}</div>`;
  return `<section class="card pane"><h3>PII masking <em><button class="btn" data-pii="1" style="height:20px;padding:0 6px;font-size:10px">piiMasking: ${S.inf.pii ? 'on' : 'off'}</button></em></h3>${body}</section>`;
}
const PANELS = {
  overview() {
    if (!overviewOpen) return `<section class="card pane"><h3>The sandbox <em>one sandbox.yaml</em></h3><button class="btn" data-open="1" style="width:100%;justify-content:space-between">Show the document behind it <span class="k">sandbox.yaml ▸</span></button></section>`;
    const tabs = `<div class="tabs"><button data-tab="yaml" class="${overviewTab === 'yaml' ? 'on' : ''}">sandbox.yaml</button><button data-tab="kinds" class="${overviewTab === 'kinds' ? 'on' : ''}">3 kinds of agent</button><button data-tab="map" class="${overviewTab === 'map' ? 'on' : ''}">legend</button></div>`;
    let body;
    if (overviewTab === 'yaml') body = yaml(SANDBOX_YAML().map(l => ({...l, c: CH.find(c => c.id === l.ch)?.color})));
    else if (overviewTab === 'kinds') body = `<div class="rows">${[
      [C.claw, 'Managed agent · Mode 2', 'runs in a platform sandbox: OpenClaw, Hermes, Prism'],
      [C.amber, 'MCP client · Mode 1', 'Claude Desktop, Cursor, VS Code: MCP to the gateway'],
      [C.cyan, 'External agent · Mode 1', 'CI jobs and your own services, with an API token (lns_…)']]
      .map(([c, t, s]) => `<div class="row on" style="--c:${c}"><span class="ic"></span><span class="tx"><b>${t}</b><small>${s}</small></span></div>`).join('')}</div>`;
    else body = `<div class="rows">${[
      [C.cyan, 'Lens Agents itself', 'the platform, the supervisor, the boundary proxy, the tunnels'], [C.claw, 'the agent', 'OpenClaw, and what it writes to its own layer'],
      [C.kube, 'Kubernetes', 'the clusters, their API servers, the reconciler’s Pods'], [C.ice, 'your data', 'volumes, internal services, private networks'],
      [C.green, 'allowed', 'traffic the proxy lets through'], [C.red, 'denied', 'refused, with an audit record'], [C.gold, 'secret', 'a real credential value'], [C.pink, 'ingress · inference', 'browser traffic in, model calls out']]
      .map(([c, t, s]) => `<div class="row on" style="--c:${c}"><span class="ic"></span><span class="tx"><b>${t}</b><small>${s}</small></span></div>`).join('')}</div>`;
    return `<section class="card pane" style="flex:1"><h3>The sandbox <em><button class="btn" data-open="0" style="height:20px;padding:0 6px;font-size:10px">hide</button></em></h3>${tabs}<div class="scroll">${body}</div></section>`;
  },
  boot() {
    const rows = BOOT.map(([t, s, pk], i) => `<div class="row click ${S.boot === i ? 'on' : S.boot > i ? 'done' : ''}" data-part="${pk}" style="--c:${i < 3 ? C.kube : C.cyan}"><span class="ic">${i + 1}</span><span class="tx"><b>${t}</b><small>${s}</small></span></div>`).join('');
    return `<section class="card pane" style="flex:1"><h3>Boot sequence <em>${S.vm === 'creating' ? 'starting…' : 'press Create to watch'}</em></h3><div class="scroll"><div class="rows">${rows}</div></div></section>
      <section class="card pane"><h3>Process tree <em>inside the Pod</em></h3><pre class="term">${S.vm === 'started' ? `<span class="cy">1</span>  /.lens/nexus-agent-sandbox <span class="cm">root · nft · proxy · dns</span>
└ <span class="am">sh -c "$AGENT_COMMAND"</span>  <span class="cm">uid 1000 (node)</span>
  └ <span class="am">openclaw gateway</span>  <span class="cm">127.0.0.1:18789</span>` : S.vm === 'creating' ? '<span class="cm">starting…</span>' : '<span class="cm">no Pod — the sandbox is ' + S.vm + '</span>'}</pre></section>${termBox('boot', 'nexusctl and the sandbox')}`;
  },
  ingress() {
    const hops = [
      ['browser', `https://${WEB_HOST}`, C.pink],
      ['ingress controller', 'rule *.sb.example.com → nexus :3002 (wildcard DNS + cert)', C.pink],
      ['host match', 'last “--” splits port and slug → sandbox, active revision, port web', C.cyan],
      ['auth · RBAC', `${S.ing.auth === 'private' ? 'Bearer or session cookie · must reach project acme' : 'public: anyone'}`, C.amber],
      ['headers', 'strip Authorization + Nexus cookies · add x-forwarded-user', C.cyan],
      ['data tunnel', 'bored-mplex stream {type:"ingress", port:"web"}', C.pink],
      ['supervisor', 'resolves “web” itself · dials 127.0.0.1:18789', C.green],
    ];
    return `<section class="card pane" style="flex:1"><h3>One inbound request <em>hop by hop</em></h3><div class="scroll"><div class="rows">${rowsOf(hops, S.ihop)}</div></div></section>
      <section class="card pane"><h3>What the agent is told <em>env</em></h3><div class="kv">
        <b>PORT_WEB</b><span>18789</span><b>NEXUS_INGRESS_ORIGINS_WEB</b><span>https://${SLUG}.sb.example.com,https://${WEB_HOST}</span>
        ${S.ing.auth === 'private' ? '<b>NEXUS_INGRESS_IDENTITY_HEADER_WEB</b><span>x-forwarded-user</span>' : '<b>(public)</b><span>no identity header</span>'}
        <b>session</b><span>${S.ing.cookie ? '<span class="y">nexus_sandbox_ingress_session ✓</span>' : 'not signed in'}</span></div></section>${termBox('ingress', 'browser and curl')}`;
  },
  network() {
    const hops = [
      ['socket', 'OpenClaw opens a TCP connection (or a DNS query)', C.claw],
      ['nftables', 'inet lens_sandbox: TCP → :3129, DNS → :5355, the rest dropped', C.cyan],
      ['proxy', 'reads the host name: CONNECT line, TLS SNI or Host', C.cyan],
      ['policy', 'first matching rule wins · no match → networkDefaultVerdict', C.amber],
      ['transport', 'direct: out over eth0 · upstream: through the platform', C.green],
      ['egress', 'cluster network, or the platform’s forward proxy', C.green],
      ['destination', 'the response comes back the same way', C.green],
    ];
    const npm = S.rules.find(r => r.pattern === 'registry.npmjs.org');
    return `<section class="card pane" style="flex:1"><h3>One outbound request <em>hop by hop</em></h3><div class="scroll"><div class="rows">${rowsOf(hops, S.hop)}</div></div></section>
      <section class="card pane"><h3>Transport <em>registry.npmjs.org</em></h3><div class="seg" id="tr">${['direct', 'upstream'].map(t => `<button data-tr="${t}" class="${npm.transport === t ? 'on' : ''}">${t}</button>`).join('')}</div></section>${termBox('network')}`;
  },
  policy() {
    const hosts = ['registry.npmjs.org', 'slack.com', 'api.github.com', 'pastebin.com', 'telemetry.evil.example'];
    const rows = hosts.map(h => {
      const r = S.rules.find(r => r.pattern === h);
      const v = evaluate(h, snapshot());
      const cap = h in S.ceiling;
      return `<tr><td>${h}</td>
        <td>${cap ? `<button class="sw2 ${S.ceiling[h] ? 'on' : ''}" data-ceil="${h}" style="--c:${C.kube}" aria-label="org ceiling ${h}"></button>` : '<small>—</small>'}</td>
        <td><button class="sw2 ${r.on ? 'on' : ''}" data-rule="${h}" style="--c:${r.verdict === 'deny' ? C.red : C.green}" aria-label="project rule ${h}"></button><small>${r.verdict}</small></td>
        <td><span class="pill" style="--c:${VCOL[v.verdict]}">${v.verdict}</span><small>${v.clipped ? 'clipped · drift' : v.src === 'default' ? 'default' : v.src === 'halt' ? 'halt' : ''}</small></td></tr>`;
    }).join('');
    const org = [{t: '# org policy "org-egress" · binding: all_sandboxes'}, {t: 'name: org-egress'}, {t: 'allowedDomains:'},
      ...Object.entries(S.ceiling).filter(([, v]) => v).flatMap(([p]) => [{t: `  - pattern: "${p}"`, c: C.kube, hl: true}, {t: '    verdict: allow'}]),
      {t: 'managedInference:'}, {t: '  enabled: true'}, {t: 'piiMasking:'}, {t: '  types: [EMAIL, PHONE, CREDIT_CARD, PERSON]'}];
    return `${S.halted ? '<div class="banner">Organization halted · deny-all pushed to every sandbox · inference refused</div>' : ''}
      <section class="card pane"><h3>Effective egress <em>${S.pushing ? 'pushing a policy frame…' : 'org ceiling ∩ project policy'}</em></h3><div class="scroll"><table class="tbl"><tr><th>host</th><th>org</th><th>project</th><th>sandbox</th></tr>${rows}</table></div></section>
      <section class="card pane" style="flex:1"><h3>The ceiling <em>org-scoped · never grants</em></h3><div class="scroll">${yaml(org)}</div></section>${termBox('policy', 'the platform')}`;
  },
  credentials() {
    const c = S.cred;
    const lamp = (on, i, b, s) => `<div class="lamp ${on ? 'on' : ''}"><i>${i}</i><b>${b}</b><small>${s}</small></div>`;
    const frame = [{t: '// policy frame · credentials[0]'}, {t: '{'}, {t: '  "envVar": "SLACK_BOT_TOKEN",'}, {t: '  "placeholder": "__lens_cred:9d1c4e70-…__",', hl: true, c: C.gold},
      {t: '  "injections": [{'}, {t: '    "injectionType": "header",'}, {t: '    "domain": "slack.com",', hl: true, c: C.gold}, {t: '    "header": "Authorization",'}, {t: '    "value": "Bearer xoxb-•••• (real)"', hl: true, c: C.gold}, {t: '  }]'}, {t: '}'}];
    return `<section class="card pane"><h3>Three facts <em>where the value is</em></h3><div class="lamps">${lamp(c.stored, 'project', 'stored', 'encrypted · write-only')}${lamp(c.referenced, 'policy', 'referenced', 'envVarKey')}${lamp(S.live.cred && S.vm === 'started', 'this Pod', 'delivered', 'supervisor memory')}</div></section>
      <section class="card pane"><h3>What the supervisor holds <em>the agent never sees this</em></h3><div class="scroll">${S.live.cred ? yaml(frame) : '<p class="audit-empty">No credential in the frame yet.</p>'}</div></section>${termBox('credentials', 'inside the sandbox')}`;
  },
  inference() {
    const gates = [
      ['boundary proxy', 'placeholder → the sandbox’s own bearer, for the platform host only', C.gold],
      ['org halt', S.halted ? 'halted → 403' : 'not halted', S.halted ? C.red : C.green],
      ['policy', `managedInference.enabled: ${S.inf.enabled}`, S.inf.enabled ? C.green : C.red],
      ['budget', `$${(S.inf.used / 100).toFixed(2)} of $${(S.inf.limit / 100).toFixed(2)} today`, S.inf.used >= S.inf.limit ? C.red : C.green],
      ['PII masking', S.inf.pii ? 'rehydra: mask before, unmask after' : 'off', C.pink],
      ['provider', `${S.inf.provider} · with the platform’s key`, C.pink],
      ['meter', 'usage + cost on the audit record', C.cyan],
    ];
    const pct = Math.min(100, S.inf.used / Math.max(1, S.inf.limit) * 100);
    return `<section class="card pane" style="flex:1"><h3>One model call <em>through the LLM proxy</em></h3><div class="scroll"><div class="rows">${rowsOf(gates, S.ghop)}</div></div></section>
      <section class="card pane"><h3>Sandbox budget <em>nexusctl sandbox spend</em></h3><div class="kv"><b>limit</b><span>$${(S.inf.limit / 100).toFixed(2)} / day</span><b>spent</b><span>$${(S.inf.used / 100).toFixed(2)}</span></div><div class="meter" style="--c:${pct >= 100 ? C.red : pct > 70 ? C.amber : C.green}"><i style="width:${pct}%"></i></div>
      <div style="margin-top:8px" class="seg">${['bedrock', 'openrouter'].map(p => `<button data-prov="${p}" class="${S.inf.provider === p ? 'on' : ''}">${p}</button>`).join('')}</div></section>
      ${piiCard()}
      <section class="card pane"${S.inf.lastPii ? ' hidden' : ''}><h3>Seeded env <em>what OpenClaw is told</em></h3><div class="kv"><b>ANTHROPIC_BASE_URL</b><span>https://agents.example.com/v1/projects/acme/llm/${S.inf.provider}${S.inf.provider === 'openrouter' ? '/anthropic' : '/us-east-1'}</span><b>ANTHROPIC_AUTH_TOKEN</b><span>__lens_cred:nexus-llm-${S.inf.provider}__</span><b>ANTHROPIC_API_KEY</b><span>nexus-managed</span><b>LENS_MANAGED_INFERENCE_PROVIDER</b><span>${S.inf.provider}</span></div></section>${termBox('inference', 'OpenClaw')}`;
  },
  mcp() {
    const pill = st => `<span class="pill" style="--c:${{ready: C.green, pending: C.amber, error: C.red, none: C.grey}[st]}">${st === 'pending' ? 'awaiting auth' : st === 'none' ? 'not added' : st}</span>`;
    const ups = Object.entries(UPSTREAMS).map(([k, u]) => `<tr><td>${k}</td><td><small>${u.route}</small></td><td><small>${u.auth}</small></td><td>${pill(S.ups[k])}</td></tr>`).join('');
    const tools = catalog().map(t => `<tr><td style="font-family:var(--mono);font-weight:500">${t}</td><td><button class="sw2 ${S.allowed.has(t) ? 'on' : ''}" data-tool="${t}" style="--c:${C.amber}" aria-label="allow ${t}"></button></td></tr>`).join('');
    return `<section class="card pane"><h3>Upstreams <em>project acme · MCP Gateway</em></h3><table class="tbl"><tr><th>name</th><th>route</th><th>auth</th><th>status</th></tr>${ups}</table></section>
      <section class="card pane" style="flex:1"><h3>Catalog <em>policy openclaw · allowedTools</em></h3><div class="scroll">${tools ? `<table class="tbl"><tr><th>tool</th><th>allowed</th></tr>${tools}</table>` : '<p class="audit-empty">No ready upstream yet. Add one on the left.</p>'}</div></section>
      <section class="card pane"><h3>Cluster prod <em>relay</em></h3><div class="kv"><b>tunnel</b><span>${S.relay.up ? '<span class="y">up</span>' : '<span class="n">down</span>'}</span><b>mode</b><span>RELAY_MODE=tunnel · TUNNEL_TOKEN=lnst_…</span><b>inbound ports</b><span>none</span></div></section>${termBox('mcp', 'the gateway and its callers')}`;
  },
  rbac() {
    const pr = [['user', 'OIDC · Lens ID', 'people: web UI, nexusctl'], ['api_token', 'Bearer lns_…', 'desktop tools, CI'], ['sandbox', 'sandbox token over WSS', 'managed agents']]
      .map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`).join('');
    const srcs = ['all', 'rest-api', 'sandbox-proxy', 'llm-proxy', 'mcp-tool', 'k8s-proxy', 'forward-proxy'];
    const list = audit.filter(e => auditFilter === 'all' || e.src === auditFilter).slice(0, 40);
    return `<section class="card pane"><h3>Principals <em>who can act</em></h3><table class="tbl"><tr><th>type</th><th>auth</th><th>used by</th></tr>${pr}</table>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center"><span class="try-h">you are</span><div class="seg">${['member', 'admin'].map(w => `<button data-who="${w}" class="${S.who === w ? 'on' : ''}">project ${w.toUpperCase()}</button>`).join('')}</div></div></section>
      <section class="card pane" style="flex:1"><h3>Audit trail <em>source · action · result</em></h3><div class="seg" style="flex-wrap:wrap">${srcs.map(s => `<button data-src="${s}" class="${auditFilter === s ? 'on' : ''}">${s}</button>`).join('')}</div>
      <div class="scroll audit-list" style="margin-top:6px">${list.length ? '' : '<p class="audit-empty">Nothing recorded yet for this source.</p>'}</div></section>${termBox('rbac', 'nexusctl and the agent')}`;
  },
};

// ─────────────────────────────────────────────────────────────── chapters
const CH = [
  {id: 'overview', title: 'The whole platform', color: C.cyan, cam: [V(-2, 66, 64), V(-2, 3, -3)],
    labels: ['cp', 'cluster', 'shell', 'workload', 'gate', 'nexus', 'browser', 'desktop', 'priv'],
    lede: 'Lens Agents runs AI agents on <b>your own infrastructure</b>. Each agent gets a sandbox that sees only what its policy allows, holds no real secrets, and leaves an audit record for everything it does.',
    body: `<p><b>Left</b>, the <b class="c-cy">control plane</b>: the platform server, its database and the Admin UI. <b>Middle</b>, a <b style="color:${C.kube}">Kubernetes cluster</b>. Every Pod on it is a sandbox, booted as its own <b>Kata microVM</b>. One Pod is opened up, with <b style="color:${C.claw}">OpenClaw</b> inside and the <b class="c-cy">boundary proxy</b> on its wall. <b>Right</b>, the internet and the model providers. <b>Back</b>, a private network behind a firewall.</p>
      <p>Each tower’s light shows what this sandbox’s policy would do: <b class="c-gr">allow</b> or <b class="c-rd">deny</b>.</p>
      <p style="color:#8d97b3">Hover anything to learn what it is · <code>→</code> next chapter</p>`,
    acts: () => [
      ['▶ Replay the tour', 'pri', () => startTour()],
      ['open the Control UI', '', () => openUI(), C.pink],
      ['ask the model', '', () => askModel(), C.pink],
      ['<code>curl telemetry.evil.example</code>', '', () => request('evil'), C.red],
    ]},
  {id: 'boot', title: 'A sandbox starts', color: C.cyan, cam: [V(-14, 22, 36), V(-12, 2.4, 0)],
    labels: ['cli', 'nexus', 'apiserver', 'node-a', 'pedestal', 'seed', 'discover', 'supervisor', 'workload', 'pv', 'uplink'],
    lede: 'One <code>nexusctl sandbox create</code>, and the platform’s reconciler turns it into a <b>Pod</b>. Kata boots the Pod as a microVM, and two init containers and a supervisor turn it into a cage <b>before</b> OpenClaw runs.',
    body: `<p>The platform never runs agents itself. It writes a <b style="color:${C.kube}">Pod</b> to the cluster with <code>runtimeClassName: kata-clh</code>, and Kata boots it with its own guest kernel.</p>
      <p><b class="c-cy">seed-supervisor</b> copies three static binaries into <code>/.lens</code>. <b class="c-cy">discover-image</b> records the image’s own user. Then the container starts, with its command replaced by <b class="c-cy">nexus-agent-sandbox</b>, built on <code>lens-sandbox-core</code>, the same core lns uses.</p>
      <p>As PID 1 and root, the supervisor makes itself non-dumpable, installs the <b>nftables</b> cage (fail-closed), starts the proxy and DNS stub, and <b>dials out</b> to the platform. The first <b>policy frame</b> brings the rules, the proxy CA, credential values, env and files. Only then does it drop to uid 1000 and start OpenClaw.</p>
      <p><b style="color:${C.ice}">/data</b> is a PVC: it survives stop, start and new revisions. The writable layer goes with the Pod.</p>`,
    acts: () => [
      [S.vm === 'gone' ? '▶ Create the sandbox' : '▶ Create it again', 'pri', () => S.vm === 'gone' ? recreate() : (S.vm === 'started' ? stopVm().then(deleteVm).then(recreate) : deleteVm().then(recreate))],
      ['write <code>/data</code>', '', () => writeFile('data'), C.ice],
      ['write <code>/var/tmp</code>', '', () => writeFile('upper'), C.claw],
      S.vm === 'started' ? ['<code>nexusctl sandbox stop</code>', '', stopVm, C.amber] : ['<code>nexusctl sandbox start</code>', '', startVm, C.green],
      ['<code>nexusctl sandbox exec</code>', '', execShell, C.cyan],
    ]},
  {id: 'ingress', title: 'Ingress: open the Control UI', color: C.pink, cam: [V(-14, 20, 42), V(-12, 3, 5)],
    labels: ['browser', 'ingress', 'nexus', 'pipe-data', 'p-port', 'workload', 'uplink'],
    lede: 'OpenClaw’s gateway listens on <b>127.0.0.1</b> only, and the Pod has no Service and no open port. The way in is a tunnel the sandbox <b>dialed out</b> itself.',
    body: `<p>Every exposed port gets a host name: <code>${SLUG}.sb.example.com</code> for the first port, and <code>web--${SLUG}.sb.example.com</code>. A wildcard ingress sends them all to the platform, which matches the name to a sandbox and a port.</p>
      <p>A <b>private</b> port needs a signed-in principal who can reach the project. A browser without a session is sent to <b>Lens ID</b> and comes back with a session cookie for <code>.sb.example.com</code>. Everyone else gets <b class="c-rd">401</b>. An unknown slug, an unknown port and a stopped sandbox all get the same <b class="c-rd">404</b>, so nothing can be enumerated.</p>
      <p>The request then goes down the sandbox’s <b style="color:${C.pink}">data tunnel</b> as a stream that names its port. The supervisor resolves the name itself and dials <code>127.0.0.1:18789</code>. OpenClaw trusts the <code>x-forwarded-user</code> header, so its own audit names you.</p>`,
    acts: () => [
      ['open the Control UI', 'pri', () => openUI(), C.pink],
      ['connect to the Pod IP', '', directToPod, C.red],
      ['curl from outside the project', '', () => openUI({as: 'outsider'}), C.red],
      ['unknown slug', '', unknownSlug, C.red],
      [`auth: ${S.ing.auth} → ${S.ing.auth === 'private' ? 'public' : 'private'}`, '', toggleAuth, C.amber],
    ]},
  {id: 'network', title: 'Egress: one door out', color: C.cyan, cam: [V(12, 20, 40), V(12, 2.6, 0)],
    labels: ['gate', 'nic', 'egress', 'dest-*', 'fwdproxy', 'pipe-upstream'],
    lede: 'Inside the Pod, <b>nftables</b> sends every TCP connection to the supervisor’s proxy and every DNS query to its stub, and drops the rest. No route out skips the gate.',
    body: `<p>The proxy reads the <b>host name</b> from the <code>CONNECT</code> line, the TLS SNI or the HTTP Host, and matches it against <code>allowedDomains</code>. The first match wins. No match gets <code>networkDefaultVerdict</code>, here <b class="c-rd">deny</b>. A denied request gets <b class="c-rd">403</b> and an audit record.</p>
      <p>Each rule also has a <b>transport</b>. <code>direct</code> means the proxy dials out through the cluster’s network. <code>upstream</code> means it tunnels through the platform’s <b class="c-cy">forward proxy</b>, so the connection leaves from one audited place, or through a cluster relay.</p>
      <p><code>--noproxy</code> doesn’t help: nftables redirects the socket anyway, and a TLS connection with no name is refused. A denied name gets <b>NXDOMAIN</b>, so it never even resolves.</p>`,
    acts: () => [
      ['<code>npm view openclaw</code>', '', () => request('npm', {cmd: 'npm view openclaw'}), C.green],
      ['<code>curl telemetry.evil.example</code>', '', () => request('evil'), C.red],
      ['<code>curl api.github.com</code>', '', () => request('github'), C.red],
      ['<code>nslookup telemetry.evil…</code>', '', () => dnsLookup('telemetry.evil.example'), C.red],
      ['skip the proxy', '', bypass, C.red],
    ]},
  {id: 'policy', title: 'Policies: ceiling and grants', color: C.cyan, cam: [V(-10, 26, 44), V(-11, 3, -2)],
    labels: ['admin', 'nexus', 'pg', 'pipe-ctl', 'gate', 'dest-*'],
    lede: 'A project policy <b>grants</b>. An org policy bound to <code>all_sandboxes</code> is a <b>ceiling</b>: it never grants anything by itself, and anything above it is clipped. Change either one and the running sandbox is updated in about a quarter of a second.',
    body: `<p>A sandbox’s effective policy is its own policies, clipped by the org ceiling. A grant the ceiling does not cover is not an error. It is <b>drift</b>: saved, shown, and not enforced. Denies always stand.</p>
      <p>A write goes to <b style="color:${C.kube}">PostgreSQL</b>, which fires <code>pg_notify</code>. Every server replica <code>LISTEN</code>s, waits 250 ms for more changes, rebuilds each connected sandbox’s payload, and sends a new <b>policy frame</b> down its control channel. The supervisor swaps the rules without a restart.</p>
      <p>The <b class="c-rd">emergency halt</b> is org-wide: new egress and inference are refused, and every sandbox gets a deny-all policy. Nothing is destroyed.</p>`,
    acts: () => [
      [`${S.rules.find(r => r.pattern === 'api.github.com').on ? '−' : '+'} project: api.github.com`, '', () => toggleRule('api.github.com'), C.green],
      [`${S.ceiling['pastebin.com'] ? '−' : '+'} ceiling: pastebin.com`, '', () => toggleCeiling('pastebin.com'), C.kube],
      ['<code>curl pastebin.com</code>', '', () => request('paste'), C.amber],
      ['<code>curl api.github.com</code>', '', () => request('github'), C.amber],
      [S.halted ? 'lift the halt' : 'emergency halt', '', toggleHalt, S.halted ? C.green : C.red],
    ]},
  {id: 'credentials', title: 'Credentials: placeholders only', color: C.gold, cam: [V(-6, 20, 38), V(-9, 3, -1)],
    labels: ['vault', 'nexus', 'pipe-ctl', 'gate', 'workload', 'dest-slack'],
    lede: 'OpenClaw holds a <b>placeholder</b>. The real Slack token lives encrypted in the platform, travels only to the supervisor, and is swapped in on the wire, for the one domain it belongs to.',
    body: `<p>A credential is <b>stored</b> write-only in the project. It does nothing until a policy <b>references</b> it with an <code>envVarKey</code>. Then the next policy frame carries its value to the supervisor, and the agent’s env gets <code>SLACK_BOT_TOKEN=__lens_cred:…__</code>.</p>
      <p>When the agent calls <b>slack.com</b>, the proxy <b>terminates TLS</b> with a certificate from the platform’s proxy CA, which the supervisor added to the trust bundle at boot. It puts the real value in the <code>Authorization</code> header, re-encrypts, and forwards. Other hosts never see it.</p>
      <p>The supervisor is root and <b>non-dumpable</b>, so the agent (uid 1000) cannot read its memory. AWS keys work the same way, but the proxy re-signs SigV4. Kubeconfigs carry a placeholder that becomes a 15-minute JWT.</p>`,
    acts: () => [
      [S.cred.stored ? '✓ stored' : '1 · store slack-bot-token', S.cred.stored ? '' : 'pri', storeCred, C.gold],
      [S.cred.referenced ? '2 · un-reference it' : '2 · reference it in the policy', S.cred.stored && !S.cred.referenced ? 'pri' : '', referenceCred, C.gold],
      ['<code>echo $SLACK_BOT_TOKEN</code>', '', echoToken, C.gold],
      ['post to Slack', S.live.cred ? 'pri' : '', () => request('slack', {cmd: 'openclaw → slack.com chat.postMessage'}), C.green],
      ['read the supervisor’s env', '', peekSupervisor, C.red],
    ]},
  {id: 'inference', title: 'Inference: the metered road', color: C.pink, cam: [V(4, 30, 44), V(-2, 6, -8)],
    labels: ['llmproxy', 'fwdproxy', 'prov-*', 'workload', 'pipe-https'],
    lede: 'OpenClaw thinks it talks to Anthropic. Its base URL is the platform’s <b>LLM proxy</b>, which checks the policy and the budget, masks PII, calls the provider with the platform’s own key, and <b>meters</b> every call.',
    body: `<p>The policy’s <code>managedInference</code> picks the backend, for example <b>bedrock</b> or <b>openrouter</b>. The sandbox gets <code>ANTHROPIC_BASE_URL</code> pointing at <code>/v1/projects/acme/llm/&lt;backend&gt;</code>, a placeholder bearer, and the inert key <code>nexus-managed</code>. No provider key ever enters the Pod.</p>
      <p>The proxy refuses in order: org halted (<b class="c-rd">403</b>), not enabled by policy (<b class="c-rd">403</b>), over budget (<b class="c-rd">429</b> with <code>Retry-After</code>). When the policy has <code>piiMasking</code>, <b>rehydra</b> swaps names, emails, card numbers and secrets for typed tags like <code>&lt;PII type="EMAIL" id="e2"/&gt;</code> before the request leaves, and swaps them back in the answer. The provider never sees the values, and the audit record keeps only counts by type. If masking fails, the call is refused, unless the policy sets <code>failOpen</code>.</p>
      <p>Budgets exist per org, project, user and sandbox. A sandbox token cannot raise its own. Calling the provider directly is simply not in the policy, so only the metered road is open.</p>`,
    acts: () => [
      ['ask the model', 'pri', () => askModel(), C.pink],
      ['ask with PII in the prompt', '', () => askModel({prompt: PII.prompt}), C.pink],
      [S.inf.limit === 0 ? 'budget back to $5/day' : 'set the budget to $0', '', () => { S.inf.limit = S.inf.limit === 0 ? 500 : 0; if (S.inf.limit) S.inf.used = Math.min(S.inf.used, 100); log('rest-api', `<b>PUT</b> spending-limit sandbox ${SLUG} <u>· $${(S.inf.limit / 100).toFixed(2)}/day</u>`); refresh(); }, C.amber],
      [S.inf.enabled ? 'disable managedInference' : 'enable managedInference', '', () => { S.inf.enabled = !S.inf.enabled; pushPolicy(`managedInference.enabled: ${S.inf.enabled}`); }, C.red],
      ['call Bedrock directly', '', directProvider, C.red],
    ]},
  {id: 'mcp', title: 'MCP gateway: attach upstreams', color: C.amber, cam: [V(-8, 30, 44), V(-6, 3, -8)],
    labels: ['mcpgw', 'mcpup-*', 'admin', 'desktop', 'relay', 'firewall', 'privsvc', 'pipe-tunnel', 'vault'],
    lede: 'Each project has one <b>MCP gateway</b>. An admin attaches MCP servers to it as <b>upstreams</b>. Agents and people then see one catalog of tools, filtered by policy, and <b>no caller ever holds an upstream’s credential</b>.',
    body: `<p>An upstream is a <b>connector</b>: a name, a URL (Streamable HTTP or SSE) and optional credentials. Add it in the Admin UI (<b>Add MCP Upstream</b>) or with <code>nexusctl connector create</code>. The gateway lists its tools, stores them and names them <code>&lt;upstream&gt;__&lt;tool&gt;</code>.</p>
      <p>An upstream that needs <b>OAuth</b> waits as <i>awaiting auth</i> until someone signs in. The platform runs the login in a popup, keeps the tokens encrypted on that person’s <b>grant</b>, and refreshes them itself. Static headers and client credentials work too.</p>
      <p>An upstream in a <b>private network</b> gets a <b>cluster</b>. The gateway then reaches it through that cluster’s <b class="c-cy">relay</b>, which dialed <b>out</b> through the firewall. Nobody opens an inbound port.</p>
      <p>Each caller sees only the tools its policy’s <code>allowedTools</code> lists. A hidden tool is never registered, so a call gets <code>-32601 Method not found</code>, exactly like a missing one. OpenClaw reaches the gateway through <code>/.lens/nexus-mcp</code>. MCP clients on your laptop sign in with OAuth or an API token. Every call is an audit record with source <code>mcp-tool</code>.</p>`,
    acts: () => [
      S.ups.atlassian === 'none' ? ['1 · add upstream Atlassian', 'pri', () => addUpstream('atlassian'), C.amber]
        : S.ups.atlassian === 'pending' ? ['2 · authorize (OAuth login)', 'pri', () => authorizeUpstream('atlassian'), C.gold]
        : ['OpenClaw → atlassian__searchJiraIssuesUsingJql', 'pri', () => callTool('sandbox', 'atlassian__searchJiraIssuesUsingJql'), C.amber],
      S.ups.incidents === 'ready' ? ['MCP client → incidents__listIncidents', '', () => callTool('desktop', 'incidents__listIncidents'), C.ice]
        : ['add incidents.internal via cluster prod', '', () => { S.ups.incidents = 'none'; return addUpstream('incidents'); }, C.ice],
      ['OpenClaw → atlassian__createJiraIssue', '', () => callTool('sandbox', 'atlassian__createJiraIssue'), C.red],
      [S.relay.up ? 'stop the relay' : 'start the relay', '', toggleRelay, S.relay.up ? C.red : C.green],
    ]},
  {id: 'rbac', title: 'Identity, RBAC and audit', color: C.cyan, cam: [V(-24, 22, 40), V(-26, 2.5, 3)],
    labels: ['admin', 'cli', 'nexus', 'pg', 'desktop', 'browser'],
    lede: 'People, API tokens and sandboxes are all <b>principals</b>, with roles scoped from org to team to project. And every request the platform mediates lands in one <b>audit trail</b>.',
    body: `<p>People sign in with <b>Lens ID</b> (OIDC). Desktop tools and CI use <b>API tokens</b>. A sandbox authenticates with its own <b>sandbox token</b>, so the platform can tell the agent from the person who started it. Org, team and project roles are <code>ADMIN</code> or <code>MEMBER</code>. Teams hold people and agents and grant project access.</p>
      <p>Some things need a person: <code>nexusctl sandbox exec</code> needs project ADMIN, and a sandbox token cannot lift its own spending cap.</p>
      <p>The audit trail records every mediated request with its <b>source</b>: <code>rest-api</code>, <code>mcp-tool</code>, <code>sandbox-proxy</code>, <code>llm-proxy</code>, <code>k8s-proxy</code>, <code>forward-proxy</code>. It is queryable in the Admin UI and over MCP (<code>query_audit_trail</code>). Filter it on the right.</p>`,
    acts: () => [
      ['<code>nexusctl sandbox exec</code>', '', execShell, C.cyan],
      ['sandbox raises its own budget', '', raiseOwnCap, C.red],
      ['open the Control UI', '', () => openUI(), C.pink],
      ['open the audit trail', '', () => toggleAudit(true), C.cyan],
    ]},
];
CH.forEach((c, i) => c.n = String(i + 1).padStart(2, '0'));
let current = CH[0];

// ─────────────────────────────────────────────────────────────── UI rendering
const rp = $('#rp');
function refreshPanel() {
  const f = PANELS[current.id];
  const scrolls = [...rp.querySelectorAll('.scroll')].map(s => s.scrollTop);
  rp.innerHTML = f();
  rp.querySelectorAll('.scroll').forEach((s, i) => s.scrollTop = scrolls[i] || 0);
  rp.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { overviewOpen = b.dataset.open === '1'; refreshPanel(); });
  rp.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { overviewTab = b.dataset.tab; refreshPanel(); });
  rp.querySelectorAll('[data-ch]').forEach(l => { l.style.cursor = 'pointer'; l.onclick = () => go(CH.findIndex(c => c.id === l.dataset.ch)); });
  rp.querySelectorAll('[data-part]').forEach(r => {
    r.onmouseenter = () => hilite(r.dataset.part, true);
    r.onmouseleave = () => hilite(r.dataset.part, false);
  });
  const act = fn => () => { stopTour(); beginDemo(); Promise.resolve(fn()).finally(endDemo); };
  rp.querySelectorAll('[data-rule]').forEach(b => b.onclick = act(() => toggleRule(b.dataset.rule)));
  rp.querySelectorAll('[data-ceil]').forEach(b => b.onclick = act(() => toggleCeiling(b.dataset.ceil)));
  rp.querySelectorAll('[data-tr]').forEach(b => b.onclick = act(() => setTransport(b.dataset.tr)));
  rp.querySelectorAll('[data-prov]').forEach(b => b.onclick = act(() => { S.inf.provider = b.dataset.prov; return pushPolicy(`managedInference.provider: ${S.inf.provider}`); }));
  rp.querySelectorAll('[data-pii]').forEach(b => b.onclick = act(togglePii));
  rp.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => toggleTool(b.dataset.tool));
  rp.querySelectorAll('[data-who]').forEach(b => b.onclick = () => { S.who = b.dataset.who; refreshPanel(); });
  rp.querySelectorAll('[data-src]').forEach(b => b.onclick = () => { auditFilter = b.dataset.src; refreshPanel(); });
  const al = rp.querySelector('.audit-list');
  if (al && current.id === 'rbac') audit.filter(e => auditFilter === 'all' || e.src === auditFilter).slice(0, 40).forEach(e => al.appendChild(auditRow(e)));
  const t = $('#term'); if (t) t.scrollTop = 1e6;
}
function refreshActs() {
  const box = $('#c-acts');
  box.innerHTML = '';
  current.acts().forEach(([html, cls, fn, color]) => {
    const b = document.createElement('button');
    b.className = 'btn ' + cls;
    b.innerHTML = (color ? `<span class="dot" style="--c:${color}"></span>` : '') + html;
    b.onclick = () => { stopTour(); beginDemo(); Promise.resolve(fn()).finally(() => { endDemo(); refreshActs(); }); setTimeout(refreshActs, 50); };
    box.appendChild(b);
  });
}
function beaconColor(d, k) {
  const v = evaluate(d.host);
  return col(VCOL[v.verdict], 2.4 + (d.flash || 0) * 3);
}
function refreshWorld() {
  for (const d of Object.values(DEST)) {
    const v = evaluate(d.host);
    d.beacon.material.color.copy(beaconColor(d));
    d.label.set(d.host, `${v.verdict} · ${v.clipped ? 'clipped by org' : v.src === 'default' ? 'no rule' : v.src === 'halt' ? 'halt' : v.rule?.pattern === d.host ? (v.rule.transport === 'upstream' && v.verdict === 'allow' ? 'upstream' : 'policy') : 'policy'}`);
    d.label.el.style.setProperty('--c', VCOL[v.verdict]);
  }
  for (const d of Object.values(PROV)) d.beacon.material.color.copy(col(S.inf.provider === d.host.toLowerCase().replace('amazon ', '') ? C.pink : C.grey, 2.2 + (d.flash || 0) * 3));
  for (const [k, d] of Object.entries(MCPUP)) {
    d.beacon.material.color.copy(col({ready: C.amber, pending: C.gold, error: C.red, none: C.grey}[S.ups[k]], 2.2 + (d.flash || 0) * 3));
    d.label.set(d.host, S.ups[k] === 'ready' ? 'upstream · ready' : S.ups[k] === 'pending' ? 'upstream · awaiting auth' : 'not attached');
  }
}
function refresh() { refreshWorld(); refreshPanel(); refreshActs(); }

function hilite(key, on) {
  const p = parts[key];
  if (!p) return;
  p.labels.forEach(L => { L.el.classList.toggle('hot', on); if (on) L.el.classList.remove('off'); else applyLabels(); });
  p.hot = on;
}

// ─────────────────────────────────────────────────────────────── chapter navigation, camera
const steps = $('#steps');
CH.forEach((c, i) => {
  const b = document.createElement('button');
  b.className = 'step';
  b.style.setProperty('--c', c.color);
  b.innerHTML = `<span class="n">${c.n}</span><span class="t">${c.title.split(':')[0]}</span>`;
  b.title = c.title + ` (${i + 1})`;
  b.onclick = () => { stopTour(); go(i); };
  steps.appendChild(b);
});
let camTween = null;
const corners = box => [box.min.x, box.max.x].flatMap(x => [box.min.y, box.max.y].flatMap(y => [box.min.z, box.max.z].map(z => V(x, y, z))));
const scenePts = () => [cpGroup, clusterGroup, privGroup, desktop, cli, browser, admin, ...[DEST, PROV, MCPUP].flatMap(o => Object.values(o).map(d => d.group))]
  .flatMap(o => corners(new THREE.Box3().setFromObject(o)));
const VMBOX = [V(-VM.w / 2, VM.floor, -VM.d / 2), V(VM.w / 2, VM.top, VM.d / 2)];
const CHAPTER_FIT = {
  boot: () => [cli, nexus, apiserver, pv, ...VMBOX],
  ingress: () => [browser, mods.ingress, nexus, ...VMBOX],
  network: () => [...VMBOX, egress, mods.fwdproxy, ...Object.values(DEST).map(d => d.group)],
  policy: () => [admin, pg, nexus, ...VMBOX],
  credentials: () => [mods.vault, nexus, ...VMBOX, DEST.slack.group],
  inference: () => [mods.llmproxy, ...VMBOX, ...Object.values(PROV).map(d => d.group), V(-4, 17, -12)],
  mcp: () => [admin, desktop, mods.mcpgw, relay, privSvc, firewall, MCPUP.atlassian.group, V(-6, 20, -10)],
  rbac: () => [admin, cli, nexus, pg, desktop, browser],
};
function camFor(c) {
  const [p, t] = c.cam;
  const pts = c.id === 'overview' ? scenePts() : ptsOf(CHAPTER_FIT[c.id]());
  const ctr = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
  return frameAll(pts, p.clone().sub(t).normalize(), ctr, {panel: c.id !== 'overview'});
}
// Nearest camera distance at which every point projects into the screen area the cards leave free,
// then a sideways shift that centres the points in that area.
const probe = new THREE.PerspectiveCamera();
function frameAll(pts, dir, ctr, {panel = false} = {}) {
  const wide = innerWidth >= 900 && !touring;
  const free = {x0: wide ? 800 / innerWidth - 1 : -0.94, x1: wide && panel ? 1 - 800 / innerWidth : 0.93, y0: -0.8, y1: 0.62};
  probe.fov = camera.fov; probe.aspect = camera.aspect; probe.near = camera.near; probe.far = camera.far;
  probe.updateProjectionMatrix();
  const extent = (tgt, d) => {
    probe.position.copy(tgt).addScaledVector(dir, d);
    probe.lookAt(tgt);
    probe.updateMatrixWorld();
    const e = {x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity};
    for (const p of pts) {
      const v = p.clone().project(probe);
      e.x0 = Math.min(e.x0, v.x); e.x1 = Math.max(e.x1, v.x); e.y0 = Math.min(e.y0, v.y); e.y1 = Math.max(e.y1, v.y);
    }
    return e;
  };
  const fits = e => e.x1 - e.x0 <= free.x1 - free.x0 && e.y1 - e.y0 <= free.y1 - free.y0;
  // Perspective makes each shift a little off, so fit and shift a few times.
  const tgt = ctr.clone();
  let d = 0;
  for (let pass = 0; pass < 4; pass++) {
    let lo = 10, hi = camera.far * 0.6;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; fits(extent(tgt, mid)) ? hi = mid : lo = mid; }
    d = hi;
    const e = extent(tgt, d);
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * d, halfW = halfH * camera.aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 1);
    tgt.addScaledVector(right, ((e.x0 + e.x1) - (free.x0 + free.x1)) / 2 * halfW)
      .addScaledVector(up, ((e.y0 + e.y1) - (free.y0 + free.y1)) / 2 * halfH);
  }
  return [tgt.clone().addScaledVector(dir, d), tgt];
}
function flyTo(pos, tgt, dur = 1.7) {
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  const id = {};
  camTween = id;
  return tween(dur, k => {
    if (camTween !== id) return;
    camera.position.lerpVectors(p0, pos, k);
    controls.target.lerpVectors(t0, tgt, k);
    camera.position.y += Math.sin(k * Math.PI) * p0.distanceTo(pos) * 0.08;
  }, easeIO);
}
controls.addEventListener('start', () => { camTween = null; });

// Demo focus: while a demo runs, labels fade and the camera frames only the parts involved.
let demoN = 0, demoT;
// Groups such as the control plane sit at the origin with children in world space, so frame what they contain.
const ptsOf = list => list.flatMap(p => p.isVector3 ? [p.clone()] : corners(new THREE.Box3().setFromObject(p)));
function beginDemo() { demoN++; clearTimeout(demoT); $('#labels').classList.add('demo'); }
function endDemo() {
  demoN = Math.max(0, demoN - 1);
  if (demoN) return;
  clearTimeout(demoT);
  demoT = setTimeout(() => { if (demoN || touring) return; $('#labels').classList.remove('demo'); flyTo(...camFor(current), 1.4); }, 2200);
}
function stage(pts, minR = 2.6) {
  if (!demoN && !touring) return;
  const P = ptsOf(pts);
  const c = new THREE.Box3().setFromPoints(P).getCenter(new THREE.Vector3());
  const k = minR * 0.7;
  P.push(...[V(k, 0, 0), V(-k, 0, 0), V(0, k, 0), V(0, -k, 0), V(0, 0, k), V(0, 0, -k)].map(o => o.add(c)));
  const [cp, ct] = camFor(current);
  flyTo(...frameAll(P, cp.clone().sub(ct).normalize(), c, {panel: true}), 1.1);
}
const VMFOCUS = () => [core.position.clone().add(V(-1.3, 1.4, 0.6)), GATE.clone().add(V(0, 3.6, 0)), NIC.clone().add(V(0.6, -1.2, 0)), UPLINK.clone()];
let labelsOn = true;
function applyLabels() {
  const want = current.labels;
  const show = key => want.some(w => w.endsWith('*') ? key.startsWith(w.slice(0, -1)) : w === key);
  allLabels.forEach(L => {
    let vis = L.part ? show(L.part) : (current.id === 'overview' || current.id === 'network');
    if (!labelsOn) vis = false;
    L.el.classList.toggle('off', !vis);
    L.el.classList.toggle('hot', !!(L.part && parts[L.part]?.hot));
  });
}
function go(i, {fly = true} = {}) {
  i = (i + CH.length) % CH.length;
  current = CH[i];
  S.seen.add(current.id);
  document.documentElement.style.setProperty('--acc', current.color);
  $('#c-no').textContent = current.n;
  $('#c-title').textContent = current.title;
  $('#c-lede').innerHTML = current.lede;
  $('#c-body').innerHTML = current.body;
  $('#c-body').scrollTop = 0;
  steps.querySelectorAll('.step').forEach((b, j) => { b.classList.toggle('on', j === i); b.classList.toggle('seen', S.seen.has(CH[j].id)); });
  if (fly) flyTo(...camFor(current));
  applyLabels();
  refresh();
  try { history.replaceState(null, '', '#' + current.id); } catch (e) {}
}

// ─────────────────────────────────────────────────────────────── tour: a paced script, one caption at a time
let touring = false, tourId = 0, tourSkip = false;
const towers = () => Object.values(DEST).map(d => d.pos.clone().add(V(0, d.h + 0.6, 0)));
const BOOT_TOUR = [
  ['Create', 'You ask for a sandbox with [[nexusctl|cli]]. The [[platform server|nexus]] records it and its first revision.', () => [cli, nexus], 4],
  ['Pod', 'The server’s reconciler writes a Pod to the cluster’s [[API server|apiserver]], asking for the Kata runtime.', () => [nexus, apiserver], 4],
  ['Node', 'The scheduler puts it on [[node-a|node-a]], a machine that can run microVMs.', () => [apiserver, nodes.a], 3.5],
  ['microVM', 'Kata boots a [[small VM|pedestal]] with [[its own kernel|kernel]], separate from the node and its neighbours.', () => VMBOX, 4.5],
  ['Files', 'OpenClaw’s [[image|image2]] is mounted read-only, and its [[persistent volume|pv]] appears at /data.', () => [pv, ...VMBOX], 4.5],
  ['Tools', 'A first [[init container|seed]] copies the sandbox tools into /.lens.', () => [procs.seed, ...VMBOX], 3.5],
  ['User', 'A second [[init container|discover]] notes which user the image wants to run as.', () => [procs.discover, ...VMBOX], 3.5],
  ['Guard', 'The [[supervisor|supervisor]] starts first, as root, and switches on the [[gate|gate]]. Nothing gets out unchecked.', () => [ring, gate, GATE_KEY_POS], 4],
  ['Rules', 'It [[dials out|uplink]] to the platform and receives its rules: the policy frame.', () => [nexus, ...VMBOX], 4],
  ['Start', 'Finally [[OpenClaw|workload]] starts, as an ordinary user, and fetches a plugin through the gate.', () => [core, gate, egress], 3.5],
];
const TOUR = [
  {ch: 'overview', say: 'This is Lens Agents: a platform that runs AI agents on your own infrastructure, each one in its own governed sandbox.', hold: 5},
  {ch: 'overview', say: 'This is a Lens Agents installation. On the left is its [[control plane|cp]]: the brain that decides and records.', focus: () => [cpGroup], r: 9},
  {ch: 'overview', say: 'In the middle is [[your Kubernetes cluster|cluster]]. Every [[small glass box|pod-0]] on it is one agent’s sandbox.', focus: () => [clusterGroup], r: 12},
  {ch: 'overview', say: 'We open [[one sandbox|shell]]. Inside lives [[OpenClaw|workload]], an AI agent we want to keep contained.', focus: () => VMBOX, r: 5},
  {ch: 'overview', say: 'The [[boundary proxy|gate]] is the only door out. Every connection is checked there.', focus: () => [gate, nic, core], r: 4},
  {ch: 'overview', say: 'Watch OpenClaw try a site that is on the block list.', run: () => request('evil'), hold: 2},
  {ch: 'boot', say: 'Now let’s watch a sandbox start, one step at a time.', focus: () => [cli, nexus, apiserver, ...VMBOX], hold: 3.5},
  {ch: 'boot', boot: true},
  {ch: 'ingress', say: 'OpenClaw has a web page, but its [[port|p-port]] only listens inside the box.', focus: () => [plates['p-port'], core], r: 3},
  {ch: 'ingress', say: 'You open it in your [[browser|browser]]. After you sign in, the platform carries the page through a [[tunnel the sandbox opened|pipe-data]].', run: () => openUI()},
  {ch: 'ingress', say: 'Trying to connect to the box directly goes nowhere.', run: directToPod},
  {ch: 'network', say: 'OpenClaw downloads a package from [[npm|dest-npm]], which the policy allows.', run: () => request('npm', {cmd: 'npm view openclaw'})},
  {ch: 'network', say: 'Even trying to sneak around the [[gate|gate]] does not work.', run: bypass},
  {ch: 'policy', say: 'An admin allows [[GitHub|dest-github]] in the project policy. The change reaches the running box in a moment.', run: () => toggleRule('api.github.com'), hold: 2},
  {ch: 'policy', say: 'The project also allows [[pastebin|dest-paste]], but the organization’s ceiling does not, so it stays blocked.', run: () => request('paste'), hold: 2},
  {ch: 'credentials', say: 'The Slack token is kept in the platform’s [[safe|vault]]. Once the policy names it, only the [[gate|gate]] receives it.', run: referenceCred},
  {ch: 'credentials', say: 'OpenClaw sends a fake token, and the gate swaps in the real one on the way to [[Slack|dest-slack]].', run: () => request('slack', {cmd: 'openclaw → slack.com chat.postMessage'})},
  {ch: 'inference', say: 'When OpenClaw asks its model, the call goes to the platform’s [[LLM proxy|llmproxy]], which pays for it and keeps count.', run: () => askModel()},
  {ch: 'mcp', say: 'An admin attaches [[Atlassian’s MCP server|mcpup-atlassian]] to the project’s [[MCP gateway|mcpgw]] and signs in once.', run: async () => { await addUpstream('atlassian'); await authorizeUpstream('atlassian'); }},
  {ch: 'mcp', say: 'Now OpenClaw can use its tools. The gateway makes the call, so the token never enters the box.', run: () => callTool('sandbox', 'atlassian__searchJiraIssuesUsingJql')},
  {ch: 'rbac', say: 'Everything you just watched was written to the [[audit trail|admin]], with who did it.', run: () => toggleAudit(true), hold: 5},
  {ch: 'overview', say: 'That’s Lens Agents: [[a box per agent|shell]], [[one door out|gate]], secrets kept in [[the platform|vault]], and a record of it all.', hold: 6},
];
const capEl = $('#cap');
const PIN_ANCHOR = {
  gate: () => V(GATE.x - 1.4, SURF + 5.2, GATE.z),
  workload: () => core.position.clone().add(V(-1.25, 0.65, 0.2)),
  kernel: () => V(VM.w / 2 - 0.9, VM.floor + 0.25, VM.d / 2 - 0.2),
  image2: () => V(-VM.w / 2 + 0.7, VM.floor + 0.75, VM.d / 2 - 0.2),
};
const refObj = k => parts[k]?.obj;
const BR_PTS = (() => {
  const p = [], k = 0.28;
  for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
    const c = V(sx, sy, sz);
    p.push(c, V(sx - Math.sign(sx) * k, sy, sz), c, V(sx, sy - Math.sign(sy) * k, sz), c, V(sx, sy, sz - Math.sign(sz) * k));
  }
  return p;
})();
const BR_GEO = new THREE.BufferGeometry().setFromPoints(BR_PTS);
let pins = [];
function clearPins() {
  pins.forEach(p => { scene.remove(p.o); p.el.remove(); if (p.br) scene.remove(p.br); });
  pins = [];
}
function parseRefs(html) {
  const refs = [];
  const out = html.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (m, t, k) => {
    let n = refs.findIndex(r => r.k === k);
    if (n < 0) { refs.push({k, t}); n = refs.length - 1; }
    return `<span class="ref" data-i="${n}"><i>${n + 1}</i>${t}</span>`;
  });
  return {out, refs};
}
function showPins(refs) {
  clearPins();
  refs.forEach((r, i) => {
    const keys = r.k.endsWith('*') ? Object.keys(parts).filter(k => k.startsWith(r.k.slice(0, -1))) : [r.k];
    keys.forEach((k, j) => {
      const obj = refObj(k);
      if (!obj) return;
      const el = document.createElement('div');
      el.className = 'pin';
      el.innerHTML = `<span><i>${i + 1}</i>${j === 0 ? r.t : ''}</span>`;
      const o = new CSS2DObject(el);
      o.center.set(0, 1);
      o.visible = false;
      scene.add(o);
      const big = ['cp', 'cluster', 'priv'].includes(k);
      let br = null;
      if (!big && !k.startsWith('pipe-')) {
        br = new THREE.LineSegments(BR_GEO, new THREE.LineBasicMaterial({color: col('#ffffff', 2.2), toneMapped: false, transparent: true, opacity: 0, depthWrite: false}));
        br.renderOrder = 20;
        scene.add(br);
      }
      pins.push({k, obj, o, el, br, i, at: time.value + 0.35 + i * 0.75});
    });
  });
}
const _box = new THREE.Box3(), _c = new THREE.Vector3(), _sz = new THREE.Vector3();
function updatePins(t) {
  for (const p of pins) {
    let shown = t >= p.at;
    for (let n = p.obj; n && shown; n = n.parent) if (!n.visible || n.scale.x < 0.3) shown = false;
    p.o.visible = shown;
    if (p.br) p.br.visible = shown;
    if (!shown) continue;
    if (!p.lit) { p.lit = true; p.el.classList.add('on'); capEl.querySelector(`.ref[data-i="${p.i}"]`)?.classList.add('lit'); }
    _box.setFromObject(p.obj);
    _box.getCenter(_c); _box.getSize(_sz);
    p.o.position.copy(PIN_ANCHOR[p.k]?.() || (p.k.startsWith('pipe-') ? p.obj.children[1].geometry.parameters.path.getPointAt(0.5) : V(_c.x, _box.max.y + 0.12, _c.z)));
    if (p.br) {
      p.br.position.copy(_c);
      p.br.scale.set(Math.max(_sz.x, 0.3) + 0.3, Math.max(_sz.y, 0.3) + 0.3, Math.max(_sz.z, 0.3) + 0.3);
      p.br.material.opacity = Math.min(1, (t - p.at) * 3) * (0.75 + Math.sin(t * 4) * 0.25);
    }
  }
}
function caption(kicker, html, i, n) {
  const {out, refs} = parseRefs(html);
  $('#cap-k').textContent = kicker;
  $('#cap-t').innerHTML = out;
  $('#cap-p').textContent = n ? `${i + 1} / ${n}` : '';
  capEl.classList.remove('in'); void capEl.offsetWidth; capEl.classList.add('in');
  showPins(refs);
  capEl.querySelectorAll('.ref').forEach(r => {
    r.onmouseenter = () => pins.filter(p => p.i === +r.dataset.i).forEach(p => p.el.classList.add('hot'));
    r.onmouseleave = () => pins.forEach(p => p.el.classList.remove('hot'));
  });
}
const readTime = html => clamp(html.replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, '$1').replace(/<[^>]+>/g, '').split(/\s+/).length / 2.4 + 1, 4.5, 9);
async function hold(sec, id) {
  tourSkip = false;
  const bar = $('#cap-bar');
  for (let t = 0; t < sec; t += 0.1) {
    if (!touring || id !== tourId || tourSkip) break;
    bar.style.transform = `scaleX(${t / sec})`;
    await sleep(0.1);
  }
  bar.style.transform = 'scaleX(1)';
}
function frameOn(pts, minR) { const d = demoN; demoN = Math.max(demoN, 1); stage(pts, minR); demoN = d; }
async function startTour(from = 0) {
  if (touring) return;
  touring = true;
  const id = ++tourId;
  $('#app').classList.add('touring');
  $('#tour').classList.add('on');
  viewOffset();
  capEl.hidden = false;
  speed = 0.8;
  for (let i = from; i < TOUR.length; i++) {
    if (!touring || id !== tourId) return;
    const b = TOUR[i];
    const ci = CH.findIndex(c => c.id === b.ch);
    if (CH[ci] !== current) { go(ci, {fly: !b.focus && !b.run && !b.boot}); await sleep(0.6); }
    const kick = `${current.n} · ${current.title.split(':')[0]}`;
    $('#labels').classList.add('demo');
    if (b.boot) {
      let shownAt = null, need = 0;
      const pace = async k => {
        if (shownAt !== null) await hold(Math.max(1.2, need - (time.value - shownAt)), id);
        if (k >= BOOT_TOUR.length || !touring || id !== tourId) return;
        const [name, text, pts, r] = BOOT_TOUR[k];
        caption(`${kick} · step ${k + 1} of ${BOOT_TOUR.length} · ${name}`, text, i, TOUR.length);
        frameOn(pts(), r);
        shownAt = time.value; need = readTime(text) + 0.8;
      };
      if (S.vm === 'started') { await stopVm(); await deleteVm(); }
      else if (S.vm === 'stopped') await deleteVm();
      pvFill.scale.setScalar(1); S.dataN = 2;
      await boot({pace});
      continue;
    }
    caption(kick, b.say, i, TOUR.length);
    if (b.focus) frameOn(b.focus(), b.r);
    else if (!b.run) flyTo(...camFor(current), 1.6);
    if (b.run) { beginDemo(); await Promise.race([b.run(), sleep(24)]); endDemo(); }
    await hold(b.hold ?? readTime(b.say), id);
  }
  if (id === tourId) stopTour();
}
function viewOffset() {
  const w = innerWidth, h = innerHeight;
  if (w < 900) camera.setViewOffset(w, h, 0, touring ? h * 0.13 : -h * 0.2, w, h);
  else if (touring) camera.setViewOffset(w, h, 0, h * 0.11, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', () => setTimeout(viewOffset, 0));
function stopTour() {
  if (!touring) return;
  touring = false; tourId++;
  viewOffset();
  speed = 1;
  $('#app').classList.remove('touring');
  $('#tour').classList.remove('on');
  capEl.hidden = true;
  clearPins();
  $('#labels').classList.remove('demo');
  flyTo(...camFor(current), 1.4);
}
$('#cap-next').onclick = () => { tourSkip = true; };
$('#cap-pause').onclick = () => { paused = !paused; $('#cap-pause').textContent = paused ? 'Resume' : 'Pause'; };
$('#cap-exit').onclick = () => { paused = false; $('#cap-pause').textContent = 'Pause'; stopTour(); };

// ─────────────────────────────────────────────────────────────── hover, click
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tip = $('#tip');
let hoverKey = null, downAt = null;
function isShown(o) { for (let n = o; n; n = n.parent) { if (!n.visible) return false; if (n.scale.x < 0.01) return false; } return true; }
renderer.domElement.addEventListener('pointermove', e => {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const h = ray.intersectObjects(pickables, false).find(h => isShown(h.object) && h.object.userData.part);
  const key = h ? h.object.userData.part : null;
  if (key !== hoverKey) {
    if (hoverKey) hilite(hoverKey, false);
    hoverKey = key;
    if (key) hilite(key, true);
  }
  if (key) {
    const info = parts[key];
    tip.innerHTML = `<i>${info.kicker || ''}</i><b>${info.title}</b>${info.text || ''}`;
    tip.style.setProperty('--c', info.color || C.cyan);
    tip.style.left = Math.min(e.clientX + 16, innerWidth - 300) + 'px';
    tip.style.top = Math.min(e.clientY + 14, innerHeight - 180) + 'px';
    tip.classList.add('on');
    renderer.domElement.style.cursor = 'pointer';
  } else { tip.classList.remove('on'); renderer.domElement.style.cursor = ''; }
});
renderer.domElement.addEventListener('pointerleave', () => tip.classList.remove('on'));
renderer.domElement.addEventListener('pointerdown', e => downAt = [e.clientX, e.clientY]);
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || !hoverKey) return;
  stopTour();
  const i = CH.findIndex(c => c.id === parts[hoverKey].chapter);
  if (i >= 0 && CH[i] !== current) go(i);
});
document.getElementById('labels').addEventListener('click', e => {
  const el = e.target.closest('.lb');
  if (!el) return;
  const L = allLabels.find(l => l.el === el);
  if (!L || !L.part) return;
  const i = CH.findIndex(c => c.id === parts[L.part]?.chapter);
  stopTour();
  if (i >= 0) go(i);
});

// ─────────────────────────────────────────────────────────────── controls, keys
$('#prev').onclick = () => { stopTour(); go(CH.indexOf(current) - 1); };
$('#next').onclick = () => { stopTour(); go(CH.indexOf(current) + 1); };
$('#tour').onclick = () => touring ? stopTour() : startTour();
$('#lbltog').onclick = () => { labelsOn = !labelsOn; $('#lbltog').classList.toggle('on', labelsOn); applyLabels(); };
$('#tilt').onclick = () => { tiltH.enabled = tiltV.enabled = !tiltH.enabled; $('#tilt').classList.toggle('on', tiltH.enabled); hint(tiltH.enabled ? 'Miniature on: tilt-shift blur' : 'Miniature off'); };
$('#uitog').onclick = () => { $('#app').classList.toggle('ui-off'); $('#uitog').classList.toggle('on'); };
$('#help').onclick = () => $('#info').showModal();
$('#info-x').onclick = () => $('#info').close();
$('#info').addEventListener('click', e => { if (e.target === $('#info')) $('#info').close(); });
let hintT;
function hint(t) { const h = $('#hint'); h.textContent = t; h.classList.add('on'); clearTimeout(hintT); hintT = setTimeout(() => h.classList.remove('on'), 1800); }
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || $('#info').open) return;
  const k = e.key;
  if (k >= '1' && k <= '9') { stopTour(); go(+k - 1); }
  else if (k === 'ArrowRight') { stopTour(); go(CH.indexOf(current) + 1); }
  else if (k === 'ArrowLeft') { stopTour(); go(CH.indexOf(current) - 1); }
  else if (k === 't' || k === 'T') touring ? stopTour() : startTour();
  else if (k === 'Escape') stopTour();
  else if (k === 'l' || k === 'L') $('#lbltog').click();
  else if (k === 'm' || k === 'M') $('#tilt').click();
  else if (k === '/') { e.preventDefault(); $('#uitog').click(); }
  else if (k === '?') $('#info').showModal();
  else if (k === 'r' || k === 'R') flyTo(...camFor(current), 1.1);
  else if (k === ' ') { e.preventDefault(); paused = !paused; hint(paused ? 'Paused · Space to resume' : 'Resumed'); }
});

// ─────────────────────────────────────────────────────────────── the loop
let lastT = performance.now(), lastPing = 0;
function frame() {
  requestAnimationFrame(frame);
  const n = performance.now(), rawDt = Math.min((n - lastT) / 1000, 0.1);
  lastT = n;
  tick(paused ? 0 : rawDt * speed);
  render();
}
function tick(dt) {
  time.value += dt;
  const t = time.value;
  stepTweens(dt);
  controls.update();
  const alive = S.vm === 'started';
  ring.userData.t1.rotation.z += dt * (alive ? 0.6 : 0);
  ring.userData.t2.rotation.z -= dt * (alive ? 0.35 : 0);
  lobster.update(dt);
  updatePins(t);
  shellMat.uniforms.uK.value = lerp(shellMat.uniforms.uK.value, demoN ? 0.32 : 1, Math.min(1, dt * 3));
  coreLight.position.copy(core.position).add(V(0, 0.2, 0.4));
  if (!booting) nexus.userData.rings.forEach((r, i) => r.material.color.copy(col(S.halted ? C.red : C.cyan, 1.2 + 0.8 * Math.max(0, Math.sin(t * 2 - i * 0.8)))));
  nexus.userData.top.rotation.y = t * 0.8;
  apiserver.userData.wheel.rotation.z = t * 0.4;
  if (gateKey.visible) { gateKey.rotation.y = t * 1.3; gateKey.position.y = GATE_KEY_POS.y + Math.sin(t * 2) * 0.07; }
  gateCtl.update(dt, t);
  for (const p of Object.values(pipes)) {
    p.pulse *= Math.pow(0.2, dt);
    p.mat.uniforms.uA.value = p.pulse;
  }
  pipes.tunnel.mat.uniforms.uS.value = S.relay.up ? 1 : 0.15;
  if (alive && t - lastPing > 3.2) { lastPing = t; pipes.ctl.pulse = Math.max(pipes.ctl.pulse, 0.35); pipes.data.pulse = Math.max(pipes.data.pulse, 0.25); }
  if (S.relay.up && Math.floor(t * 10) % 40 === 0) pipes.tunnel.pulse = Math.max(pipes.tunnel.pulse, 0.3);
  for (const d of [...Object.values(DEST), ...Object.values(PROV), ...Object.values(MCPUP)]) {
    if (d.flash > 0) { d.flash = Math.max(0, d.flash - dt * 1.5); refreshWorld(); }
    d.beacon.scale.setScalar(1 + Math.sin(t * 2.4 + d.pos.z) * 0.08);
  }
  miniPods.forEach(m => {
    const u = m.userData;
    u.body.position.y = 0.55 + Math.abs(Math.sin(t * 1.6 + u.phase)) * 0.08;
    u.body.rotation.y = Math.sin(t * 0.7 + u.phase) * 0.5;
    u.flash = Math.max(0, (u.flash || 0) - dt * 0.8);
    u.mat.uniforms.uC.value.set(S.halted ? C.red : C.cyan).lerp(new THREE.Color(C.white), u.flash * 0.6);
  });
  packets.forEach(p => p.update(t));
}
function render() {
  for (const L of allLabels) {
    let n = L.o.parent, hidden = false;
    for (; n; n = n.parent) if (!n.visible || n.scale.x < 0.2) { hidden = true; break; }
    L.o.visible = !hidden;
  }
  composer.render();
  labelRenderer.render(scene, camera);
}

// ─────────────────────────────────────────────────────────────── start
addEventListener('resize', resize);
resize();
addTok('data'); addTok('data');
showKey(); gateKey.visible = false;
setBrowser('login');
camera.position.set(-40, 50, 80);
controls.target.set(0, 2, 0);
const start = Math.max(0, CH.findIndex(c => '#' + c.id === location.hash));
go(start);
frame();
window.__lab = {camera, controls, async advance(sec, step = 1 / 30) { for (let t = 0; t < sec; t += step) { tick(step); await new Promise(r => setTimeout(r, 0)); } render(); }, go, startTour, S, request, openUI, askModel, get current() { return current.id; }};
const deepLink = location.hash && location.hash !== '#overview';
requestAnimationFrame(() => setTimeout(() => {
  $('#loading').classList.add('done');
  if (deepLink) setTimeout(() => hint('Drag to orbit · hover anything · → next chapter'), 900);
  else setTimeout(() => startTour(), 900);
}, 350));
