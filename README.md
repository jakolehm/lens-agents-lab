# Lens Agents lab

An interactive 3D guide to how Lens Agents runs AI agents in governed sandboxes on Kubernetes. It follows one OpenClaw sandbox from `nexusctl sandbox create` to the audit trail.

It is plain HTML and ES modules with three.js from a CDN. There is no build step.

## Run it locally

ES modules do not load from `file://`, so serve the folder over HTTP:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. The guided tour starts by itself. To open one chapter directly, add its id to the URL, for example http://localhost:8000/#ingress.

## Chapters

| # | id | What it shows |
|---|----|---------------|
| 1 | `overview` | The control plane outside the cluster, a Kubernetes cluster of Kata microVM Pods, the internet, and a private network behind a firewall |
| 2 | `boot` | Reconciler → Pod → scheduler → Kata microVM → init containers → supervisor → policy frame → OpenClaw as uid 1000 |
| 3 | `ingress` | Browser → wildcard ingress → host match → Lens ID sign-in and session cookie → data tunnel → `127.0.0.1:18789` |
| 4 | `network` | nftables cage, host-name policy, `direct` and `upstream` transport, NXDOMAIN, proxy bypass attempts |
| 5 | `policy` | The org ceiling and project grants, drift, `pg_notify` propagation, the emergency halt |
| 6 | `credentials` | Write-only credentials, `__lens_cred:<id>__` placeholders, TLS interception and header injection |
| 7 | `inference` | The LLM proxy: halt, policy, budget, PII masking, provider, metering |
| 8 | `mcp` | The MCP gateway: attach upstreams (OAuth or through a cluster relay), the tool catalog, `allowedTools` |
| 9 | `rbac` | Principals, roles, and the audit trail by source |

## Keys

`1`–`9` open a chapter. `←` / `→` go to the previous or next chapter. `T` starts or stops the tour. `V` turns the narrator on or off: the browser reads each tour caption aloud. `Space` pauses. `L` shows or hides labels. `M` toggles the tilt-shift effect. `/` hides the UI. `R` resets the camera. `?` opens help.

## Files

- `index.html`: layout, styles, and the help dialog
- `world.js`: the scene (cluster, sandbox Pod, control plane, internet, private network, pipes)
- `openclaw.js`: the OpenClaw lobster mascot
- `app.js`: the simulation (packets, policy evaluation, chapters, panels, tour, audit trail)
- `og.jpg`: the 1200×630 link preview image

## Accuracy

The lab follows the `nexus-monorepo` sources. It simplifies layout and timing, and it does not simplify behaviour:

- The in-sandbox parts come from `lens-sandbox-core`, the same core that lns uses: the supervisor, the nftables cage, the proxy, the DNS stub, and placeholder injection.
- Nexus has no approval (ask) flow, so the lab shows only allow and deny. A host with no rule gets `networkDefaultVerdict`.
- Policies are org-scoped or project-scoped. There is no team policy tier.
- The control plane is drawn outside the cluster to make the picture clearer. The Helm chart can also run it inside the cluster.

## Testing hook

`window.__lab` exposes `go(i)`, `advance(seconds)`, `request(key)`, `openUI()`, `askModel()`, the state `S`, and `current`. `advance` steps the simulation without `requestAnimationFrame`, so headless browsers can drive it.

## Credit

Built on the design and code of [lns-lab](https://github.com/chenhunghan/lns-lab).
