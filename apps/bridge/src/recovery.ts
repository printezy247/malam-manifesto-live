import {loadSnapshot} from './persistence.ts';

export type RecoveryReport = {
  recovered: boolean;
  reason: 'clean' | 'backup' | 'unreadable' | 'empty';
  revision: number | null;
};

// Operator-facing, sanitized view of durable state. It exposes no paths,
// credentials or raw parse errors and is safe to include in a local status log.
export function inspectRecovery(file: string): RecoveryReport {
  const {snapshot,recovered} = loadSnapshot(file);
  if (snapshot) return {recovered,reason:recovered ? 'backup' : 'clean',revision:snapshot.revision};
  if (recovered) return {recovered:true,reason:'unreadable',revision:null};
  return {recovered:false,reason:'empty',revision:null};
}
