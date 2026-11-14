#!/usr/bin/env python3
"""H200 manual-run concurrency and Windows power controls, WITHOUT calendar logic.

This module is not part of the frozen engine's identity.  It only changes
admission of new 64-day tiles and the OS scheduling class of this process's
own `seer_engine_service.exe` descendants.  No registry/security/screen-saver
settings are changed, and no keys or mouse events are synthesized.
"""
from __future__ import annotations
import contextlib
import ctypes
import errno
import os
from pathlib import Path
import threading
import time
import uuid


def acquire_windows_byte_lock(f, msvcrt, chunk_id, timeout=90.0, retry_seconds=0.075):
    """Wait for byte-range contention without masking other file failures."""
    start=time.monotonic()
    tries=0
    while True:
        try:
            msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1)
            return tries,time.monotonic()-start
        except OSError as exc:
            if exc.errno not in (errno.EACCES,errno.EAGAIN) and getattr(exc,'winerror',None) not in (32,33):
                raise
            elapsed=time.monotonic()-start
            if elapsed >= timeout:
                raise TimeoutError(f'CHECKPOINT_LOCK_BUSY {chunk_id}: {elapsed:.1f}s') from exc
            tries+=1
            time.sleep(min(retry_seconds,max(0.005,timeout-elapsed)))


@contextlib.contextmanager
def fair_checkpoint_lock(root, chunk_id, timeout=90.0, retry_seconds=0.075, telemetry=None):
    """Cross-process exclusive byte lock with bounded wait on Windows contention.

    Original v001 LK_NBLCK immediately raised PermissionError(13) when one of
    eight epoch threads simultaneously requested GLOBAL_ENGINE_PIN.lock.
    File-open and lock errors other than lock contention are NOT masked.
    Never delete or replace the lock file (checkpoint-compatible).
    """
    if not isinstance(chunk_id, str) or '/' in chunk_id or '\\' in chunk_id:
        raise ValueError('Invalid checkpoint lock identifier')
    lock_path = Path(root) / 'locks' / (chunk_id + '.lock')
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    start = time.monotonic()
    with lock_path.open('a+b') as f:
        if os.name == 'nt':
            import msvcrt
            if f.seek(0, os.SEEK_END) == 0:
                f.write(b'\0')
                f.flush()
            f.seek(0)
            tries,waited=acquire_windows_byte_lock(f,msvcrt,chunk_id,timeout,retry_seconds)
            if telemetry and tries:
                telemetry('CHECKPOINT_LOCK_RETRIED', chunk=chunk_id, attempts=tries, waited_seconds=round(waited,3))
        else:
            import fcntl
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            if os.name == 'nt':
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)


class TileBudget:
    """Controls admission for *new* tiles, never interrupts an active tile."""
    def __init__(self, foreground=2, background=8):
        if not 1 <= foreground <= background <= 64:
            raise ValueError('Invalid worker budgets')
        self.foreground = foreground
        self.background = background
        self.limit = foreground
        self.active = 0
        self.condition = threading.Condition()
        self.mode = 'FOREGROUND_UNKNOWN'

    def set_mode(self, screen_off, label):
        with self.condition:
            self.limit = self.background if screen_off else self.foreground
            self.mode = label
            self.condition.notify_all()

    @contextlib.contextmanager
    def slot(self):
        with self.condition:
            while self.active >= self.limit:
                self.condition.wait(timeout=0.25)
            self.active += 1
        try:
            yield
        finally:
            with self.condition:
                self.active -= 1
                self.condition.notify_all()

    def snapshot(self):
        with self.condition:
            return {'mode': self.mode, 'active': self.active, 'limit': self.limit,
                    'foreground_limit': self.foreground, 'background_limit': self.background}


