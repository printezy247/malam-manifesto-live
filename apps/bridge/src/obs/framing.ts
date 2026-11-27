import type {SourceRect} from '../../../../packages/templates/src/layouts.ts';

export function captureTransform(box:SourceRect,fit:'fit'|'fill'|'stretch') {
  return {
    positionX:box.x,positionY:box.y,alignment:5,rotation:0,scaleX:1,scaleY:1,
    cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,
    boundsType:fit==='fill'?'OBS_BOUNDS_SCALE_OUTER':fit==='stretch'?'OBS_BOUNDS_STRETCH':'OBS_BOUNDS_SCALE_INNER',
    boundsAlignment:0,boundsWidth:box.width,boundsHeight:box.height,cropToBounds:fit==='fill'
  };
}
