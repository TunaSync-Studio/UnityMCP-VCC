// ProjectPool: one UnityClient (plus its log ring) per running Unity project.
// Clients are created lazily on first resolve and pruned once dead.

import { normalizeProjectPath, type RegistryEntry } from "../protocol.js";
import type { Config } from "../config.js";
import { scanRegistry, resolveProject, type DiscoveredProject } from "../discovery.js";
import { UnityClient, type UnityClientOptions } from "./client.js";
import { LogRing } from "./logs.js";

export interface PooledProject {
  key: string;
  entry: RegistryEntry;
  client: UnityClient;
  logs: LogRing;
}

export class ProjectPool {
  private readonly clients = new Map<string, { client: UnityClient; logs: LogRing }>();

  constructor(
    private readonly cfg: Config,
    private readonly clientOverrides?: Partial<Omit<UnityClientOptions, "config" | "selector">>,
  ) {}

  /** Raw registry view (alive and dead), for health reporting. */
  listRegistry(): DiscoveredProject[] {
    return scanRegistry(this.cfg);
  }

  /**
   * Resolve a selector to a project and return its pooled client, creating it
   * lazily. Throws PROJECT_NOT_FOUND / PROJECT_AMBIGUOUS from discovery.
   */
  resolve(selector?: string): PooledProject {
    const entry = resolveProject(this.cfg, selector);
    const key = normalizeProjectPath(entry.projectPath);
    let pooled = this.clients.get(key);
    if (pooled && pooled.client.isDisposed) {
      this.clients.delete(key);
      pooled = undefined;
    }
    if (!pooled) {
      const logs = new LogRing();
      const client = new UnityClient({
        config: this.cfg,
        // Pin the client to this exact project path; reconnects re-read the
        // registry through this selector so port changes are picked up.
        selector: entry.projectPath,
        ...this.clientOverrides,
        hooks: {
          onEvent: (ev) => {
            if (ev.kind === "log") logs.push(ev.data);
          },
          // Session change means a different editor session: cached logs are
          // stale, drop them.
          onSessionChanged: () => logs.clear(),
        },
      });
      pooled = { client, logs };
      this.clients.set(key, pooled);
    }
    this.prune(key);
    return { key, entry, client: pooled.client, logs: pooled.logs };
  }

  /** Drop clients that are failed AND no longer present in the registry. */
  prune(keepKey?: string): void {
    if (this.clients.size === 0) return;
    const registered = new Set(
      scanRegistry(this.cfg)
        .filter((d) => d.alive)
        .map((d) => normalizeProjectPath(d.entry.projectPath)),
    );
    for (const [key, pooled] of this.clients) {
      if (key === keepKey) continue;
      if (pooled.client.isDisposed) {
        this.clients.delete(key);
        continue;
      }
      if (pooled.client.getState() === "failed" && !registered.has(key)) {
        pooled.client.dispose();
        this.clients.delete(key);
      }
    }
  }

  disposeAll(): void {
    for (const [key, pooled] of this.clients) {
      pooled.client.dispose();
      this.clients.delete(key);
    }
  }
}
