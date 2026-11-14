#!/usr/bin/env python3
"""Windows CI smoke of real msvcrt byte locks + session notification subscription.

No Seer or H200 data is evaluated.  GUI power events need not occur on CI.
"""
import concurrent.futures
import contextlib
import os
import tempfile
import time
import threading
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from h200_windows_adaptive_controls_v002 import fair_checkpoint_lock,DisplaySignal,OwnedSeerPriorities,TileBudget,seconds_since_last_input


def main():
    assert os.name=='nt','Run this integration on Windows only'
    with tempfile.TemporaryDirectory(prefix='h200-windows-lock-') as t:
        start=threading.Barrier(8)
        counts=[0]
        def worker(k):
            start.wait(timeout=8)
            with fair_checkpoint_lock(t,'GLOBAL_ENGINE_PIN',timeout=20,retry_seconds=.010):
                before=counts[0]
                time.sleep(.035)
                counts[0]=before+1
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as exe:
            list(exe.map(worker,range(8)))
        assert counts==[8],counts
    results=[]
    errors=[]
    d=DisplaySignal(lambda x,y:results.append((x,y)),lambda e:errors.append(e))
    d.start()
    time.sleep(.5)
    d.close()
    p=OwnedSeerPriorities();p.apply(False);p.apply(True)
    budget=TileBudget(2,8)
    assert budget.snapshot()['limit']==2
    budget.set_mode(True,'TEST_DISPLAY_OFF')
    assert budget.snapshot()['limit']==8
    budget.set_mode(False,'TEST_DISPLAY_ON')
    assert budget.snapshot()['limit']==2
    print('WINDOWS_REAL_LOCK_PASS 8/8; NOTIFICATIONS_INITIALIZED=',d.ready.is_set(),
          'POWEREVENT_WARNINGS=',errors,'PRIORITY_SNAPSHOT_FAILURES=',p.failures,
          'LATEST_INPUT_SECONDS=',seconds_since_last_input())

if __name__=='__main__':main()