class DisplaySignal:
    """Windows session-display power notification, fail-closed if unavailable.

    GUID_SESSION_DISPLAY_STATUS sends PowerMonitorOff(0), On(1), Dim(2).
    A hidden window with message pump registers explicitly for notification.
    Last-user-input polling additionally forces foreground immediately on return.
    A positive OFF notification is the only way to enable boosted concurrency.
    """
    def __init__(self, on_status, on_error):
        self.on_status = on_status
        self.on_error = on_error
        self.stop = threading.Event()
        self.ready = threading.Event()
        self.thread = None
        self.hwnd = None
        self.last_off = False
        self.known = False
        self._callback = None

    def start(self):
        if os.name != 'nt':
            self.ready.set()
            self.on_error('No Windows power notifications outside Windows')
            return
        self.thread = threading.Thread(target=self._message_loop, name='DisplayStateNotification', daemon=True)
        self.thread.start()
        self.ready.wait(timeout=7.0)
        if not self.ready.is_set():
            self.on_error('Display notification registration timed out; conservative mode retained')

    def close(self):
        self.stop.set()
        if self.hwnd and os.name == 'nt':
            try:
                user32=ctypes.WinDLL('user32',use_last_error=True)
                from ctypes import wintypes as wt
                user32.PostMessageW.argtypes=[wt.HWND,wt.UINT,wt.WPARAM,wt.LPARAM]
                user32.PostMessageW.restype=wt.BOOL
                user32.PostMessageW(self.hwnd, 0x0010, 0, 0)
            except Exception:
                pass
        if self.thread:
            self.thread.join(timeout=2.0)

    def _message_loop(self):
        try:
            from ctypes import wintypes as wt
            user32 = ctypes.WinDLL('user32', use_last_error=True)
            kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
            kernel32.GetModuleHandleW.argtypes=[wt.LPCWSTR]
            kernel32.GetModuleHandleW.restype=wt.HINSTANCE
            user32.DefWindowProcW.argtypes=[wt.HWND,wt.UINT,wt.WPARAM,wt.LPARAM]
            user32.DefWindowProcW.restype=ctypes.c_ssize_t
            user32.DestroyWindow.argtypes=[wt.HWND];user32.DestroyWindow.restype=wt.BOOL
            user32.PostQuitMessage.argtypes=[ctypes.c_int]
            user32.TranslateMessage.argtypes=[ctypes.c_void_p]
            user32.DispatchMessageW.argtypes=[ctypes.c_void_p]
            user32.DispatchMessageW.restype=ctypes.c_ssize_t
            user32.GetMessageW.argtypes=[ctypes.c_void_p,wt.HWND,wt.UINT,wt.UINT]
            user32.GetMessageW.restype=ctypes.c_int
            user32.UnregisterPowerSettingNotification.argtypes=[wt.HANDLE]
            user32.UnregisterPowerSettingNotification.restype=wt.BOOL
            UINT = wt.UINT
            DWORD = wt.DWORD
            LRESULT = ctypes.c_ssize_t
            WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wt.HWND, UINT, wt.WPARAM, wt.LPARAM)
            class GUID(ctypes.Structure):
                _fields_ = [('Data1',ctypes.c_uint32),('Data2',ctypes.c_uint16),('Data3',ctypes.c_uint16),('Data4',ctypes.c_ubyte*8)]
            class WNDCLASS(ctypes.Structure):
                _fields_=[('style',UINT),('lpfnWndProc',WNDPROC),('cbClsExtra',ctypes.c_int),('cbWndExtra',ctypes.c_int),
                          ('hInstance',wt.HINSTANCE),('hIcon',wt.HICON),('hCursor',wt.HANDLE),
                          ('hbrBackground',wt.HBRUSH),('lpszMenuName',wt.LPCWSTR),('lpszClassName',wt.LPCWSTR)]
            class MSG(ctypes.Structure):
                _fields_=[('hwnd',wt.HWND),('message',UINT),('wParam',wt.WPARAM),('lParam',wt.LPARAM),
                          ('time',DWORD),('pt',wt.POINT),('lPrivate',DWORD)]
            wanted = GUID.from_buffer_copy(uuid.UUID('2b84c20e-ad23-4ddf-93db-05ffbd7efca5').bytes_le)
            def window_proc(hwnd,msg,wparam,lparam):
                if msg==0x218 and wparam==0x8013 and lparam:
                    try:
                        raw = ctypes.string_at(lparam, 20)
                        if raw[:16] == bytes(wanted) and int.from_bytes(raw[16:20],'little')>=4:
                            state = ctypes.c_uint32.from_address(lparam+20).value
                            if state in (0,1,2):
                                self.known=True
                                self.last_off=(state==0)
                                self.on_status(self.last_off, 'DISPLAY_OFF' if state==0 else 'DISPLAY_ON_OR_DIM')
                    except Exception as exc:
                        self.on_error('Display notification read error '+repr(exc))
                    return 1
                if msg==0x0010:
                    user32.DestroyWindow(hwnd)
                    return 0
                if msg==0x0002:
                    user32.PostQuitMessage(0)
                    return 0
                return user32.DefWindowProcW(hwnd,msg,wparam,lparam)
            self._callback=WNDPROC(window_proc)
            class_name='H200DisplayState_'+str(os.getpid())+'_'+str(threading.get_ident())
            module=kernel32.GetModuleHandleW(None)
            wc=WNDCLASS();wc.lpfnWndProc=self._callback;wc.hInstance=module;wc.lpszClassName=class_name
            user32.RegisterClassW.argtypes=[ctypes.POINTER(WNDCLASS)]
            user32.RegisterClassW.restype=wt.ATOM
            atom=user32.RegisterClassW(ctypes.byref(wc))
            if not atom:raise OSError('RegisterClassW failed '+str(ctypes.get_last_error()))
            user32.CreateWindowExW.restype=wt.HWND
            user32.CreateWindowExW.argtypes=[DWORD,wt.LPCWSTR,wt.LPCWSTR,DWORD,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int,wt.HWND,wt.HMENU,wt.HINSTANCE,ctypes.c_void_p]
            # Hidden regular top-level window: registered notifications are sent to its HWND.
            hwnd=user32.CreateWindowExW(0,class_name,class_name,0,0,0,0,0,None,None,module,None)
            if not hwnd:raise OSError('CreateWindowExW failed '+str(ctypes.get_last_error()))
            self.hwnd=hwnd
            user32.RegisterPowerSettingNotification.argtypes=[wt.HANDLE,ctypes.POINTER(GUID),DWORD]
            user32.RegisterPowerSettingNotification.restype=wt.HANDLE
            hnotify=user32.RegisterPowerSettingNotification(hwnd,ctypes.byref(wanted),0)
            if not hnotify:raise OSError('RegisterPowerSettingNotification failed '+str(ctypes.get_last_error()))
            self.ready.set()
            try:
                msg=MSG()
                while not self.stop.is_set():
                    rv=user32.GetMessageW(ctypes.byref(msg),None,0,0)
                    if rv<=0:break
                    user32.TranslateMessage(ctypes.byref(msg))
                    user32.DispatchMessageW(ctypes.byref(msg))
            finally:
                user32.UnregisterPowerSettingNotification(hnotify)
                self.hwnd=None
        except Exception as exc:
            self.ready.set()
            self.on_error('Display power API unavailable: '+repr(exc))


