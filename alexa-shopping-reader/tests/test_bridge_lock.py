import fcntl
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

stub = types.ModuleType('reader')
stub.read_list = lambda: {'ok': True, 'checked_at': '2026-11-05T12:00:00Z', 'items': ['Pan']}
sys.modules['reader'] = stub
spec = importlib.util.spec_from_file_location('bridge_server_test', Path(__file__).resolve().parents[1] / 'bridge_server.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class BridgeLockTest(unittest.TestCase):
    def test_busy_profile_is_not_read_until_lock_released(self):
        with tempfile.TemporaryDirectory() as tmp:
            bridge.PROFILE_LOCK = Path(tmp) / 'login.lock'
            bridge.TOKEN = 'test-token'
            server = bridge.ThreadingHTTPServer(('127.0.0.1', 0), bridge.Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            url = f'http://127.0.0.1:{server.server_port}/'
            def get():
                req = Request(url, headers={'Authorization': 'Bearer test-token'})
                try:
                    with urlopen(req) as response:
                        return response.status, json.load(response)
                except HTTPError as e:
                    with e:
                        return e.code, json.load(e)
            try:
                with bridge.PROFILE_LOCK.open('a') as lock:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    code, payload = get()
                    self.assertEqual((code, payload['status']), (503, 'busy'))
                code, payload = get()
                self.assertEqual(code, 200)
                self.assertEqual(len(payload['items']), 1)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

if __name__ == '__main__':
    unittest.main()
