"""XTest somente no Xephyr dedicado :90..:99; nunca usa o desktop operacional."""
import ctypes as c
import os
import re
import subprocess
import sys
import time


def main():
    display, action, *args = sys.argv[1:]
    if not re.fullmatch(r':9[0-9]', display) or action not in ('resize', '0', 'equal', 'capture'):
        raise ValueError('Informe display isolado :90..:99 e acao permitida.')
    listing = subprocess.check_output(['xwininfo', '-display', display, '-root', '-tree'], text=True)
    windows = re.findall(r'^ +(0x[0-9a-f]+) "[^\n]*Stroop Test Web[^\n]*', listing, re.M)
    if len(windows) != 1:
        raise RuntimeError('O display deve conter somente uma janela do catalogo sintetico.')
    if action == 'capture':
        os.environ['DISPLAY'] = display
        import gi
        gi.require_version('Gdk', '3.0')
        from gi.repository import Gdk
        root = Gdk.get_default_root_window()
        if root is None:
            raise RuntimeError('Raiz do display isolado indisponivel.')
        pixels = Gdk.pixbuf_get_from_window(root, 0, 0, root.get_width(), root.get_height())
        pixels.savev(args[0], 'png', [], [])
        return
    window = int(windows[0], 16)
    x, xt = c.CDLL('libX11.so.6'), c.CDLL('libXtst.so.6')
    x.XOpenDisplay.argtypes = [c.c_char_p]
    x.XOpenDisplay.restype = c.c_void_p
    x.XCloseDisplay.argtypes = [c.c_void_p]
    x.XSetInputFocus.argtypes = [c.c_void_p, c.c_ulong, c.c_int, c.c_ulong]
    x.XMapWindow.argtypes = x.XRaiseWindow.argtypes = [c.c_void_p, c.c_ulong]
    x.XResizeWindow.argtypes = [c.c_void_p, c.c_ulong, c.c_uint, c.c_uint]
    x.XStringToKeysym.argtypes, x.XStringToKeysym.restype = [c.c_char_p], c.c_ulong
    x.XKeysymToKeycode.argtypes, x.XKeysymToKeycode.restype = [c.c_void_p, c.c_ulong], c.c_uint
    x.XSync.argtypes = [c.c_void_p, c.c_int]
    xt.XTestFakeKeyEvent.argtypes = [c.c_void_p, c.c_uint, c.c_int, c.c_ulong]
    connection = x.XOpenDisplay(display.encode())
    if not connection:
        raise RuntimeError('Display isolado indisponivel.')
    try:
        x.XMapWindow(connection, window)
        x.XSync(connection, 0)
        x.XRaiseWindow(connection, window)
        x.XSetInputFocus(connection, window, 1, 0)
        if action == 'resize':
            width = int(args[0])
            if not 320 <= width <= 2000:
                raise ValueError('Largura fora da matriz sintetica.')
            x.XResizeWindow(connection, window, width, 1000)
        else:
            ctrl = x.XKeysymToKeycode(connection, x.XStringToKeysym(b'Control_L'))
            key = x.XKeysymToKeycode(connection, x.XStringToKeysym(action.encode()))
            for code, down in [(ctrl, 1), (key, 1), (key, 0), (ctrl, 0)]:
                xt.XTestFakeKeyEvent(connection, code, down, 0)
                x.XSync(connection, 0)
                time.sleep(.03)
        x.XSync(connection, 0)
    finally:
        x.XCloseDisplay(connection)


if __name__ == '__main__':
    main()
