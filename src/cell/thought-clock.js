// Sensor simulation stays continuous. Model requests use wall-clock deadlines,
// never pulse rate, frame rate, or the number of telemetry samples.
export function createThoughtClock({now=Date.now,eventDelayMs=5000}={}){
 let lastActivity=now();
 return {
  ready({intercom=false,event=false,started=true,connected=true,busy=false,speaking=false,backgroundSeconds=30}={}){
   if(!started||!connected||busy)return false;
   if(intercom)return true;
   if(speaking)return false;
   const delay=event?eventDelayMs:Math.max(10000,Math.min(60000,Number(backgroundSeconds)*1000||30000));
   return now()-lastActivity>=delay;
  },
  began(){lastActivity=now();},
  finished(){lastActivity=now();}
 };
}
