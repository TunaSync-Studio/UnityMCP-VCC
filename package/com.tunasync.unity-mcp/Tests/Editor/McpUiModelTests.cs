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
        public void UploadArmHasFixedThirtyMinuteTtl()
        {
            Assert.AreEqual(30d, McpUiModel.UploadArmTtl.TotalMinutes);
        }
    }
}
