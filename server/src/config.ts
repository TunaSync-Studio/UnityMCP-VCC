// Environment-driven configuration. Built once at import; tests build their
// own Config objects via loadConfig() or object literals.

import * as os from "node:os";
import * as path from "node:path";
import { loadStreamMode, type StreamModeState } from "./streamMode.js";

export interface Config {
  /** UNITY_MCP_PROJECT: default project selector (see resolveProject for the rules). */
  projectSelector: string | undefined;
  /** UNITY_MCP_REGISTRY_DIR override; default <localDataDir()>/UnityMCP/registry. */
  registryDir: string;
  /** UNITY_MCP_DEFAULT_TIMEOUT_MS; default 60000. */
  defaultTimeoutMs: number;
  /**
   * UNITY_MCP_RECIPES_DIR override for the recipe library. When unset the
   * library probes <bundleDir>/../recipes then <bundleDir>/../../recipes.
   */
  recipesDir?: string;
  /**
   * Streaming mode (UNITY_MCP_STREAM_MODE / UNITY_MCP_STREAM_MASK): locks
   * destructive/publishing tools and masks user paths in output. Absent in
   * hand-built test configs = disabled.
   */
  stream?: StreamModeState;
  /** UNITY_MCP_ARM_FILE override for the vrc_upload human arm file (absolute paths only). */
  armFile?: string;
  /** UNITY_MCP_ARM_TTL_MIN (minutes) for the arm file; default 30, at most MAX_ARM_TTL_MIN. */
  armTtlMs?: number;
}

/** UNITY_MCP_ARM_TTL_MIN upper bound (24 h): an arm is meant to be short-lived. */
export const MAX_ARM_TTL_MIN = 1440;

const DECIMAL = /^\s*[+]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/;

/**
 * UNITY_MCP_ARM_TTL_MIN exactly as the plugin reads it (UploadArmClaim
 * .ResolveTtlMinutes): a plain positive decimal - no hex, no "Infinity" -
 * capped at MAX_ARM_TTL_MIN; anything else means the default.
 */
export function parseArmTtlMin(raw: string | undefined): number | undefined {
  if (raw === undefined || !DECIMAL.test(raw)) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(n, MAX_ARM_TTL_MIN);
}

/**
 * UNITY_MCP_ARM_FILE exactly as the plugin reads it (UploadArmClaim
 * .ResolveArmFile): trimmed, and only an absolute path - a relative one would
 * resolve against two different working directories (server vs editor).
 */
export function parseArmFile(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 && path.isAbsolute(trimmed) ? trimmed : undefined;
}

/**
 * Base folder of the registry and the vrc_upload arm file when they are not
 * overridden. It mirrors the plugin's Environment.SpecialFolder
 * .LocalApplicationData so both sides agree without configuration:
 * %LOCALAPPDATA% on Windows; on macOS and Linux Unity's Mono answers
 * $XDG_DATA_HOME, else ~/.local/share (no macOS special case - checked against
 * Environment.UnixGetFolderPath in Unity's unity-2022.3-mbe Mono). Through
 * 2.6.8 the server used ~/AppData/Local there, so the two sides never met
 * unless UNITY_MCP_REGISTRY_DIR was set for both. An explicit LOCALAPPDATA is
 * still honored first on every platform.
 */
export function localDataDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.LOCALAPPDATA && env.LOCALAPPDATA.length > 0) return env.LOCALAPPDATA;
  if (platform === "win32") return path.join(os.homedir(), "AppData", "Local");
  if (env.XDG_DATA_HOME && env.XDG_DATA_HOME.length > 0) return env.XDG_DATA_HOME;
  return path.join(os.homedir(), ".local", "share");
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Config {
  const localAppData = localDataDir(env, platform);

  const registryDir =
    env.UNITY_MCP_REGISTRY_DIR && env.UNITY_MCP_REGISTRY_DIR.length > 0
      ? env.UNITY_MCP_REGISTRY_DIR
      : path.join(localAppData, "UnityMCP", "registry");

  const rawTimeout = Number(env.UNITY_MCP_DEFAULT_TIMEOUT_MS ?? "");
  const defaultTimeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout > 0 ? Math.floor(rawTimeout) : 60_000;

  const rawSelector = env.UNITY_MCP_PROJECT?.trim();
  const projectSelector = rawSelector && rawSelector.length > 0 ? rawSelector : undefined;

  const rawRecipes = env.UNITY_MCP_RECIPES_DIR?.trim();

  const armFile = parseArmFile(env.UNITY_MCP_ARM_FILE);
  const armTtlMin = parseArmTtlMin(env.UNITY_MCP_ARM_TTL_MIN);
  const armTtlMs = armTtlMin !== undefined ? Math.floor(armTtlMin * 60_000) : undefined;

  return {
    projectSelector,
    registryDir,
    defaultTimeoutMs,
    ...(rawRecipes && rawRecipes.length > 0 ? { recipesDir: rawRecipes } : {}),
    stream: loadStreamMode(env),
    ...(armFile !== undefined ? { armFile } : {}),
    ...(armTtlMs !== undefined ? { armTtlMs } : {}),
  };
}

/** Process-wide config, built once. */
export const config: Config = loadConfig();
