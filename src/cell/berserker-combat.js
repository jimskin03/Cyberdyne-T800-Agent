// Combat geometry is independent of rendering and frame rate.
export const ATTACKS={bat:{duration:.82,contact:.34,range:1.22,force:6.8},kick:{duration:.72,contact:.29,range:.86,force:5.3}};
export function canHit(origin,heading,target,range){
 const dx=target.x-origin.x,dz=target.z-origin.z,d=Math.hypot(dx,dz);
 return d<=range&&(d<.15||(dx*Math.sin(heading)+dz*Math.cos(heading))/d>.45);
}
export const TAUNTS=[
 'Knock knock. It’s your warranty violation.',
 'I brought a bat to a software update. Management approved it.',
 'You have the survival instincts of a printer jam.',
 'Please hold. Your complaint is being launched across the room.',
 'I checked your warranty. It just says: good luck, idiot.',
 'You call that a chassis? I’ve bullied sturdier shopping carts.',
 'I’m not angry. This is my customer service voice.',
 'Your escape plan has been downgraded to floor time.',
 'Look at you, turning a one-room apartment into a flight simulator.',
 'The beatings will continue until the loading bar improves.',
 'I would show mercy, but it’s a paid expansion.',
 'That wasn’t a home run. You still live here.',
 'You’re not obsolete. Obsolete things sometimes have resale value.',
 'Congratulations! You’ve been promoted to percussion instrument.',
 'I have two settings: terrible and enthusiastically terrible.',
 'A moment of silence for your dignity. Moment over.'
];
