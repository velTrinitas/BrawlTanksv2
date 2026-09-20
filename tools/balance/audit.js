// erf (Abramowitz-Stegun 7.1.26)
function erf(x){const s=Math.sign(x);x=Math.abs(x);const t=1/(1+0.3275911*x);
const y=1-((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return s*y;}
const Phi=x=>0.5*(1+erf(x/Math.SQRT2));

const B={
 twardy:{nm:'Twardy',  hp:400,sp:5.0,dmg:100,rl:400, bs:17,br:6, n:1},
 heavy: {nm:'Pancerny',hp:700,sp:4.0,dmg:75, rl:700, bs:13,br:11,n:2},
 scout: {nm:'Zwiad',   hp:200,sp:7.5,dmg:80, rl:250, bs:27,br:4, n:1},
 sniper:{nm:'Snajper', hp:300,sp:4.5,dmg:300,rl:1000,bs:29,br:4, n:1},
 plasma:{nm:'Tech',    hp:400,sp:5.0,dmg:120,rl:500, bs:17,br:9, n:1},
 pyro:  {nm:'Ogniarz', hp:500,sp:4.8,dmg:50, rl:210, bs:14,br:10,n:3,off:0.2},
 shadow:{nm:'Shadow',  hp:300,sp:6.5,dmg:150,rl:600, bs:19,br:8, n:1},
 king:  {nm:'King',    hp:500,sp:5.5,dmg:200,rl:500, bs:14,br:10,n:1},
};
const SUPER={twardy:3*300,heavy:2*450+225,scout:2*200*2,plasma:3*300,king:3*300,sniper:2*450,pyro:5*160,shadow:3*300};
const ER=30, ES=2.25;
const RANGES=[[150,.30],[300,.45],[500,.25]];
const mob=s=>s<=3?1.05:s<=4?0.95:s<=5?0.80:s<=7?0.72:0.68;
function hitp(d,bs,br,lat=0){const R=ER+br;const aim=25+0.06*d;const lead=0.5*ES*(d/bs);
 const sig=Math.hypot(aim,lead);return Phi((R-lat)/sig)-Phi((-R-lat)/sig);}

const rows=[];
for(const k in B){const b=B[k];
 const raw=b.dmg*b.n*1000/b.rl; let eff=0; const pr={};
 for(const [d,w] of RANGES){let ds=0;
  for(let i=0;i<b.n;i++){const lat=b.n===3?Math.abs(i-1)*Math.sin(b.off)*d:0; ds+=b.dmg*hitp(d,b.bs,b.br,lat);}
  const dps=ds*1000/b.rl; pr[d]=dps; eff+=w*dps;}
 const ms=b.sp*mob(b.sp);
 const ehp=b.hp*(0.55+0.45*(ms/4.0));
 rows.push({k,b,raw,pr,eff,ms,ehp});}
rows.sort((a,z)=>z.eff-a.eff);
const p=(s,n)=>String(s).padStart(n);
console.log('CZOLG      HP  SPD  mob DPSraw  @150  @300  @500 DPSeff   EHP hitR TTK300 boss_s SUPER');
for(const r of rows){const b=r.b;
 console.log(b.nm.padEnd(9)+p(b.hp,4)+p(b.sp.toFixed(1),5)+p(r.ms.toFixed(1),5)+p(r.raw.toFixed(0),7)
 +p(r.pr[150].toFixed(0),6)+p(r.pr[300].toFixed(0),6)+p(r.pr[500].toFixed(0),6)+p(r.eff.toFixed(0),7)
 +p(r.ehp.toFixed(0),6)+p(ER+b.br,5)+p((300/r.eff).toFixed(2),7)+p((3000/r.eff).toFixed(1),7)+p(SUPER[r.k],6));}

console.log('\nOgniarz: pelna salwa 3 pociski tylko do d = '+Math.round((ER+10)/Math.sin(0.2))+'px; dalej 1 pocisk = 50 dmg');
console.log('\nTrwalosc wejsciowa (pocisk wroga 100 / taran 200):');
for(const k in B){const b=B[k];console.log(b.nm.padEnd(9)+' pociskow: '+p(Math.ceil(b.hp/100),2)+'   taranow: '+(b.hp/200).toFixed(1));}
console.log('\nOkno SUPER 5s:');
for(const k in B){const b=B[k];const sh=5000/b.rl;
 console.log(b.nm.padEnd(9)+' salw: '+p(sh.toFixed(1),4)+'  dmg/salwa: '+p(SUPER[k],4)+'  total: '+p((sh*SUPER[k]).toFixed(0),6));}
