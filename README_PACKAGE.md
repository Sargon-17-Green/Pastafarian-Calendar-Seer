# Stage 4 update package

Run `RUN_UPDATE.cmd` from the extracted package. The updater locates a verified Stage 3 repository, installs the HTTP v1 adapter, runs Node tests and cache validation, and writes timestamped logs under `logs/`.

It does not commit or push anything. Upload the resulting repository changes only after `STATUS=PASS`.
