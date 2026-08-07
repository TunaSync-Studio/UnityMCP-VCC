// camera.capture (scene/game/camera render to PNG) and editor.wake
// (Win32 foreground/restore of the editor main window).
// Captures require a GPU: under -nographics rendering throws, which is caught
// and surfaced as a clear HANDLER_EXCEPTION (real use is a GUI editor).
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using Debug = UnityEngine.Debug;
using Process = System.Diagnostics.Process;

namespace TunaSync.UnityMCP.Editor
{
    internal static class CaptureHandlers
    {
        public static void RegisterAll()
        {
            Dispatcher.RegisterMethod("camera.capture", false, CameraCapture);
            Dispatcher.RegisterMethod("editor.wake", false, EditorWake);
        }

        // ---- camera.capture -------------------------------------------------

        private static Task<object> CameraCapture(JObject p, RequestContext ctx)
        {
            string view = ReadString(p, "view") ?? "scene";
            if (view != "scene" && view != "game" && view != "camera")
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    "camera.capture: 'view' must be scene|game|camera");
            }
            string target = ReadString(p, "target");
            string focusTarget = ReadString(p, "focusTarget");
            int width = Clamp(ReadInt(p, "width", 1280), 16, 4096);
            int height = Clamp(ReadInt(p, "height", 720), 16, 4096);
            string outputPath = ResolveOutputPath(ReadString(p, "outputPath"));

