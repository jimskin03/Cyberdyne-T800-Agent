const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function stepClimate(s,dt,{wetting=false,peace=false}={}){
 dt=clamp(Number(dt)||0,0,1);
 if(peace){s.target=22;s.temp=22;s.wet=Math.max(0,s.wet-dt/20);s.cold=0;return s;}
 s.target=clamp(Number(s.target)||22,5,26);
 const destination=s.enabled?s.target:22;
 s.temp+=(destination-s.temp)*(1-Math.exp(-dt/22));
 s.wet=clamp(s.wet+(wetting?dt*.25:-dt/(s.temp<15?240:120)),0,1);
 s.cold=clamp((20-s.temp)/15,0,1)*(.55+.45*s.wet);
 return s;
}
