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

        /// <summary>UNITY_MCP_ARM_TTL_MIN upper bound (24 h), same as the server's MAX_ARM_TTL_MIN.</summary>
        internal const double MaxTtlMinutes = 1440.0;

        /// <summary>What a read-only look at the arm found (Inspect).</summary>
        internal struct ArmStatus
        {
            public bool Exists;
            /// <summary>Present, fresh and not future-dated: a claim would accept it.</summary>
            public bool Usable;
            public double RemainingMinutes;
            /// <summary>Why it is not usable (null when usable).</summary>
            public string Reason;
        }

        // File.GetLastWriteTimeUtc's answer for a file that does not exist.
        private static readonly DateTime MissingFileTime = DateTime.FromFileTimeUtc(0);

        /// <summary>The claim lock that sits next to the arm file.</summary>
        internal static string LockPathFor(string armFile)
        {
            return armFile + ".lock";
        }

        /// <summary>
        /// HUMAN OPERATOR ACTIONS ONLY (arm / disarm). A claim holds the lock
        /// only for the instant of its check-and-delete, so a lock a human runs
        /// into was left behind by a crashed editor; it would refuse every
        /// later claim. Never call this from an MCP handler.
        /// </summary>
        internal static void ClearLeftoverLock(string armFile)
        {
            string lockPath = LockPathFor(armFile);
            try
            {
                if (File.Exists(lockPath)) File.Delete(lockPath);
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }

        /// <summary>
        /// UNITY_MCP_ARM_FILE read the way the server reads it: trimmed, and
        /// only an absolute path - a relative one would resolve against two
        /// different working directories (editor vs server). Otherwise the
        /// default arm location.
        /// </summary>
        internal static string ResolveArmFile(string envValue, string fallbackPath)
        {
            if (envValue != null)
            {
                string trimmed = envValue.Trim();
                if (trimmed.Length > 0 && Path.IsPathRooted(trimmed)) return trimmed;
            }
            return fallbackPath;
        }

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
                return Math.Min(parsed, MaxTtlMinutes);
            }
            return fallbackMinutes;
        }

        /// <summary>
        /// Read-only look at the arm with the same rules a claim applies
        /// (exists, TTL, not future-dated). Never consumes it: used for the
        /// early refusal before touching the SDK and for Creator Console, so
        /// what the Console shows and what the gate accepts cannot differ.
        /// </summary>
        internal static ArmStatus Inspect(string file, double ttlMinutes)
        {
            ArmStatus status = new ArmStatus { Reason = NotFound };
            try
            {
                if (string.IsNullOrEmpty(file) || !File.Exists(file)) return status;
                DateTime written = File.GetLastWriteTimeUtc(file);
                if (written == MissingFileTime) return status;
                status.Exists = true;
                double ageMin = (DateTime.UtcNow - written).TotalMinutes;
                if (ageMin < -FutureToleranceMinutes)
                {
                    status.Reason = "arm file timestamp is " + Math.Round(-ageMin) +
                        " min in the future (was the clock changed?)";
                    return status;
                }
                if (ageMin > ttlMinutes)
                {
                    status.Reason = "arm file expired (age " + Math.Round(ageMin) + " min > TTL " +
                        Math.Round(ttlMinutes) + " min)";
                    return status;
                }
                status.Usable = true;
                status.RemainingMinutes = Math.Max(0, ttlMinutes - ageMin);
                status.Reason = null;
                return status;
            }
            catch (Exception ex)
            {
                status.Usable = false;
                status.Reason = "arm file could not be read (" + ex.GetType().Name + ")";
                return status;
            }
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

            string lockPath = LockPathFor(file);
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
                        "at this instant. If a retry a few seconds later still reports this, a " +
                        "crashed editor left " + lockPath + " behind - the operator clears it by " +
                        "disarming and arming again";
                }
                if (ex is UnauthorizedAccessException)
                {
                    return "arm claim lock could not be created (UnauthorizedAccessException): " +
                        "the folder of the arm file is not writable, or a claim lock released " +
                        "just now is still being deleted - retry in a moment";
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
                catch (UnauthorizedAccessException)
                {
                    return "arm file could not be consumed (UnauthorizedAccessException): it is " +
                        "read-only or access is denied - the operator has to delete it and arm again";
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
