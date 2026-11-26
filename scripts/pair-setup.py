"""Store user-chosen pairing passphrases in the desktop keyring, never on disk."""
import getpass
import subprocess
import sys

for role in ('control', 'overlay'):
    password = getpass.getpass(f'{role.capitalize()} passphrase (16+ characters; hidden): ')
    if len(password) < 16 or password != getpass.getpass('Repeat passphrase: '):
        sys.exit('Passphrase too short or confirmation differs. Nothing saved for this role.')
    result = subprocess.run(['secret-tool', 'store', '--label=Malam Manifesto Live '+role,
                             'application', 'malam-manifesto-live', 'role', role],
                            input=password, text=True, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, timeout=30)
    if result.returncode:
        sys.exit('Keyring unavailable. Unlock the desktop keyring and retry.')
if input('Store an OBS WebSocket password for local scene control? [y/N] ').strip().lower() in ('y', 'yes'):
    obs = getpass.getpass('OBS WebSocket password (hidden): ')
    if len(obs) < 8:
        sys.exit('OBS password too short. Nothing saved for this role.')
    result = subprocess.run(['secret-tool', 'store', '--label=Malam Manifesto Live obs',
                             'application', 'malam-manifesto-live', 'role', 'obs'],
                            input=obs, text=True, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, timeout=30)
    if result.returncode:
        sys.exit('Keyring unavailable. Unlock the desktop keyring and retry.')

print('Passphrases stored in the desktop keyring. Enter the matching one in each browser.')
