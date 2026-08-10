// F-11 (2026-08-10): VRChat expression-menu controls keep PUPPET parameters in
// `subParameters` (Radial 1 / TwoAxis 2 / FourAxis 4) while `parameter` stays
// empty - that is the normal, working shape. vrc.menuAudit read only
// `parameter`, so every puppet fell into the "no-parameter" early-out: working
// puppets were reported as if broken, and a puppet whose parameter was
// undeclared / unused by any animator / animating deleted transforms was never
// judged on any axis (it could not even reach deadMenuItems). vrc.menuTree had
// the same blind spot, printing parameter:"" so the wiring was invisible.
//
// Deliberately OUTSIDE the MCP_VRCSDK3_AVATARS gate: the reflection is
// name-based, so this compiles and is unit-testable with plain fakes on a
// project that has no VRChat SDK installed.
using System.Collections;
using System.Collections.Generic;
using System.Reflection;

namespace TunaSync.UnityMCP.Editor
{
    internal static class MenuControlParams
    {
        private static object Field(object owner, string name)
        {
            if (owner == null) return null;
            FieldInfo f = owner.GetType().GetField(name, BindingFlags.Instance | BindingFlags.Public);
            return f != null ? f.GetValue(owner) : null;
        }

        private static string NameOf(object parameter)
        {
            string n = Field(parameter, "name") as string;
            return n != null ? n : "";
        }

        /// <summary>`control.parameter.name`, or "" when unset (puppets, submenus).</summary>
        internal static string MainName(object control)
        {
            return NameOf(Field(control, "parameter"));
        }

        /// <summary>
        /// `control.subParameters[].name` in declaration order (axis order
        /// matters for Two/FourAxis), empties dropped.
        /// </summary>
        internal static List<string> SubNames(object control)
        {
            List<string> names = new List<string>();
            IEnumerable subs = Field(control, "subParameters") as IEnumerable;
            if (subs == null) return names;
            foreach (object sub in subs)
            {
                string n = NameOf(sub);
                if (n.Length > 0) names.Add(n);
            }
            return names;
        }

        /// <summary>
        /// Every parameter this control actually drives: main first, then the
        /// sub-parameters. Empty names dropped, duplicates collapsed (a
        /// TwoAxisPuppet may legitimately point both axes at one parameter).
        /// </summary>
        internal static List<string> Names(object control)
        {
            List<string> names = new List<string>();
            string main = MainName(control);
            if (main.Length > 0) names.Add(main);
            foreach (string sub in SubNames(control))
            {
                if (!names.Contains(sub)) names.Add(sub);
            }
            return names;
        }

        /// <summary>
        /// Verdict for one control. Precedence is unchanged from the
        /// single-parameter version; a control driving several parameters
        /// takes the WORST axis of any of them (one dead axis = dead control).
        /// </summary>
        internal static string Verdict(
            bool hasSubMenu, int nameCount, bool allDeclared, bool allConsumed,
            int totalPaths, int existingPaths)
        {
            if (nameCount == 0) return hasSubMenu ? "submenu" : "no-parameter";
            if (!allDeclared) return "parameter-not-declared";
            if (!allConsumed) return "parameter-unused-by-animator";
            if (totalPaths > 0 && existingPaths == 0) return "dead-menu-item";
            if (totalPaths > 0 && existingPaths < totalPaths) return "partially-missing";
            return "ok";
        }
    }
}
