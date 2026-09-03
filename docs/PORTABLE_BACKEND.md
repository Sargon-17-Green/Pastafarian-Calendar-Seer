# Portable backend

The Seer now has a second RNS execution backend for machines on which AVX-512IFMA is not
available.

The original IFMA benchmark baseline remains unchanged. The portable backend is derived
lane-for-lane from that baseline: the same 52-bit prime residues, the same exact modular
operations, the same CRT certification, the same predictor, and the same prefix-only
unranking are retained. Only the representation of each eight-prime pack changes from
AVX-512 vectors to ordinary `uint64_t` lanes.

This separation matters. A machine without IFMA must still be able to ask the Seer, but
lack of a particular instruction set does not authorize a different answer.

## Correctness checks

`prototype/scripts/run_portable_selftest.sh` builds and executes the standalone RNS test
program. It checks residue counts against a GMP exact table, reconstructs the count with
CRT, validates fractional reconstruction, and compares complete unranking runs against
the exact GMP oracle.

`prototype/scripts/check_portable_vectors.sh` then checks the bundled end-to-end calendar
vectors, including the two vectors whose five-field numeric outputs were independently
oracle-checked during development.

## Performance status

The portable backend is an initial fallback, not the final optimized non-IFMA engine.
It deliberately favors a small semantic delta from the IFMA baseline over an aggressive
AVX2 rewrite. Once hosted measurements are available, the hot portable operations can be
optimized without changing the IFMA baseline or the exact conformance tests.
