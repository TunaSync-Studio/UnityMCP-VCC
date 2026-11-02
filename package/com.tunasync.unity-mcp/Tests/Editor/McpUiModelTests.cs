using System;
using System.IO;
using NUnit.Framework;

namespace TunaSync.UnityMCP.Editor.Tests
{
    public sealed class McpUiModelTests
    {
        [Test]
        public void CodexPresetContainsCliAndLongJobToml()
        {
            string text = McpUiModel.ConfigText(McpClientPreset.Codex);
            StringAssert.Contains("codex mcp add unity-mcp -- npx -y tunasync-unity-mcp", text);
            StringAssert.Contains("[mcp_servers.unity-mcp]", text);
            StringAssert.Contains("tool_timeout_sec = 1300", text);
        }

        [TestCase(2)]
        [TestCase(3)]
        public void JsonPresetsContainStdioServer(int presetValue)
        {
            McpClientPreset preset = (McpClientPreset)presetValue;
            string text = McpUiModel.ConfigText(preset);
            StringAssert.Contains("\"mcpServers\"", text);
            StringAssert.Contains("\"command\": \"npx\"", text);
            StringAssert.Contains("tunasync-unity-mcp", text);
        }

        [Test]
        public void UploadArmDefaultTtlIsThirtyMinutes()
        {
            // The default; UNITY_MCP_ARM_TTL_MIN can change the effective value.
            Assert.AreEqual(30d, McpUiModel.UploadArmTtl.TotalMinutes);
        }

        [Test]
        public void ConsoleArmStatusAndClaimUseTheSameFile()
        {
            // Point this editor's arm at a temp file (never the real one) and
            // run the human arm / status / disarm helpers against it.
            string dir = Path.Combine(Path.GetTempPath(), "UnityMCP-ArmUiTests-" + Guid.NewGuid().ToString("N"));
            string arm = Path.Combine(dir, "vrc-upload.arm");
            string savedFile = Environment.GetEnvironmentVariable("UNITY_MCP_ARM_FILE");
            string savedTtl = Environment.GetEnvironmentVariable("UNITY_MCP_ARM_TTL_MIN");
            try
            {
                Environment.SetEnvironmentVariable("UNITY_MCP_ARM_FILE", arm);
                Environment.SetEnvironmentVariable("UNITY_MCP_ARM_TTL_MIN", "5");
                Assert.AreEqual(arm, McpUiModel.UploadArmPath, "must not touch the real arm file");
                Assert.AreEqual(5d, McpUiModel.UploadArmTtlMinutes);

                McpUiModel.ArmUploadHumanOnly();
                UploadArmSnapshot armed = McpUiModel.ReadUploadArm();
                Assert.IsTrue(armed.Exists);
                Assert.IsFalse(armed.Expired);
                Assert.AreEqual(5d, armed.TtlMinutes);
                Assert.That(armed.Remaining.TotalMinutes, Is.InRange(4.0, 5.0));
                Assert.AreEqual(UploadArmClaim.Inspect(arm, 5).Usable, !armed.Expired);

                File.WriteAllText(UploadArmClaim.LockPathFor(arm), "");
                Assert.IsTrue(McpUiModel.ReadUploadArm().LockLeft);

                McpUiModel.DisarmUpload();
                UploadArmSnapshot disarmed = McpUiModel.ReadUploadArm();
                Assert.IsFalse(disarmed.Exists);
                Assert.IsFalse(disarmed.LockLeft);
            }
            finally
            {
                Environment.SetEnvironmentVariable("UNITY_MCP_ARM_FILE", savedFile);
                Environment.SetEnvironmentVariable("UNITY_MCP_ARM_TTL_MIN", savedTtl);
                try
                {
                    Directory.Delete(dir, true);
                }
                catch (IOException)
                {
                }
                catch (UnauthorizedAccessException)
                {
                }
            }
        }

        [Test]
        public void ArmStringsTakeTheLifetimeInBothLanguages()
        {
            McpLang saved = McpLoc.Preference;
            try
            {
                foreach (McpLang lang in new[] { McpLang.English, McpLang.Japanese })
                {
                    McpLoc.Preference = lang;
                    foreach (string key in new[] { "btn.armUpload", "dialog.armUpload", "toast.uploadArmed" })
                    {
                        string text = string.Format(McpLoc.Tr(key), "45");
                        StringAssert.Contains("45", text, lang + " " + key);
                    }
                }
            }
            finally
            {
                McpLoc.Preference = saved;
            }
        }
    }
}
