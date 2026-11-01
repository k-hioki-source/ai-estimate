'use client';
import type { QuoteItem } from '@/lib/cs-works/formal-quotes';
export default function QuoteItemsEditor({items,onChange}:{items:QuoteItem[];onChange:(items:QuoteItem[])=>void}) {
 function change(i:number,k:keyof QuoteItem,v:string|number){onChange(items.map((x,n)=>n===i?{...x,[k]:v}:x))}
 return <>{items.map((x,i)=><div key={x.item_key} style={{display:'flex',flexWrap:'wrap',gap:10,padding:12,marginTop:10,border:'1px solid #dbe3ec',borderRadius:8,background:'#fff'}}>
 <label>番号<input aria-label={`明細${i+1}の番号`} value={x.number} maxLength={40} onChange={e=>change(i,'number',e.target.value)} style={{display:'block',width:70}}/></label>
 <label style={{flex:'1 1 200px'}}>イラスト名<input aria-label={`明細${i+1}の名前`} value={x.name} maxLength={200} onChange={e=>change(i,'name',e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box'}}/></label>
 <label>金額（税抜・円）<input aria-label={`明細${i+1}の金額`} type="number" min={0} step={1} value={Number.isNaN(x.amount)?'':x.amount} onChange={e=>change(i,'amount',e.target.value===''?NaN:Number(e.target.value))} style={{display:'block',width:140}}/></label>
 <label>工数（時間）<input aria-label={`明細${i+1}の工数`} type="number" min={0} step="0.01" value={Number.isNaN(x.hours)?'':x.hours} onChange={e=>change(i,'hours',e.target.value===''?NaN:Number(e.target.value))} style={{display:'block',width:100}}/></label>
 <label style={{flex:'1 1 100%'}}>制作内容・備考<textarea aria-label={`明細${i+1}の制作内容`} maxLength={2000} value={x.description} onChange={e=>change(i,'description',e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box'}}/></label>
 <button type="button" onClick={()=>onChange(items.filter((_,n)=>n!==i))}>この明細を削除</button></div>)}
 <button type="button" disabled={items.length>=200} onClick={()=>{let n=items.length+1;while(items.some(x=>x.number===String(n).padStart(2,'0')))n++;onChange([...items,{item_key:crypto.randomUUID(),number:String(n).padStart(2,'0'),name:'',description:'',amount:0,hours:0}])}} style={{marginTop:12}}>＋ イラストを追加</button></>;
}