class OwnedSeerPriorities:
    """Lower priority of this controller's direct Seer child PIDs only."""
    def __init__(self):
        self.success = 0
        self.failures = 0
        self._last = {}

    def apply(self, screen_off):
        if os.name!='nt':return
        try:
            from ctypes import wintypes as wt
            k=ctypes.WinDLL('kernel32',use_last_error=True)
            TH32CS_SNAPPROCESS=2
            class ENTRY(ctypes.Structure):
                _fields_=[('dwSize',wt.DWORD),('cntUsage',wt.DWORD),('th32ProcessID',wt.DWORD),
                          ('th32DefaultHeapID',ctypes.c_void_p),('th32ModuleID',wt.DWORD),
                          ('cntThreads',wt.DWORD),('th32ParentProcessID',wt.DWORD),
                          ('pcPriClassBase',wt.LONG),('dwFlags',wt.DWORD),('szExeFile',wt.WCHAR*260)]
            k.CreateToolhelp32Snapshot.argtypes=[wt.DWORD,wt.DWORD];k.CreateToolhelp32Snapshot.restype=wt.HANDLE
            k.Process32FirstW.argtypes=[wt.HANDLE,ctypes.POINTER(ENTRY)];k.Process32FirstW.restype=wt.BOOL
            k.Process32NextW.argtypes=[wt.HANDLE,ctypes.POINTER(ENTRY)];k.Process32NextW.restype=wt.BOOL
            k.OpenProcess.argtypes=[wt.DWORD,wt.BOOL,wt.DWORD];k.OpenProcess.restype=wt.HANDLE
            k.SetPriorityClass.argtypes=[wt.HANDLE,wt.DWORD];k.SetPriorityClass.restype=wt.BOOL
            k.CloseHandle.argtypes=[wt.HANDLE]
            h=k.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0)
            if h==wt.HANDLE(-1).value:raise OSError('CreateToolhelp32Snapshot failed')
            priority=0x4000 if screen_off else 0x40 # BELOW_NORMAL / IDLE
            pids=set()
            try:
                e=ENTRY();e.dwSize=ctypes.sizeof(e)
                ok=k.Process32FirstW(h,ctypes.byref(e))
                while ok:
                    if e.th32ParentProcessID==os.getpid() and e.szExeFile.lower()=='seer_engine_service.exe':
                        pids.add(int(e.th32ProcessID))
                    ok=k.Process32NextW(h,ctypes.byref(e))
            finally:
                k.CloseHandle(h)
            for pid in pids:
                if self._last.get(pid)==priority:continue
                hp=k.OpenProcess(0x0200|0x1000,False,pid)
                if not hp:
                    self.failures+=1
                    continue
                try:
                    if k.SetPriorityClass(hp,priority):
                        self._last[pid]=priority;self.success+=1
                    else:self.failures+=1
                finally:k.CloseHandle(hp)
            self._last={k:v for k,v in self._last.items() if k in pids}
        except Exception:
            self.failures+=1


