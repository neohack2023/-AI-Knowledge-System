# GT_TERMINAL_NEOCITIES_BRIDGE_01

Bounded GitHub-Actions bridge for `https://gtterminal.neocities.org`.

## Security model

The Neocities API key is **never** written to the repository, Notion, Drive, request files, results, or logs.

Store it as the repository Actions secret:

`NEOCITIES_GTTERMINAL_API_KEY`

GitHub secure-input path:

`https://github.com/neohack2023/-AI-Knowledge-System/settings/secrets/actions/new`

Use the secret name exactly as above.

## Session gate

The persistent encrypted GitHub secret is inert unless `session.json` has:

- `enabled: true`
- a future `expires_at` ISO timestamp
- scope `gt-terminal`

This gives ChatGPT a session-like authorization switch without copying the raw secret into chat-visible state. When the session expires or is disabled, API operations fail closed.

## Chat command channel

ChatGPT can update `request.json` through the connected GitHub tool. The push triggers the workflow. The workflow calls Neocities with the encrypted secret and writes only a sanitized `result.json`. ChatGPT then reads `result.json`.

Supported operations:

### Site info

```json
{
  "request_id": "info-001",
  "op": "info"
}
```

### List site files

```json
{
  "request_id": "list-001",
  "op": "list",
  "path": "artifacts/vanille-spatial-relief"
}
```

### Upload a UTF-8 text web file

```json
{
  "request_id": "upload-001",
  "op": "upload_text",
  "path": "artifacts/example/index.html",
  "mime_type": "text/html",
  "content": "<!doctype html><title>Hello</title>"
}
```

Maximum inline text upload: 512 KB.

### Create directory

```json
{
  "request_id": "mkdir-001",
  "op": "create_directory",
  "path": "artifacts/example"
}
```

### Delete files

```json
{
  "request_id": "delete-001",
  "op": "delete",
  "files": ["artifacts/example/old.js"]
}
```

`index.html` deletion is explicitly blocked by the bridge.

### Session status

```json
{
  "request_id": "status-001",
  "op": "session_status"
}
```

## Read model

Neocities `/api/list` provides file metadata. Public file contents remain readable from the normal GT Terminal origin, so ChatGPT should use ordinary web retrieval for actual HTML/CSS/JS content and the API bridge for authenticated inventory and writes.

## Deliberate limits

- Scope fixed to GT Terminal.
- No arbitrary HTTP target.
- No raw binary upload in v0.1.
- No API-key echo.
- No delete of `index.html`.
- No operation when session gate is disabled or expired.
- Requests are serialized with GitHub Actions concurrency.

## Branch

This bridge is isolated on `gt-terminal-neocities-bridge-01` until separately promoted.
