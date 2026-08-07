// Environment-driven configuration. Built once at import; tests build their
// own Config objects via loadConfig() or object literals.

import * as os from "node:os";
import * as path from "node:path";
import { loadStreamMode, type StreamModeState } from "./streamMode.js";

export interface Config {
  /** UNITY_MCP_PROJECT: project path substring used as the default selector. */
  projectSelector: string | undefined;
  /** UNITY_MCP_REGISTRY_DIR override; default %LOCALAPPDATA%\UnityMCP\registry. */
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
  /** UNITY_MCP_ARM_FILE override for the vrc_upload human arm file. */
  armFile?: string;
  /** UNITY_MCP_ARM_TTL_MIN (minutes) for the arm file; default 30 min. */
  armTtlMs?: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const localAppData =
    env.LOCALAPPDATA && env.LOCALAPPDATA.length > 0
      ? env.LOCALAPPDATA
      : path.join(os.homedir(), "AppData", "Local");

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

  const rawArmFile = env.UNITY_MCP_ARM_FILE?.trim();
  const rawArmTtlMin = Number(env.UNITY_MCP_ARM_TTL_MIN ?? "");
  const armTtlMs =
    Number.isFinite(rawArmTtlMin) && rawArmTtlMin > 0
      ? Math.floor(rawArmTtlMin * 60_000)
      : undefined;

  return {
    projectSelector,
    registryDir,
    defaultTimeoutMs,
    ...(rawRecipes && rawRecipes.length > 0 ? { recipesDir: rawRecipes } : {}),
    stream: loadStreamMode(env),
    ...(rawArmFile && rawArmFile.length > 0 ? { armFile: rawArmFile } : {}),
    ...(armTtlMs !== undefined ? { armTtlMs } : {}),
  };
}

/** Process-wide config, built once. */
export const config: Config = loadConfig();
