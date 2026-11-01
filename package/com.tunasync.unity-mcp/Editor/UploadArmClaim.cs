// One-shot claim of the human VRChat upload arm file.
//
// The Unity plugin is the single consumer of the arm: vrc.upload claims it
// right before a real upload starts (the npm server only pre-checks it). One
// arm must buy exactly one attempt, also when attempts race - including two
// editors on one machine sharing %LOCALAPPDATA% (audit item L-3).
//
// Claimants serialize on "<arm>.lock", created with FileMode.CreateNew
// (O_CREAT|O_EXCL on macOS/Linux, CREATE_NEW on Windows), which exactly one
// caller can win. File.Move is deliberately NOT the claim: Mono on macOS/Linux
// implements it as link() + unlink(), and a Windows rename is a multi-step
// open/rename/close, so two concurrent moves of one file can both "succeed".
//
// Kept free of Unity and VRChat SDK types so it compiles in every project
// (VrcHandlers.cs only exists with an SDK) and can be unit-tested anywhere.

using System;
using System.Globalization;
using System.IO;

namespace TunaSync.UnityMCP.Editor
{
    internal static class UploadArmClaim
    {
        internal const string NotFound = "arm file not found";

        /// <summary>An arm stamped further ahead than this is refused (clock moved back).</summary>
        internal const double FutureToleranceMinutes = 1.0;

        // File.GetLastWriteTimeUtc's answer for a file that does not exist.
        private static readonly DateTime MissingFileTime = DateTime.FromFileTimeUtc(0);

        /// <summary>
        /// UNITY_MCP_ARM_TTL_MIN read the way the server reads it: a positive,
        /// finite number of minutes, parsed culture-invariantly ("1.5" means
        /// 1.5 minutes in every locale). Anything else gives the fallback.
        /// </summary>
        internal static double ResolveTtlMinutes(string envValue, double fallbackMinutes)
        {
            double parsed;
            if (!string.IsNullOrEmpty(envValue) &&
                double.TryParse(envValue.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out parsed) &&
                parsed > 0 && !double.IsInfinity(parsed))
            {
                return parsed;
            }
            return fallbackMinutes;
        }

        /// <summary>
        /// Claims (consumes) the arm at <paramref name="file"/> for one real
        /// upload. Returns null when this caller claimed a fresh arm - the arm
        /// file is gone afterwards - otherwise the reason it is not armed.
        /// Fail-safe: anything but a fresh arm that this caller removed is a
        /// refusal. An expired or future-dated arm is removed as well.
        /// </summary>
        internal static string TryClaim(string file, double ttlMinutes)
        {
            if (string.IsNullOrEmpty(file) || !File.Exists(file)) return NotFound;

            string lockPath = file + ".lock";
            FileStream lockStream;
            try
            {
                lockStream = new FileStream(lockPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            }
            catch (Exception ex)
            {
                if (File.Exists(lockPath))
                {
                    return "arm claim lock is held: another upload attempt is claiming this arm " +
                        "right now, or a crashed editor left " + lockPath + " behind - if no " +
                        "upload is running, delete that file and retry";
                }
                if (ex is UnauthorizedAccessException)
                {
                    return "arm claim lock could not be created (UnauthorizedAccessException): " +
                        "the folder of the arm file is not writable";
                }
                return "arm claim lock could not be created (" + ex.GetType().Name + "); another " +
                    "upload attempt may have claimed this arm just now";
            }

            try
            {
                // Inside the lock no other claimant can consume the arm, so
                // "present now" means it is still unused.
                if (!File.Exists(file)) return NotFound + " (consumed by a concurrent attempt)";
                DateTime written = File.GetLastWriteTimeUtc(file);
                if (written == MissingFileTime) return NotFound + " (removed while being claimed)";
                double ageMin = (DateTime.UtcNow - written).TotalMinutes;
                try
                {
                    File.Delete(file);
                }
                catch (Exception ex)
                {
                    return "arm file could not be consumed (" + ex.GetType().Name + "); another " +
                        "program may be holding it open - the arm is still in place, so a " +
                        "retry may succeed";
                }
                if (File.Exists(file)) return "arm file could not be consumed (still present after deletion)";
                if (ageMin < -FutureToleranceMinutes)
                {
                    return "arm file timestamp is " + Math.Round(-ageMin) + " min in the future " +
                        "(was the clock changed?) and the arm was discarded";
                }
                if (ageMin <= ttlMinutes) return null;
                return "arm file expired (age " + Math.Round(ageMin) + " min > TTL " +
                    Math.Round(ttlMinutes) + " min) and was discarded";
            }
            finally
            {
                lockStream.Dispose();
                try
                {
                    File.Delete(lockPath);
                }
                catch (Exception)
                {
                    // A leftover lock refuses later claims (fail-safe); the
                    // refusal message names the file to delete.
                }
            }
        }
    }
}
