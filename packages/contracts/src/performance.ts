import type {MotionMode} from './display.ts';

export type PerformanceTier = 'static' | 'standard' | 'enhanced';

export type PerformanceProfile = {
  tier: PerformanceTier;
  // Decorative motion and asset quality are the only things a profile changes.
  // Scene content, disclosures and point accuracy are never downgraded.
  decorativeMotion: boolean;
  assetQuality: 'low' | 'standard' | 'high';
  cueLimit: number;
  pollingMs: number | null;
  className: string;
};

const profiles: Record<PerformanceTier,PerformanceProfile> = {
  static: {tier:'static',decorativeMotion:false,assetQuality:'low',cueLimit:20,pollingMs:null,className:'perf-static'},
  standard: {tier:'standard',decorativeMotion:true,assetQuality:'standard',cueLimit:20,pollingMs:1000,className:'perf-standard'},
  enhanced: {tier:'enhanced',decorativeMotion:true,assetQuality:'high',cueLimit:20,pollingMs:1000,className:'perf-enhanced'}
};

export function getPerformanceProfile(tier: PerformanceTier): PerformanceProfile {
  const profile = profiles[tier];
  if (!profile) throw new TypeError('Unsupported performance tier');
  return profile;
}

export function profileForMotion(mode: MotionMode): PerformanceProfile {
  return getPerformanceProfile(mode === 'static' ? 'static' : mode === 'low' ? 'standard' : 'enhanced');
}

// An inactive scene must stop polling and decorative work instead of keeping
// timers alive in the background. Reuse the immutable profile when active.
export function profileWhenActive(profile: PerformanceProfile, active: boolean): PerformanceProfile {
  if (active) return profile;
  return {...profile,decorativeMotion:false,pollingMs:null,assetQuality:'low'};
}
