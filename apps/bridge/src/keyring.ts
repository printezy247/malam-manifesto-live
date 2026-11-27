import {execFileSync} from 'node:child_process';

type Role = 'control' | 'overlay' | 'obs';

function lookup(role: Role, minimum: number, guidance: string): string {
  try {
    const value = execFileSync('secret-tool',['lookup','application','malam-manifesto-live','role',role],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000}).trim();
    if (value.length < minimum) throw new Error();
    return value;
  } catch {
    // Never echo tool output or the stored value.
    throw new Error(guidance);
  }
}

export function readCredential(role: 'control' | 'overlay'): string {
  return lookup(role,16,'Keyring unavailable or pairing passphrase missing. Run npm run pair:setup in an unlocked desktop session.');
}

export function readObsPassword(): string {
  return lookup('obs',8,'OBS WebSocket password missing from the keyring. Store it with: secret-tool store --label "Malam Manifesto Live obs" application malam-manifesto-live role obs');
}
