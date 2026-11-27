export const overlayParts={
  backdrop:'Backdrop',
  media:'Source 1 Frame',
  media2:'Source 2 Frame',
  media3:'Source 3 Frame',
  header:'Header',
  title:'Title',
  main:'Main Graphics',
  caption:'Caption',
  disclosure:'Disclosure',
  versus:'Versus',
  cue:'Live Cue'
} as const;

export type OverlayPart=keyof typeof overlayParts;
export const isOverlayPart=(part:string):part is OverlayPart=>Object.hasOwn(overlayParts,part);
