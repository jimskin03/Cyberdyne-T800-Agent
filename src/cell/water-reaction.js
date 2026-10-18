// Additive angles: negative hips raise the legs above the cot, knees fold back.
export function waterReaction(t, strength, seed=0) {
 const s=Math.max(0,Math.min(1,strength)),phase=t*(12.5+seed%3)+seed;
 const l=Math.pow((1+Math.sin(phase))/2,2),r=Math.pow((1+Math.sin(phase+Math.PI))/2,2);
 return {hipL:[-1.0*l*s,0,0],hipR:[-1.0*r*s,0,0],kneeL:[.85*l*s,0,0],kneeR:[.85*r*s,0,0],
  torso:[0,Math.sin(t*31)*.035*s,Math.sin(t*39)*.045*s],head:[Math.sin(t*27)*.06*s,Math.sin(t*33)*.10*s,0],
  shL:[-.13*s,0,Math.sin(t*35)*.09*s],shR:[-.13*s,0,-Math.sin(t*37)*.09*s],faL:[-.22*s,0,0],faR:[-.22*s,0,0]};
}