def seconds_since_last_input():
    if os.name!='nt':return None
    try:
        class LASTINPUT(ctypes.Structure):
            _fields_=[('cbSize',ctypes.c_uint32),('dwTime',ctypes.c_uint32)]
        val=LASTINPUT();val.cbSize=ctypes.sizeof(val)
        u=ctypes.windll.user32;k=ctypes.windll.kernel32
        k.GetTickCount.restype=ctypes.c_uint32
        if not u.GetLastInputInfo(ctypes.byref(val)):return None
        return ((k.GetTickCount()-val.dwTime)&0xffffffff)/1000.0
    except Exception:return None


class AdaptiveCompute:
    """Power state monitoring plus safe tile budgets, fail-closed on unknown state."""
    def __init__(self, logical_cores, report=None, foreground=2, background=8):
        self.report=report
        fg=min(foreground,max(1,logical_cores))
        bg=max(fg,min(background,max(1,logical_cores)))
        self.budget=TileBudget(fg,bg)
        self.off=False
        self.probe=DisplaySignal(self._on_status,self._error)
        self.priorities=OwnedSeerPriorities()
        self.stop=threading.Event()
        self.watch=None
        self.warning=[]
        self.transitions=[]
        self.monitor_started=False
        self._recent_input_since_off=False
        self._mutex=threading.Lock()

    def _emit(self,event,**kwargs):
        if self.report:self.report(event,**kwargs)

    def _error(self,error):
        self.warning.append(error)
        self._emit('ADAPTIVE_POWER_WARNING',message=error)
        self._on_status(False,'POWER_NOTIFICATION_UNAVAILABLE')

    def _on_status(self,off,label):
        with self._mutex:
            self.off=off
            self._recent_input_since_off=False
            self.budget.set_mode(off,label)
            snap=self.budget.snapshot()
            self.transitions.append({'time':time.monotonic(),'screen_off':off,'label':label,'capacity':snap['limit']})
        self._emit('ADAPTIVE_COMPUTE_MODE',screen_off=off,mode=label,limit=snap['limit'])

    def start(self):
        self.probe.start()
        self.monitor_started=True
        self.watch=threading.Thread(target=self._watch,daemon=True,name='H200-Owned-Process-Priorities')
        self.watch.start()

    def _watch(self):
        while not self.stop.wait(0.5):
            idle=seconds_since_last_input()
            # Any new input after a display-off notice instantly revokes boost.
            if self.off and idle is not None and idle < 2.5:
                self._on_status(False,'USER_INPUT_WOKE_DISPLAY_ASSUME_ON')
            self.priorities.apply(self.off)
        self.priorities.apply(False)

    def close(self):
        self.stop.set()
        self.probe.close()
        if self.watch:self.watch.join(timeout=3.0)
        self.priorities.apply(False)

    @contextlib.contextmanager
    def tile(self):
        with self.budget.slot():yield

    def summary(self):
        return {'budgets':self.budget.snapshot(),'transitions':self.transitions[-100:],
                'priority_updates':self.priorities.success,'priority_update_failures':self.priorities.failures,
                'warnings':self.warning,'screen_lock_policy_unchanged':True,
                'sleep_guard':'SetThreadExecutionState(ES_SYSTEM_REQUIRED | ES_CONTINUOUS) in supervisor',
                'display_required':False,'screen_notifications_enabled':self.monitor_started,
                'user_input_poll_seconds':0.5,
                'monitor_off_boost_requires_explicit_notification':True}