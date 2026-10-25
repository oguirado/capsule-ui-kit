#!/usr/bin/env python3
"""Linux proof supervisor: reap adopted children without changing test assertions."""
import ctypes,os,subprocess,sys,time
libc=ctypes.CDLL(None,use_errno=True)
if libc.prctl(36,1,0,0,0)!=0: raise OSError(ctypes.get_errno(),'PR_SET_CHILD_SUBREAPER')
child=subprocess.Popen(sys.argv[1:]); status=None
while status is None:
 try:
  while True:
   pid,raw=os.waitpid(-1,os.WNOHANG)
   if pid==0: break
   if pid==child.pid: status=os.waitstatus_to_exitcode(raw)
 except ChildProcessError: pass
 time.sleep(.01)
# Reap children that finish with the proof. Do not kill unrelated processes.
for _ in range(100):
 try:
  pid,_=os.waitpid(-1,os.WNOHANG)
  if pid==0: time.sleep(.01)
 except ChildProcessError: break
sys.exit(status if status>=0 else 128-status)
