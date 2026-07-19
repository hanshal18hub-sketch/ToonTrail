import {mkdir,writeFile} from 'node:fs/promises';

const pages=15;
const records=[];
const curated=new Set(['solo leveling','solo leveling: ragnarok','omniscient reader','omniscient reader’s viewpoint','omniscient reader\'s viewpoint','tower of god','true beauty','tomb raider king','latna saga: survival of a sword king','survival story of a sword king','leveling up alone','one piece','chainsaw man','spy x family','spy×family','kaiju no. 8','dandadan','apotheosis','tales of demons and gods','apocalypse online']);
for(let page=0;page<pages;page++){
  const url=new URL('https://kitsu.io/api/edge/manga');
  url.searchParams.set('page[limit]','20');
  url.searchParams.set('page[offset]',String(page*20));
  url.searchParams.set('sort','-userCount');
  url.searchParams.set('include','categories');
  const response=await fetch(url,{headers:{accept:'application/vnd.api+json','user-agent':'ToonTrail catalog maintenance'}});
  if(!response.ok)throw new Error(`Kitsu returned ${response.status} on page ${page+1}`);
  const payload=await response.json();
  const categories=new Map((payload.included||[]).filter(x=>x.type==='categories').map(x=>[x.id,x.attributes?.title||x.attributes?.slug]));
  for(const entry of payload.data||[]){
    const a=entry.attributes||{};
    const subtype=String(a.subtype||'manga').toLowerCase();
    if(!['manga','manhwa','manhua','oneshot'].includes(subtype))continue;
    const genreIds=entry.relationships?.categories?.data||[];
    const names=[a.titles?.en,a.titles?.en_jp,a.canonicalTitle].filter(Boolean).map(x=>String(x).toLowerCase());
    if(names.some(x=>curated.has(x)))continue;
    records.push({
      id:1000000+Number(entry.id),source:'kitsu',sourceId:String(entry.id),
      english:a.titles?.en||a.titles?.en_jp||a.canonicalTitle||'',romaji:a.titles?.en_jp||a.canonicalTitle||'',native:a.titles?.ja_jp||'',
      kind:subtype==='manhwa'?'Manhwa':subtype==='manhua'?'Manhua':'Manga',format:subtype==='oneshot'?'One-shot':'Manga',
      status:a.status==='finished'?'FINISHED':a.status==='current'?'RELEASING':'HIATUS',
      description:String(a.synopsis||a.description||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,5000),
      genres:genreIds.map(x=>categories.get(x.id)).filter(Boolean).slice(0,12),chapters:Number(a.chapterCount)||null,
      cover:a.posterImage?.large||a.posterImage?.medium||a.posterImage?.original||'',score:Math.round(Number(a.averageRating)||0),
      popularity:Math.max(0,100000-(Number(a.popularityRank)||100000)),links:[]
    });
  }
}
await mkdir(new URL('../data/',import.meta.url),{recursive:true});
await writeFile(new URL('../data/catalog-seed.json',import.meta.url),JSON.stringify(records));
console.log(`Wrote ${records.length} catalogue records.`);
