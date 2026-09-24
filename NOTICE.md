# NOTICE

UnityMCP-VCC v2 (server/, package/, recipes/, tools/, docs/) is licensed
under the MIT License — see `LICENSE`. Copyright (c) 2026 TunaSync.

Provenance: this project began as a fork of
[swax/UnityMCP-VRC](https://github.com/swax/UnityMCP-VRC) (CC BY-NC 4.0).
The v2 tree is a ground-up rewrite and ships none of the upstream code.
The pre-rewrite fork lineage is preserved only in the development
repository (branch `legacy-v1`, tag `v1-final`) and is not part of this
repository or any published artifact.

## Bundled third-party code (npm package)

The published npm bundle (`build/index.js`) statically includes the
packages below. Their full license texts ship next to it in
`build/THIRD_PARTY_LICENSES.txt`, which the build generates from the
bundle's actual inputs (so the list cannot drift from what is bundled):

- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
  — MIT, Copyright (c) 2024 Anthropic, PBC.
- [zod](https://github.com/colinhacks/zod) — MIT, Copyright (c) 2025 Colin McDonnell.
- [zod-to-json-schema](https://github.com/StefanTerdell/zod-to-json-schema)
  — ISC, Copyright (c) 2020 Stefan Terdell.
- [ajv](https://github.com/ajv-validator/ajv),
  [ajv-formats](https://github.com/ajv-validator/ajv-formats),
  [fast-deep-equal](https://github.com/epoberezkin/fast-deep-equal),
  [json-schema-traverse](https://github.com/epoberezkin/json-schema-traverse)
  — MIT, Copyright (c) Evgeny Poberezkin.
- [fast-uri](https://github.com/fastify/fast-uri) — BSD-3-Clause,
  Copyright (c) 2011-2021 Gary Court, (c) 2021-present The Fastify team.
