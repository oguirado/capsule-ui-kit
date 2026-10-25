#!/bin/bash
# Router gate for the gate library: portable kit tests plus every W0 unit test that exists. Missing W0 tests are skipped by name, never counted as passes.
set -u; cd "$(dirname "$0")"; export PYTHONDONTWRITEBYTECODE=1 TMPDIR=$PWD/tmp; mkdir -p tmp; rc=0
for t in test_T2_build.py test_T3_route.py test_T9_gates.py test_T10_multimount.py test_T11_logging.py test_bootstrap_ui.py test_extract_vue.py test_extract_js.py test_extract_rust.py test_extract_css.py test_extract_ui.py test_resolve_ui.py test_gates_ui_entry.py test_router_web.py; do
  [ -f tests/$t ] || { echo "SKIP_ABSENT $t"; continue; }
  timeout 300 python3 -B -m unittest discover -s tests -p $t >/dev/null 2>tmp/$t.err && echo "PASS $t" || { echo "FAIL $t"; rc=1; }
done
exit $rc
