# T3 Connect relay-client validation on Windows

Checked 2026-08-26.

## Conclusion

I found no public T3 Code issue or Cloudflare `cloudflared` issue that reports this exact failure: T3 Connect stopping at "Validating executable" because the Windows `cloudflared 2026.5.2` release exits with status 1 for `--version`.

The failure is reproducible, but it is not documented as a known upstream CLI change. Cloudflare's tagged 2026.5.2 source still registers `version` as a global boolean flag with `v` and `V` aliases, and also registers `version` as a command. In other words, the source says `--version` should work. [Cloudflare 2026.5.2 source](https://github.com/cloudflare/cloudflared/blob/2026.5.2/cmd/cloudflared/main.go#L72-L77), [version command](https://github.com/cloudflare/cloudflared/blob/2026.5.2/cmd/cloudflared/main.go#L145-L163)

T3 Code's current installer validates the staged binary by running `cloudflared --version`; any nonzero exit becomes `validation_failed`. [T3 Code relay-client installer](https://github.com/pingdotgg/t3code/blob/main/packages/shared/src/relayClient.ts#L423-L426)

## What is public and what is local

- **Exact T3 report:** None found in the public T3 Code issue tracker using the installer text, `cloudflared --version`, and Windows relay-client validation terms. [T3 Code issue search](https://github.com/pingdotgg/t3code/issues?q=is%3Aissue%20%22Validating%20executable%22%20cloudflared)
- **Known Cloudflare behavior or announced change:** None found. The 2026.5.2 tagged source still declares `--version`; the release notes do not announce its removal. [Cloudflare 2026.5.2 release](https://github.com/cloudflare/cloudflared/releases/tag/2026.5.2), [Cloudflare issue search](https://github.com/cloudflare/cloudflared/issues?q=is%3Aissue%20%22--version%22)
- **Local diagnosis:** The staged executable hashes to `20b9638f685333d623798e733effbad2487093f15ba592f6c7752360ff3b7ab7`, exactly matching Cloudflare's published checksum for `cloudflared-windows-amd64.exe`. On this machine, that artifact returns 1 for `--version`, while `version`, `-v`, and `-V` return 0 and print `2026.5.2`. [Published checksum](https://github.com/cloudflare/cloudflared/releases/tag/2026.5.2)

## Assessment

This looks like a real, unreported Windows compatibility defect at the boundary between T3 Code's validator and Cloudflare's official 2026.5.2 artifact. Calling it a "known issue" would overstate the public evidence. Calling it a bad download would be wrong because the local SHA-256 matches Cloudflare's release checksum.
