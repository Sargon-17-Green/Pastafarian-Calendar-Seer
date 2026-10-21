# Source classification

The production exact-runtime source set is defined by `package.json` together with the native build entry points. Those packaged `seer_*` sources, `pastafarian_year_batch.cpp`, production Sauce/RNS headers, and their build dependencies are production code.

Other files in this directory may support verification or retained baselines. Filename similarity is not evidence of production status.

Experimental A/B variants that were previously interleaved here now live in `../../research/benchmarks/src/`.