            try
            {
                byte[] png = Render(view, target, focusTarget, width, height);
                Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
                File.WriteAllBytes(outputPath, png);
                return Task.FromResult<object>(new
                {
                    path = outputPath,
                    width,
                    height,
                    bytes = png.Length,
                });
            }
            catch (McpHandlerException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new McpHandlerException(ErrorCodes.HandlerException,
                    "camera capture failed (is the editor running with -nographics / headless?): " +
                    ex.GetType().Name + ": " + ex.Message);
            }
        }

        private static byte[] Render(string view, string target, string focusTarget, int width, int height)
        {
            GameObject focusGo = string.IsNullOrEmpty(focusTarget)
                ? null
                : HandlerUtil.FindSceneObjectByPath(focusTarget) ?? GameObject.Find(focusTarget);

            if (view == "scene")
            {
                SceneView sv = SceneView.lastActiveSceneView;
                if (sv != null)
                {
                    if (focusGo != null)
                    {
                        sv.Frame(ComputeBounds(focusGo), true);
                    }
                    if (sv.camera != null)
                    {
                        return RenderCameraToPng(sv.camera, width, height);
                    }
                }
                // No scene view (batchmode/no layout): render a temp camera framing
                // the focus target or the whole scene bounds.
                return RenderTempCamera(focusGo, width, height);
            }

            if (view == "game")
            {
                Camera cam = Camera.main;
                if (cam == null)
                {
                    Camera[] all = Camera.allCameras;
                    if (all != null && all.Length > 0) cam = all[0];
                }
                if (cam == null)
                {
                    throw new McpHandlerException(ErrorCodes.HandlerException,
                        "camera.capture: no active camera in the scene (view=game)");
                }
                return RenderCameraToPng(cam, width, height);
            }

            // view == "camera"
            if (string.IsNullOrEmpty(target))
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    "camera.capture: 'target' is required when view=camera");
            }
            GameObject targetGo = HandlerUtil.FindSceneObjectByPath(target) ?? GameObject.Find(target);
            Camera targetCam = targetGo != null ? targetGo.GetComponent<Camera>() : null;
            if (targetCam == null)
            {
                throw new McpHandlerException(ErrorCodes.InvalidParams,
                    "camera.capture: no Camera at '" + target + "'");
            }
            return RenderCameraToPng(targetCam, width, height);
        }

        private static byte[] RenderTempCamera(GameObject focusGo, int width, int height)
        {
            Bounds bounds = focusGo != null ? ComputeBounds(focusGo) : ComputeSceneBounds();
            GameObject go = new GameObject("UnityMCP_CaptureCamera");
            go.hideFlags = HideFlags.HideAndDontSave;
            try
            {
                Camera cam = go.AddComponent<Camera>();
                cam.clearFlags = CameraClearFlags.Skybox;
                float radius = bounds.extents.magnitude;
                if (radius < 0.001f) radius = 1f;
                Vector3 direction = new Vector3(1f, 0.8f, -1f).normalized;
                cam.transform.position = bounds.center + direction * radius * 2.2f;
                cam.transform.LookAt(bounds.center);
                cam.nearClipPlane = 0.01f;
                cam.farClipPlane = Mathf.Max(1000f, radius * 10f);
                return RenderCameraToPng(cam, width, height);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
            }
        }

        private static byte[] RenderCameraToPng(Camera cam, int width, int height)
        {
            RenderTexture rt = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32);
            RenderTexture prevTarget = cam.targetTexture;
            RenderTexture prevActive = RenderTexture.active;
            Texture2D tex = null;
            try
            {
                cam.targetTexture = rt;
                cam.Render();
                RenderTexture.active = rt;
                tex = new Texture2D(width, height, TextureFormat.RGBA32, false);
                tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                tex.Apply();
                return tex.EncodeToPNG();
            }
            finally
            {
                cam.targetTexture = prevTarget;
                cam.ResetAspect();
                RenderTexture.active = prevActive;
                if (tex != null) UnityEngine.Object.DestroyImmediate(tex);
                rt.Release();
                UnityEngine.Object.DestroyImmediate(rt);
            }
        }

        private static Bounds ComputeBounds(GameObject go)
        {
            Renderer[] renderers = go.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0)
            {
                return new Bounds(go.transform.position, Vector3.one * 2f);
            }
            Bounds bounds = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++)
            {
                bounds.Encapsulate(renderers[i].bounds);
            }
            return bounds;
        }

        private static Bounds ComputeSceneBounds()
        {
            Bounds bounds = new Bounds(Vector3.zero, Vector3.one * 10f);
            bool first = true;
            var roots = HandlerUtil.GetAllSceneRoots();
            for (int r = 0; r < roots.Count; r++)
            {
                Renderer[] renderers = roots[r].GetComponentsInChildren<Renderer>(false);
                for (int i = 0; i < renderers.Length; i++)
                {
                    if (first)
                    {
                        bounds = renderers[i].bounds;
                        first = false;
                    }
                    else
                    {
                        bounds.Encapsulate(renderers[i].bounds);
                    }
                }
            }
            return bounds;
        }

        private static string ResolveOutputPath(string requested)
        {
            if (!string.IsNullOrEmpty(requested))
            {
                return Path.IsPathRooted(requested)
                    ? requested
                    : Path.Combine(McpEditorInfo.ProjectPath, requested);
            }
            string project = Sanitize(McpEditorInfo.ProjectName);
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "UnityMCP", "captures", project);
            string file = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff") + ".png";
            return Path.Combine(dir, file);
        }

        private static string Sanitize(string name)
        {
            if (string.IsNullOrEmpty(name)) return "project";
            char[] invalid = Path.GetInvalidFileNameChars();
            char[] chars = name.ToCharArray();
            for (int i = 0; i < chars.Length; i++)
            {
                for (int j = 0; j < invalid.Length; j++)
                {
                    if (chars[i] == invalid[j])
                    {
                        chars[i] = '_';
                        break;
                    }
                }
            }
            return new string(chars);
        }

        // ---- editor.wake ----------------------------------------------------

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        private const int SW_RESTORE = 9;

        private static Task<object> EditorWake(JObject p, RequestContext ctx)
        {
            try
            {
                IntPtr handle;
                using (Process proc = Process.GetCurrentProcess())
                {
                    handle = proc.MainWindowHandle;
                }
                if (handle == IntPtr.Zero)
                {
                    return Task.FromResult<object>(new { woke = false, reason = "no window" });
                }
                ShowWindow(handle, SW_RESTORE);
                bool foreground = SetForegroundWindow(handle);
                return Task.FromResult<object>(new { woke = true, foreground });
            }
            catch (DllNotFoundException)
            {
                return Task.FromResult<object>(new { woke = false, reason = "user32 unavailable (non-Windows editor)" });
            }
            catch (Exception ex)
            {
                return Task.FromResult<object>(new { woke = false, reason = ex.Message });
            }
        }

        // ---- param helpers --------------------------------------------------

        private static string ReadString(JObject p, string name)
        {
            JToken t = p != null ? p[name] : null;
            return t != null && t.Type != JTokenType.Null ? t.Value<string>() : null;
        }

        private static int ReadInt(JObject p, string name, int fallback)
        {
            JToken t = p != null ? p[name] : null;
            if (t == null || t.Type == JTokenType.Null) return fallback;
            try { return t.Value<int>(); }
            catch { return fallback; }
        }

        private static int Clamp(int value, int min, int max)
            => value < min ? min : (value > max ? max : value);
    }
}
