#!/home/ubuntu/alexa-shopping-reader/.venv/bin/python
"""Refresh the existing Amazon profile without logging list contents."""
from pathlib import Path
from reader import read_list

status = Path('/home/ubuntu/.local/share/alexa-shopping-reader/reconnect-status')
def write(value):
    temp = status.with_suffix('.tmp')
    temp.write_text(value, encoding='utf-8')
    temp.replace(status)

write('running')
try:
    result = read_list()
    write('ok' if result.get('ok') else 'login_required' if result.get('status') == 'login_required' else 'error')
except Exception:
    write('error')
