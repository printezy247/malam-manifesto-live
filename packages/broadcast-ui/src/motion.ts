import type { MotionMode } from '../../contracts/src/display.ts';
export function motionDuration(kind:'lowerThird'|'panel'|'scene',mode:MotionMode):number {
  return mode==='standard' ? {lowerThird:300,panel:350,scene:550}[kind] : 0;
}
