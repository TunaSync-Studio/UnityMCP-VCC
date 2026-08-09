// Distribution-layer smoke: launch the built bundle over real stdio MCP and
// verify the initialization instructions plus complete tool annotations.

import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["build/index.js"],
  cwd: process.cwd(),
  stderr: "pipe",
});
const client = new Client({ name: "metadata-bundle-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const instructions = client.getInstructions() ?? "";
  const firstBlockLength = instructions.split("\n\n", 1)[0]?.length ?? 0;
  const listed = await client.listTools();
  const missingAnnotations = listed.tools
    .filter(
      (tool) =>
        tool.annotations?.readOnlyHint === undefined ||
        tool.annotations?.destructiveHint === undefined ||
        tool.annotations?.openWorldHint === undefined,
    )
    .map((tool) => tool.name);

  assert.equal(listed.tools.length, 18);
  assert.deepEqual(missingAnnotations, []);
  assert.ok(firstBlockLength <= 512);
  assert.match(instructions, /Never create the vrc_upload arm file/);

  console.log(
    JSON.stringify(
      {
        server: client.getServerVersion(),
        instructionsLength: instructions.length,
        firstBlockLength,
        toolCount: listed.tools.length,
        missingAnnotations,
        readOnlyTools: listed.tools
          .filter((tool) => tool.annotations?.readOnlyHint)
          .map((tool) => tool.name),
        openWorldTools: listed.tools
          .filter((tool) => tool.annotations?.openWorldHint)
          .map((tool) => tool.name),
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
