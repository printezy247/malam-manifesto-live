import {makeSnapshot,parseDisplaySnapshot,templateIds,pointLimits,type DisplaySnapshot} from '../packages/contracts/src/display.ts';
export function fixtureFor(templateId:DisplaySnapshot['templateId'],orientation:DisplaySnapshot['orientation']):DisplaySnapshot {
  const base=makeSnapshot();
  const named:Record<string,string[]|undefined>={
    'fight-mode':['Trader A — Scalper','Trader B — Swing'],
    'commentary':['Trader A — Scalper','Trader B — Swing'],
    'trader-focus':['Trader A — Live MT5','Pantau posisi terbuka sekarang'],
    'winner':['Pasukan Malam','Pasukan Fajar'],
    'live-shop':['Demo produk Malam Manifesto','S&K live pagi ini'],
    'manifesto-about':['Fahami pasaran dahulu','Proses berdisiplin','Urus risiko awal','Komuniti malam']};
  return parseDisplaySnapshot({...base,templateId,orientation,content:{...base.content,
    title:templateId.replaceAll('-',' ').replace(/^./,c=>c.toUpperCase()),
    points:(named[templateId]??(['principles-board','poll','qa','board','recap-closing'].includes(templateId)?['Fahami dulu, baru bertindak','Sahkan sebelum menambah saiz','Tetapkan paras invalidasi lebih awal']:['Konsistensi kecil mengalahkan satu keputusan besar','Proses dulu, hasil kemudian','Urus risiko sebelum mengejar pulangan'])).slice(0,pointLimits[templateId].count),
    caption:'Fahami konteks. Fahami proses.',
    link:['resource-card','end-screen'].includes(templateId)?'https://malam-manifesto.example/resources':null,
    chartDescription:'Ruang rakaman untuk carta atau skrin operasi.'}});
}
export const fixtures=templateIds.flatMap(id=>(['portrait'] as const).flatMap(orientation=>{
  const normal=fixtureFor(id,orientation);
  const limit=pointLimits[id];
  const maxPoint='Prinsip perdagangan dan manajemen risiko. '.repeat(4).slice(0,limit.chars);
  return [normal,parseDisplaySnapshot({...normal,content:{...normal.content,title:'Manifesto malam / Night manifesto '.repeat(3).slice(0,80),presenter:'Nama pembentang '.repeat(4).slice(0,60),points:Array(limit.count).fill(maxPoint),caption:'Kapsyen dwibahasa / mixed language caption. '.repeat(6).slice(0,240),disclosure:'Untuk pendidikan sahaja / Educational content only. '.repeat(6).slice(0,240)}}),parseDisplaySnapshot({...normal,content:{...normal.content,presenter:'',points:[],caption:'',chartDescription:''}})];
}));
