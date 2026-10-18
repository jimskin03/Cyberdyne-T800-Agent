// Renderer-free definition of the stable cell coordinate system and navigation metadata.
// World units are metres; north is -z and south is +z.
export const S=.38;
export const ROOM=Object.freeze({x0:-2.5,x1:2.5,z0:-2,z1:2,h:3});
export const FEATURES=Object.freeze({
 window:{name:'the barred window',look:[.3,1.55,-2.1],stand:[.3,-1.45],desc:'a barred window in the north wall, sill at chest height'},
 door:{name:'the steel door',look:[2.5,1.55,.6],stand:[1.95,.6],desc:'heavy steel door with a small barred viewport and a food slot'},
 bed:{name:'the bed',look:[-2.05,.5,-.85],stand:[-1.3,-.8],seat:[-1.98,-.75],seatH:.47,desc:'a narrow steel cot with a thin mattress, along the west wall'},
 table:{name:'the table',look:[1.75,.78,-1.4],stand:[1.2,-.6],desc:'a small bolted-down table in the north-east corner'},
 computer:{name:'the CRT computer',look:[1.8,.97,-1.37],stand:[1.2,-.55],seat:[1.75,-.72],seatH:.47,face:Math.PI,desc:'an old CRT computer with a keyboard on the table; you can write programs and notes on it'},
 stool:{name:'the stool',look:[1.75,.45,-.75],stand:[1.2,-.55],seat:[1.75,-.72],seatH:.47,face:Math.PI,desc:'a bolted stool in front of the table'},
 sink:{name:'the sink',look:[.4,.85,1.8],stand:[.4,1.3],desc:'a steel sink with a push tap on the south wall'},
 mirror:{name:'the steel mirror',look:[.4,1.72,2],stand:[.4,1.3],desc:'a polished steel mirror above the sink'},
 chalk_wall:{name:'the chalk wall',look:[-1.55,1.45,2],stand:[-1.55,1.42],desc:'a bare stretch of the south wall you can write on with chalk'},
 plant:{name:'the potted plant',look:[-.6,.35,-1.75],stand:[-.6,-1.2],desc:'a small, slightly wilted potted plant under the window'},
 hatch:{name:'the ceiling hatch',look:[.6,3,.3],stand:[.6,.3],desc:'a square hatch in the ceiling; the tool arm comes out of it'},
 camera:{name:'the security camera',look:[-2.35,2.72,1.85],stand:[-1.5,1.1],desc:'a camera in the south-west corner, red light on: the audience watches through it'},
 drain:{name:'the floor drain',look:[0,0,.3],stand:[0,.85],desc:'a floor drain in the middle of the cell'},
 center:{name:'the middle of the cell',look:[0,1.2,.2],stand:[0,.2],desc:'open floor'},
 corner_se:{name:'the south-east corner',look:[2.5,1,2],stand:[2.15,1.62],desc:'an empty corner'},
 corner_sw:{name:'the south-west corner',look:[-2.5,1,2],stand:[-2.15,1.62],desc:'an empty corner under the camera'},
});
export const RECTS=Object.freeze([{x0:-2.5,x1:-1.62,z0:-1.9,z1:.2,h:.47,id:'bed'},{x0:1.22,x1:2.28,z0:-1.73,z1:-1.07,h:.755,id:'table'},{x0:.12,x1:.68,z0:1.62,z1:2,h:.86,id:'sink'}]);
export const CIRCLES=Object.freeze([{x:1.75,z:-.72,r:.2,h:.47,id:'stool'},{x:-.6,z:-1.75,r:.2,h:.32,id:'plant'}]);
