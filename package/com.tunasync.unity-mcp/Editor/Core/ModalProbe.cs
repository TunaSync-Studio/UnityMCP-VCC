// Background-thread-safe probe for blocking native dialogs.
// Enumerates the CURRENT process's visible top-level #32770 (standard dialog
// class) windows and collects each title plus its child Button labels via
// user32 only - no Unity API - so it works precisely when the main thread is
// stuck behind a modal, which is the one moment BUSY_MODAL needs it
// (the 2026-08-09 "About to open another project!" three-hour stall).
// Detection only: this class never sends input to a dialog. Pressing a
// button is a human decision (some dialogs rewrite assets when accepted).
// Returns null off-Windows or on any failure.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace TunaSync.UnityMCP.Editor
{
    internal static class ModalProbe
    {
        internal sealed class ModalInfo
        {
            public string title;
            public List<string> buttons;
            /// <summary>
            /// F-2 (2.6.1): "progress" = clears itself, do NOT press Cancel
            /// (aborts the operation); "decision" = a human must choose.
            /// Progress markers: a "(busy for MM:SS)" counter in the title
            /// (Unity's async-progress pattern) or an msctls_progress32 child.
            /// </summary>
            public string kind;
        }

        private static readonly System.Text.RegularExpressions.Regex BusyCounter =
            new System.Text.RegularExpressions.Regex(@"\(busy for [0-9:]+s?\)");

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool EnumChildWindows(IntPtr hWnd, EnumWindowsProc cb, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetClassName(IntPtr hWnd, StringBuilder buf, int max);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder buf, int max);

        /// <summary>
        /// Visible standard dialogs owned by this process, or null when there
        /// are none (or user32 is unavailable - non-Windows editor).
        /// </summary>
        internal static List<ModalInfo> Describe()
        {
            try
            {
                uint self = (uint)McpEditorInfo.Pid;
                if (self == 0) return null;
                List<ModalInfo> found = new List<ModalInfo>();
                EnumWindows((hWnd, lParam) =>
                {
                    if (!IsWindowVisible(hWnd)) return true;
                    uint pid;
                    GetWindowThreadProcessId(hWnd, out pid);
                    if (pid != self) return true;
                    if (!ClassNameIs(hWnd, "#32770")) return true;

                    ModalInfo info = new ModalInfo
                    {
                        title = WindowText(hWnd),
                        buttons = new List<string>(),
                    };
                    bool hasProgressBar = false;
                    EnumChildWindows(hWnd, (child, lParam2) =>
                    {
                        if (ClassNameIs(child, "Button"))
                        {
                            string label = WindowText(child);
                            if (!string.IsNullOrEmpty(label))
                            {
                                info.buttons.Add(label.Replace("&", ""));
                            }
                        }
                        else if (ClassNameIs(child, "msctls_progress32"))
                        {
                            hasProgressBar = true;
                        }
                        return true;
                    }, IntPtr.Zero);
                    info.kind = (hasProgressBar || (info.title != null && BusyCounter.IsMatch(info.title)))
                        ? "progress"
                        : "decision";
                    found.Add(info);
                    return true;
                }, IntPtr.Zero);
                return found.Count > 0 ? found : null;
            }
            catch (DllNotFoundException)
            {
                return null;
            }
            catch (EntryPointNotFoundException)
            {
                return null;
            }
            catch (Exception)
            {
                // A diagnostics probe must never take down the error path it
                // decorates.
                return null;
            }
        }

        private static bool ClassNameIs(IntPtr hWnd, string expected)
        {
            StringBuilder buf = new StringBuilder(64);
            if (GetClassName(hWnd, buf, buf.Capacity) == 0) return false;
            return buf.ToString() == expected;
        }

        private static string WindowText(IntPtr hWnd)
        {
            StringBuilder buf = new StringBuilder(512);
            GetWindowText(hWnd, buf, buf.Capacity);
            return buf.ToString();
        }
    }
}
