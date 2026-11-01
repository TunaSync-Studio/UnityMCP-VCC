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
// implements it as link() + unlink(), so two concurrent moves of the same
// file can both succeed.
//
// Kept free of Unity and VRChat SDK types so it compiles in every project
// (VrcHandlers.cs only exists with an SDK) and can be unit-tested anywhere.

using System;
using System.IO;

namespace TunaSync.UnityMCP.Editor
{
    internal static class UploadArmClaim
    {
        internal const string NotFound = "arm file not found";

        /// <summary>
        /// Claims (consumes) the arm at <paramref name="file"/> for one real
        /// upload. Returns null when this caller claimed a fresh arm - the arm
        /// file is gone afterwards - otherwise the reason it is not armed.
        /// Fail-safe: anything but a fresh arm that this caller removed is a
        /// refusal. An expired arm is removed as well.
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
                return "arm claim lock could not be created (" + ex.GetType().Name + "); another " +
                    "upload attempt may have claimed this arm just now";
            }

            try
            {
                // Inside the lock no other claimant can consume the arm, so
                // "present now" means it is still unused.
                if (!File.Exists(file)) return NotFound + " (consumed by a concurrent attempt)";
                double ageMin = (DateTime.UtcNow - File.GetLastWriteTimeUtc(file)).TotalMinutes;
                try
                {
                    File.Delete(file);
                }
                catch (Exception ex)
                {
                    return "arm file could not be consumed (" + ex.GetType().Name +
                        "); another program may be holding it open";
                }
                if (File.Exists(file)) return "arm file could not be consumed (still present after deletion)";
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
