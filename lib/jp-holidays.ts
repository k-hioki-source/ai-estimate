/** Japanese national holidays, 2000-2099 (statutory recurring rules and observed holidays).
 * Exceptional one-off holidays (e.g. Olympic rescheduling, imperial ceremonies) are not modeled.
 * For production, reconcile with an official published holiday calendar annually.
 */
const DAY = 86400000;
function utcDate(y:number,m:number,d:number){return new Date(Date.UTC(y,m-1,d));}
function key(d:Date){return d.toISOString().slice(0,10);}
function weekday(y:number,m:number,d:number){return utcDate(y,m,d).getUTCDay();}
function nthMonday(y:number,m:number,n:number){return 1+(8-weekday(y,m,1))%7+7*(n-1);}
function equinox(y:number,autumn:boolean){return Math.floor((autumn?23.2488:20.8431)+0.242194*(y-1980)-Math.floor((y-1980)/4));}
export function isJapaneseNationalHoliday(date:string):boolean {
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if(!m) return false;
  const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
  if(y<2000||y>2099) return false;
  const holidays=new Set<string>();
  const add=(mo:number,da:number)=>holidays.add(key(utcDate(y,mo,da)));
  add(1,1);add(2,11);add(2,23);add(4,29);add(5,3);add(5,4);add(5,5);add(8,11);add(11,3);add(11,23);
  add(1,nthMonday(y,1,2));add(7,nthMonday(y,7,3));add(9,nthMonday(y,9,3));add(10,nthMonday(y,10,2));
  add(3,equinox(y,false));add(9,equinox(y,true));
  // Substitute holidays: Sunday holidays shift to the first following non-holiday.
  for(const h of [...holidays].sort()) {
    const hd=new Date(`${h}T00:00:00Z`);
    if(hd.getUTCDay()!==0) continue;
    let next=new Date(hd.getTime()+DAY);
    while(holidays.has(key(next))) next=new Date(next.getTime()+DAY);
    holidays.add(key(next));
  }
  // Citizens' holiday: weekday between two national holidays.
  const start=utcDate(y,1,1),end=utcDate(y,12,31);
  for(let t=start.getTime()+DAY;t<end.getTime();t+=DAY){
    const d=new Date(t),k=key(d);
    if(!holidays.has(k)&&holidays.has(key(new Date(t-DAY)))&&holidays.has(key(new Date(t+DAY)))) holidays.add(k);
  }
  return holidays.has(date);
}
