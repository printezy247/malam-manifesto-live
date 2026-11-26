const kind=(location.hash||'#source').slice(1);
document.getElementById('kind').textContent=kind.toUpperCase().replaceAll('-',' ');
const hints={
  chart:'Point a Display or Window Capture at your chart app.',
  camera:'Camera or video capture device goes here.',
  slides:'Use a Media Source for your PDF deck, or a Browser Source to a PDF viewer URL.',
  website:'Point Properties → URL at your site, docs or dashboard.',
  video:'Media file or video capture goes here.',
  game:'Game capture, console capture or NDI feed goes here — retarget in OBS Properties.',
  ndi:'NDI source goes here — set the NDI source name in OBS Properties → NDI Source Name.',
  vdo:'Phone cam via VDO.Ninja — paste the OBS browser-source URL from vdo.ninja into Properties → URL.'
};
document.getElementById('hint').textContent=hints[kind]||document.getElementById('hint').textContent;
