// Emberwrath – Bosskino der Startseite (Abschnitt #bosse; Bilder und Maße aus tools/bosskino.mjs).
// Eine breite Bühne zeigt die vier Bosse nacheinander, jeden riesig in seinem Gebiet: Ebenen mit Parallaxe in ganzen
// Szenenpixeln, Ruhe aus Teilen mit eigenen Zyklen, dann seine Signatur-Attacke: gestufte Warnmarke am Boden → Ausholen →
// Halten → Einschlag (1 Szenenpixel Erschütterung) → Effekt durch die Bodenfugen und den Raum → Ausklingen.
// Eine Pixelgröße für alles: d Gerätepixel je Szenenpixel (ganzzahlig). Wechsel als Ascheauflösung in Blöcken.
// Die Bildatlanten werden erst geladen, wenn der Abschnitt naht; die Schleife läuft nur, solange die Bühne sichtbar ist.
// Ohne JavaScript bleibt das Standbild (Malgareth); bei reduzierter Bewegung keine Wiedergabe, ein Klick zeigt das
// Standbild des gewählten Bosses.
(() => {
  const root = document.querySelector('[data-kino]');
  const stage = root?.querySelector('.kino-buehne');
  const poster = stage?.querySelector('img');
  if (!root || !stage || !poster) return;
  // <bosskino.mjs> – von tools/bosskino.mjs geschrieben, nicht von Hand ändern
  const META = {"szene":{"W":560,"H":216,"FY":190},"bosse":{"malgareth":{"name":"malgareth","glut":["#fff2c0","#ffb648","#c8420c"],"fokus":[300,330],"fig":{"x":233,"y":-4,"w":244,"h":198},"ruhe":[{"r":"hinten","n":8,"ms":170},{"r":"koerper","seq":[0,0,0,1,1,1],"ms":240},{"r":"krone","n":6,"ms":100,"dy":[0,-1],"von":"koerper"},{"r":"flamme","n":6,"ms":100},{"r":"klinge","n":1,"ms":1000}],"moment":{"f":[[0,130],[1,90],[2,90],[3,100],[4,100],[5,100],[6,100],[7,100],[8,100],[9,70],[10,100],[11,100],[12,100],[13,100],[14,100],[15,100],[16,100],[17,300],[18,220]],"hit":10},"warn":{"x0":8,"x1":266,"y":187,"h":7,"dir":-1,"vor":700,"c":["#7a1a08","#c8420c","#ffb648"]},"ereignisse":[{"k":"bild","r":"welle","at":0,"x":0,"y":187,"w":279,"h":29,"n":31,"ms":60,"z":"boden"},{"k":"bild","r":"blitz","at":0,"x":260,"y":172,"w":25,"h":22,"n":4,"ms":60,"quer":true,"z":"vorn"},{"k":"wand","r":"wand","r2":"wand2","r3":"wand3","at":40,"x":266,"y":193,"dir":-1,"v":200,"weg":282,"w":44,"h":72,"w2":26,"h2":40,"w3":16,"h3":22,"n":6,"ms":80,"abst":7,"nach":620,"z":"vorn"},{"k":"funken","at":0,"x":272,"y":188,"n":28,"r":4,"vx":50,"vy":120,"g":280,"c":["#fff2c0","#ffb648","#e8641a","#a8300a"]},{"k":"funken","at":0,"x":272,"y":189,"n":18,"r":8,"vx":34,"vy":45,"g":80,"c":["#6a5040","#4e3a30","#3a2a24"]}],"schalen":[[70,131],[436,131]],"schale":{"w":16,"h":20,"n":6,"ms":90},"schaleNach":"mitte-glut","teilchen":"asche","dichte":2.2,"nach":"boden-glut","dauer":9.5,"start":2.4,"layers":[{"name":"fern","x":0,"y":0,"f":0.15,"r":[279,0,560,216]},{"name":"fern-glut","x":286,"y":0,"f":0.15,"glow":{"per":3.6,"lo":0.55,"steps":3},"r":[0,1295,169,161]},{"name":"mitte","x":0,"y":0,"f":0.45,"r":[839,0,560,216]},{"name":"mitte-glut","x":73,"y":149,"f":0.45,"glow":{"per":4.1,"lo":0.66,"steps":3},"r":[433,1295,377,66]},{"name":"boden","x":0,"y":186,"f":1,"r":[966,1295,560,30]},{"name":"boden-glut","x":230,"y":187,"f":1,"glow":{"per":3.4,"lo":0.6,"steps":3},"r":[1526,1295,244,22]},{"name":"vorn","x":0,"y":0,"f":1.35,"r":[1399,0,560,216]}],"figur":{"fx":119,"fy":194,"r":{"hinten":[1959,0,1952,198],"koerper":[3911,0,488,198],"krone":[0,899,1464,198],"flamme":[1464,899,1464,198],"klinge":[2928,899,244,198],"moment":[0,1097,4636,198]}},"fxr":{"welle":[0,0,279,899],"wand":[169,1295,264,72],"wand2":[810,1295,156,40],"wand3":[1770,1295,96,22],"schale":[1966,1295,96,20],"blitz":[1866,1295,100,22]}},"ulgrim":{"glut":["#e8fff8","#7ef0d6","#127272"],"fokus":[310,334],"teilchen":"geist","dichte":3,"dauer":9,"start":2.2,"name":"ulgrim","fig":{"x":239,"y":-22,"w":214,"h":213},"ruhe":[{"n":8,"ms":180,"r":"koerper"}],"moment":{"f":[[0,140],[1,110],[2,70],[3,140],[4,110],[5,104],[6,104],[7,104],[8,104],[9,104],[10,107],[11,107],[12,107],[13,107],[14,107],[15,107],[16,300],[17,200]],"hit":10},"nach":"boden-glut","ereignisse":[{"k":"bild","r":"welle","at":0,"x":0,"y":188,"w":335,"h":28,"n":38,"ms":60,"z":"boden"},{"k":"bild","r":"blitz","at":0,"x":316,"y":172,"w":25,"h":22,"n":4,"ms":60,"quer":true,"z":"vorn"},{"k":"funken","at":0,"x":328,"y":188,"n":26,"r":4,"vx":40,"vy":110,"g":240,"c":["#e8fff8","#7ef0d6","#22b0a4","#127272"]},{"k":"funken","at":0,"x":328,"y":189,"n":16,"r":8,"vx":30,"vy":40,"g":80,"c":["#4a5a62","#323e46","#232c32"]},{"k":"bild","r":"geist","at":66,"x":299,"y":146,"w":18,"h":46,"n":18,"ms":70,"quer":true,"loop":6,"z":"vorn"},{"k":"bild","r":"geist2","at":153,"x":276,"y":166,"w":12,"h":26,"n":18,"ms":70,"quer":true,"loop":6,"z":"vorn"},{"k":"bild","r":"geist","at":240,"x":247,"y":146,"w":18,"h":46,"n":18,"ms":70,"quer":true,"loop":6,"z":"vorn"},{"k":"bild","r":"geist2","at":326,"x":224,"y":168,"w":12,"h":26,"n":18,"ms":70,"quer":true,"loop":6,"z":"vorn"},{"k":"bild","r":"geist","at":413,"x":195,"y":147,"w":18,"h":46,"n":18,"ms":70,"quer":true,"loop":6,"z":"vorn"},{"k":"bild","r":"geist2","at":500,"x":172,"y":171,"w":12,"h":26,"n":18,"ms":70,"quer":true,"loop":6,"z":"vorn"},{"k":"bild","r":"geist","at":586,"x":143,"y":152,"w":18,"h":46,"n":18,"ms":70,"quer":true,"loop":6,"z":"vorn"},{"k":"bild","r":"geist2","at":673,"x":120,"y":167,"w":12,"h":26,"n":18,"ms":70,"quer":true,"loop":6,"z":"vorn"},{"k":"bild","r":"geist","at":760,"x":91,"y":145,"w":18,"h":46,"n":18,"ms":70,"quer":true,"loop":6,"z":"vorn"},{"k":"bild","r":"geist2","at":846,"x":68,"y":165,"w":12,"h":26,"n":18,"ms":70,"quer":true,"loop":6,"z":"vorn"},{"k":"bild","r":"geist","at":933,"x":39,"y":144,"w":18,"h":46,"n":18,"ms":70,"quer":true,"loop":6,"z":"vorn"},{"k":"bild","r":"geist2","at":1020,"x":16,"y":164,"w":12,"h":26,"n":18,"ms":70,"quer":true,"loop":6,"z":"vorn"}],"schalen":[[84,131],[254,131],[522,129]],"schale":{"w":16,"h":22,"n":6,"ms":90},"schaleNach":"mitte-glut","warn":{"x0":14,"x1":324,"y":187,"h":7,"dir":-1,"vor":600,"c":["#0b3a40","#127272","#7ef0d6"]},"layers":[{"name":"fern","x":0,"y":0,"f":0.15,"r":[335,0,560,216]},{"name":"fern-glut","x":91,"y":32,"f":0.15,"glow":{"per":2.7,"lo":0.5,"steps":3},"r":[560,1277,441,138]},{"name":"mitte","x":0,"y":28,"f":0.45,"r":[0,1277,560,188]},{"name":"mitte-glut","x":56,"y":114,"f":0.45,"glow":{"per":3.3,"lo":0.45,"steps":3},"r":[1557,1277,492,49]},{"name":"boden","x":0,"y":186,"f":1,"r":[2157,1277,560,30]},{"name":"boden-glut","x":321,"y":187,"f":1,"glow":{"per":2.9,"lo":0.4,"steps":3},"r":[2985,1277,83,15]},{"name":"vorn","x":4,"y":164,"f":1.35,"r":[1001,1277,556,52]}],"figur":{"r":{"koerper":[895,0,1712,213],"moment":[0,1064,3852,213]}},"fxr":{"welle":[0,0,335,1064],"geist":[2049,1277,108,46],"geist2":[2717,1277,72,26],"blitz":[2789,1277,100,22],"schale":[2889,1277,96,22]}},"faeulnis":{"glut":["#f4ffd8","#b4f478","#22882e"],"fokus":[300,332],"teilchen":"sporen","dichte":3.4,"dauer":9.5,"start":2.2,"name":"faeulnis","fig":{"x":231,"y":-9,"w":338,"h":200},"ruhe":[{"n":6,"ms":150,"r":"arm-h"},{"n":8,"ms":170,"r":"koerper"},{"n":6,"ms":150,"r":"arm-v"}],"moment":{"f":[[0,120],[1,110],[2,130],[3,130],[4,130],[5,130],[6,70],[7,130],[8,130],[9,130],[10,130],[11,130],[12,130],[13,200],[14,200],[15,220]],"hit":7},"nach":"boden-glut","ereignisse":[{"k":"bild","r":"welle","at":0,"x":0,"y":188,"w":259,"h":28,"n":37,"ms":60,"z":"boden"},{"k":"bild","r":"blitz","at":0,"x":240,"y":172,"w":25,"h":22,"n":4,"ms":60,"quer":true,"z":"vorn"},{"k":"funken","at":0,"x":252,"y":188,"n":22,"r":6,"vx":40,"vy":90,"g":200,"c":["#f4ffd8","#b4f478","#5ad040","#22882e"]},{"k":"funken","at":0,"x":252,"y":189,"n":16,"r":8,"vx":30,"vy":40,"g":80,"c":["#605234","#443a24","#2c2618"]},{"k":"bild","r":"dorn","at":100,"x":206,"y":114,"w":40,"h":78,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":180,"x":226,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#605234","#443a24","#3a682a"]},{"k":"bild","r":"dorn2","at":215,"x":181,"y":139,"w":30,"h":54,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":295,"x":196,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#605234","#443a24","#3a682a"]},{"k":"bild","r":"wolke","at":355,"x":156,"y":128,"w":80,"h":64,"n":11,"ms":100,"quer":true,"z":"vorn"},{"k":"funken","at":275,"x":196,"y":184,"n":10,"r":6,"vx":18,"vy":30,"g":0,"c":["#f4ffd8","#b4f478","#5ad040","#22882e"]},{"k":"bild","r":"dorn","at":330,"x":146,"y":116,"w":40,"h":78,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":410,"x":166,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#605234","#443a24","#3a682a"]},{"k":"bild","r":"dorn2","at":446,"x":121,"y":138,"w":30,"h":54,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":526,"x":136,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#605234","#443a24","#3a682a"]},{"k":"bild","r":"wolke","at":586,"x":96,"y":128,"w":80,"h":64,"n":11,"ms":100,"quer":true,"z":"vorn"},{"k":"funken","at":506,"x":136,"y":184,"n":10,"r":6,"vx":18,"vy":30,"g":0,"c":["#f4ffd8","#b4f478","#5ad040","#22882e"]},{"k":"bild","r":"dorn","at":561,"x":86,"y":115,"w":40,"h":78,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":641,"x":106,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#605234","#443a24","#3a682a"]},{"k":"bild","r":"dorn2","at":676,"x":61,"y":140,"w":30,"h":54,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":756,"x":76,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#605234","#443a24","#3a682a"]},{"k":"bild","r":"wolke","at":816,"x":36,"y":128,"w":80,"h":64,"n":11,"ms":100,"quer":true,"z":"vorn"},{"k":"funken","at":736,"x":76,"y":184,"n":10,"r":6,"vx":18,"vy":30,"g":0,"c":["#f4ffd8","#b4f478","#5ad040","#22882e"]},{"k":"bild","r":"dorn","at":792,"x":26,"y":114,"w":40,"h":78,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":872,"x":46,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#605234","#443a24","#3a682a"]},{"k":"bild","r":"dorn2","at":907,"x":1,"y":139,"w":30,"h":54,"n":9,"ms":80,"quer":true,"z":"vorn"},{"k":"funken","at":987,"x":16,"y":188,"n":8,"r":5,"vx":26,"vy":60,"g":220,"c":["#605234","#443a24","#3a682a"]},{"k":"bild","r":"wolke","at":1047,"x":-24,"y":128,"w":80,"h":64,"n":11,"ms":100,"quer":true,"z":"vorn"},{"k":"funken","at":967,"x":16,"y":184,"n":10,"r":6,"vx":18,"vy":30,"g":0,"c":["#f4ffd8","#b4f478","#5ad040","#22882e"]}],"warn":{"x0":12,"x1":248,"y":187,"h":7,"dir":-1,"vor":650,"c":["#0e4a1c","#22882e","#b4f478"]},"layers":[{"name":"fern","x":0,"y":0,"f":0.15,"r":[259,0,560,216]},{"name":"fern-glut","x":0,"y":1,"f":0.15,"glow":{"per":3.4,"lo":0.45,"steps":3},"r":[0,1436,559,131]},{"name":"mitte","x":0,"y":97,"f":0.45,"r":[559,1436,560,119]},{"name":"mitte-glut","x":6,"y":134,"f":0.45,"glow":{"per":2.9,"lo":0.4,"steps":3},"r":[3745,1436,502,27]},{"name":"boden","x":0,"y":186,"f":1,"r":[3185,1436,560,30]},{"name":"boden-glut","x":46,"y":194,"f":1,"glow":{"per":2.6,"lo":0.4,"steps":3},"r":[4347,1436,435,17]},{"name":"vorn","x":0,"y":174,"f":1.35,"r":[2629,1436,556,42]}],"figur":{"r":{"arm-h":[819,0,2028,200],"koerper":[0,1036,2704,200],"arm-v":[2704,1036,2028,200],"moment":[0,1236,5408,200]}},"fxr":{"blitz":[4247,1436,100,22],"dorn":[1119,1436,360,78],"dorn2":[2359,1436,270,54],"wolke":[1479,1436,880,64],"welle":[0,0,259,1036]}},"skalvyr":{"glut":["#ffffff","#9aeefc","#34b8e4"],"fokus":[292,322],"teilchen":"schnee","dichte":5,"dauer":9.5,"start":2.2,"name":"skalvyr","fig":{"x":201,"y":3,"w":356,"h":188},"ruhe":[{"n":12,"ms":150,"r":"koerper"}],"moment":{"f":[[0,150],[1,170],[2,90],[3,100],[4,100],[5,100],[6,100],[7,100],[8,100],[9,120],[10,120],[11,120],[12,140],[13,160],[14,180],[15,160]],"hit":3},"nach":"boden-glut","ereignisse":[{"k":"bild","r":"welle","at":860,"x":0,"y":187,"w":560,"h":29,"n":37,"ms":70,"z":"boden"},{"k":"bild","r":"reif","at":900,"x":272,"y":185,"w":40,"h":9,"n":8,"ms":230,"quer":true,"z":"boden"},{"k":"bild","r":"reif","at":1050,"x":216,"y":185,"w":40,"h":9,"n":8,"ms":230,"quer":true,"z":"boden"},{"k":"bild","r":"reif","at":1200,"x":158,"y":185,"w":40,"h":9,"n":8,"ms":230,"quer":true,"z":"boden"},{"k":"bild","r":"reif","at":1350,"x":102,"y":185,"w":40,"h":9,"n":8,"ms":230,"quer":true,"z":"boden"},{"k":"bild","r":"reif","at":1500,"x":46,"y":185,"w":40,"h":9,"n":8,"ms":230,"quer":true,"z":"boden"},{"k":"bild","r":"reif","at":1650,"x":244,"y":185,"w":40,"h":9,"n":8,"ms":230,"quer":true,"z":"boden"},{"k":"bild","r":"reif","at":1800,"x":186,"y":185,"w":40,"h":9,"n":8,"ms":230,"quer":true,"z":"boden"},{"k":"bild","r":"reif","at":1950,"x":128,"y":185,"w":40,"h":9,"n":8,"ms":230,"quer":true,"z":"boden"},{"k":"bild","r":"reif","at":2100,"x":74,"y":185,"w":40,"h":9,"n":8,"ms":230,"quer":true,"z":"boden"},{"k":"bild","r":"reif","at":2250,"x":18,"y":185,"w":40,"h":9,"n":8,"ms":230,"quer":true,"z":"boden"},{"k":"zapfen","r":"zapfen","r2":"splitter","at":860,"x":292,"y":190,"vor":720,"w":15,"h":50,"n":8,"ms":60,"sw":72,"sh":46,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen","r2":"splitter","at":1010,"x":236,"y":190,"vor":720,"w":15,"h":50,"n":8,"ms":60,"sw":72,"sh":46,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen","r2":"splitter","at":1160,"x":178,"y":190,"vor":720,"w":15,"h":50,"n":8,"ms":60,"sw":72,"sh":46,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen","r2":"splitter","at":1310,"x":122,"y":190,"vor":720,"w":15,"h":50,"n":8,"ms":60,"sw":72,"sh":46,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen","r2":"splitter","at":1460,"x":66,"y":190,"vor":720,"w":15,"h":50,"n":8,"ms":60,"sw":72,"sh":46,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen","r2":"splitter","at":1610,"x":264,"y":190,"vor":720,"w":15,"h":50,"n":8,"ms":60,"sw":72,"sh":46,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen","r2":"splitter","at":1760,"x":206,"y":190,"vor":720,"w":15,"h":50,"n":8,"ms":60,"sw":72,"sh":46,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen","r2":"splitter","at":1910,"x":148,"y":190,"vor":720,"w":15,"h":50,"n":8,"ms":60,"sw":72,"sh":46,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen","r2":"splitter","at":2060,"x":94,"y":190,"vor":720,"w":15,"h":50,"n":8,"ms":60,"sw":72,"sh":46,"mr":1,"z":"vorn"},{"k":"zapfen","r":"zapfen","r2":"splitter","at":2210,"x":38,"y":190,"vor":720,"w":15,"h":50,"n":8,"ms":60,"sw":72,"sh":46,"mr":1,"z":"vorn"},{"k":"bild","r":"marke","at":140,"x":269,"y":182,"w":46,"h":15,"n":10,"ms":72,"quer":true,"z":"boden"},{"k":"bild","r":"marke","at":290,"x":213,"y":182,"w":46,"h":15,"n":10,"ms":72,"quer":true,"z":"boden"},{"k":"bild","r":"marke","at":440,"x":155,"y":182,"w":46,"h":15,"n":10,"ms":72,"quer":true,"z":"boden"},{"k":"bild","r":"marke","at":590,"x":99,"y":182,"w":46,"h":15,"n":10,"ms":72,"quer":true,"z":"boden"},{"k":"bild","r":"marke","at":740,"x":43,"y":182,"w":46,"h":15,"n":10,"ms":72,"quer":true,"z":"boden"},{"k":"bild","r":"marke","at":890,"x":241,"y":182,"w":46,"h":15,"n":10,"ms":72,"quer":true,"z":"boden"},{"k":"bild","r":"marke","at":1040,"x":183,"y":182,"w":46,"h":15,"n":10,"ms":72,"quer":true,"z":"boden"},{"k":"bild","r":"marke","at":1190,"x":125,"y":182,"w":46,"h":15,"n":10,"ms":72,"quer":true,"z":"boden"},{"k":"bild","r":"marke","at":1340,"x":71,"y":182,"w":46,"h":15,"n":10,"ms":72,"quer":true,"z":"boden"},{"k":"bild","r":"marke","at":1490,"x":15,"y":182,"w":46,"h":15,"n":10,"ms":72,"quer":true,"z":"boden"},{"k":"funken","at":60,"x":300,"y":10,"n":9,"r":14,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":130,"x":200,"y":10,"n":9,"r":14,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":200,"x":110,"y":10,"n":9,"r":14,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":270,"x":250,"y":10,"n":9,"r":14,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":340,"x":40,"y":10,"n":9,"r":14,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]},{"k":"funken","at":410,"x":160,"y":10,"n":9,"r":14,"vx":6,"vy":-30,"g":140,"c":["#ffffff","#9aeefc","#34b8e4","#1670a0"]}],"warn":null,"layers":[{"name":"fern","x":0,"y":0,"f":0.15,"r":[560,0,560,216]},{"name":"fern-glut","x":264,"y":7,"f":0.15,"glow":{"per":3.8,"lo":0.55,"steps":3},"r":[0,1449,110,171]},{"name":"mitte","x":0,"y":0,"f":0.45,"r":[1120,0,560,216]},{"name":"mitte-glut","x":6,"y":0,"f":0.45,"glow":{"per":3.1,"lo":0.5,"steps":3},"r":[110,1449,525,171]},{"name":"boden","x":0,"y":186,"f":1,"r":[1226,1449,560,30]},{"name":"boden-glut","x":341,"y":192,"f":1,"glow":{"per":3.3,"lo":0.4,"steps":3},"r":[2246,1449,102,10]},{"name":"vorn","x":0,"y":0,"f":1.35,"r":[1680,0,560,216]}],"figur":{"r":{"koerper":[0,1073,4272,188],"moment":[0,1261,5696,188]}},"fxr":{"zapfen":[635,1449,15,50],"splitter":[650,1449,576,46],"marke":[1786,1449,460,15],"reif":[2348,1449,320,9],"welle":[0,0,560,1073]}}}};
  // </bosskino.mjs>
  if (!META) return;
  const S = META.szene;
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const texts = [...root.querySelectorAll('[data-text]')];
  const ORDER = tabs.map((t) => t.dataset.boss).filter((n) => META.bosse[n]);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia('(max-width: 820px)');
  const IMG = new URL('img/', document.querySelector('link[rel="icon"]')?.href ?? location.href).href;
  let cur = Math.max(0, ORDER.indexOf('malgareth'));

  // ---------- Auswahl (Reiter): Klick, Pfeiltasten, Pos1/Ende
  const mark = (i) => {
    tabs.forEach((t) => {
      const on = t.dataset.boss === ORDER[i];
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      t.classList.toggle('on', on);
      if (on) stage.setAttribute('aria-labelledby', t.id);
    });
    texts.forEach((p) => { p.hidden = p.dataset.text !== ORDER[i]; });
  };
  mark(cur);
  tabs.forEach((t) => {
    t.addEventListener('click', () => pick(ORDER.indexOf(t.dataset.boss), true));
    t.addEventListener('keydown', (e) => {
      const i = ORDER.indexOf(t.dataset.boss);
      const j = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: ORDER.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      const k = (j + ORDER.length) % ORDER.length;
      tabs.find((q) => q.dataset.boss === ORDER[k])?.focus();
      pick(k, true);
    });
  });

  // ---------- Ausschnitt: Bühne in Gerätepixeln, d ganzzahlig; die Szene füllt die Breite, Fokus auf dem Boss
  let dpr = 1, cw = 0, ch = 0, d = 1, vw = 0, vh = 0, camX = 0, camY = 0;
  const layout = (m) => {
    dpr = devicePixelRatio || 1;
    cw = stage.clientWidth; ch = stage.clientHeight;
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    d = Math.max(1, Math.round(H / (narrow.matches ? 184 : 200)));
    while (S.W * d < W + 12 * d) d++;
    vw = W / d; vh = H / d;
    const fx = m.fokus[narrow.matches ? 1 : 0];
    camX = Math.max(6, Math.min(S.W - 6 - Math.ceil(vw), Math.round(fx - vw / 2)));
    camY = Math.max(0, Math.min(S.H - Math.ceil(vh), Math.round(S.FY + 18 - vh)));
  };
  const placePoster = () => {
    layout(META.bosse[ORDER[cur]]);
    Object.assign(poster.style, { width: `${(S.W * d) / dpr}px`, height: `${(S.H * d) / dpr}px`, left: `${(-camX * d) / dpr}px`, top: `${(-camY * d) / dpr}px` });
  };
  placePoster();
  let live = null;   // gesetzt, sobald das Canvas zeichnet
  addEventListener('resize', () => (live ? live.size() : placePoster()));

  // ---------- Bilder: ein Atlas je Boss, erst bei Bedarf
  const atlases = {};
  const load = (n) => (atlases[n] ??= new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = `${IMG}bosskino-${n}.webp`; }));
  const conn = navigator.connection;
  const lean = conn && (conn.saveData || /(^|-)2g/.test(conn.effectiveType ?? ''));
  let wanted = false;
  const want = () => {
    if (wanted || lean) return; wanted = true;
    load(ORDER[cur]).then(() => start(), () => {});
  };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { want(); o.disconnect(); } }, { rootMargin: '900px 0px' }).observe(stage);
  }

  let pick = (i, user) => {
    // vor dem Start (oder ohne Atlas): nur Auswahl merken; das Standbild bleibt Malgareth, bis das Canvas zeichnet
    cur = i; mark(i);
    if (!lean) { wanted = false; want(); }
  };

  function start() {
    if (live) return;
    const cv = document.createElement('canvas');
    cv.className = 'kino-live'; cv.setAttribute('aria-hidden', 'true');
    stage.append(cv);
    const ctx = cv.getContext('2d');
    const rnd = (a, b) => a + Math.random() * (b - a);
    const stepped = (v, n) => Math.round(v * n) / n;
    let B = null, img = null, T = 0, t = 0, parts = [], kx = 0, ky = 0, shakeT = -1, mx = 0, my = 0, tmx = 0, tmy = 0, sx = 0, sy = 0;
    let fired = new Set(), lastHit = false, trans = null, nextIdx = -1, busy = false;
    const size = () => { layout(B?.m ?? META.bosse[ORDER[cur]]); cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); ctx.imageSmoothingEnabled = false; if (reduced || !on) draw(); };
    live = { size };
    addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; tmx = (e.clientX / innerWidth) * 2 - 1; tmy = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });

    // ---------- Zeichnen in Szenenpixeln
    const off = (f) => [Math.round(sx * f) + kx, Math.round(sy * f) + ky];
    const blit = (r, ox0, oy0, w, h, x, y, f) => {   // Ausschnitt (ox0, oy0, w, h) aus Atlasrechteck r an Szenenstelle x, y, Tiefe f
      const [px, py] = off(f);
      const X = (x - camX - px) * d, Y = (y - camY - py) * d;
      const x0 = Math.max(0, Math.floor(-X / d)), x1 = Math.min(w, Math.ceil((cv.width - X) / d));
      const y0 = Math.max(0, Math.floor(-Y / d)), y1 = Math.min(h, Math.ceil((cv.height - Y) / d));
      if (x1 <= x0 || y1 <= y0) return;
      ctx.drawImage(img, r[0] + ox0 + x0, r[1] + oy0 + y0, x1 - x0, y1 - y0, X + x0 * d, Y + y0 * d, (x1 - x0) * d, (y1 - y0) * d);
    };
    const dot = (x, y, c, f = 1) => { const [px, py] = off(f); ctx.fillStyle = c; ctx.fillRect((Math.round(x) - camX - px) * d, (Math.round(y) - camY - py) * d, d, d); };
    const run = (x, y, w, c, f = 1) => { const [px, py] = off(f); ctx.fillStyle = c; ctx.fillRect((Math.round(x) - camX - px) * d, (Math.round(y) - camY - py) * d, w * d, d); };

    const frameAt = (list, ms) => { let acc = 0; for (let i = 0; i < list.length; i++) { acc += list[i][1]; if (ms < acc) return i; } return -1; };
    const momentLen = (m) => m.moment.f.reduce((s, q) => s + q[1], 0);
    const hitMs = (m) => m.moment.f.slice(0, m.moment.hit).reduce((s, q) => s + q[1], 0);

    // ---------- Teilchen je Gebiet (ein Szenenpixel, Farbe nach Alter in Stufen)
    const KIND = {
      asche: () => { const near = Math.random() < 0.35; return { x: camX + rnd(-20, vw + 20), y: camY - 2, vx: rnd(2, 6), vy: near ? rnd(7, 11) : rnd(4, 6), g: 0, wob: 3, max: rnd(8, 16), f: near ? 1.2 : 0.4, c: near ? ['#ffb648', '#e8641a'] : ['#7a2a14', '#4a1a10'], rain: true }; },
      geist: () => ({ x: camX + rnd(0, vw), y: S.FY + rnd(-4, 14), vx: rnd(-2, 2), vy: -rnd(5, 12), g: 0, wob: 8, max: rnd(3, 6), f: Math.random() < 0.4 ? 1.2 : 0.6, c: ['#e8fff8', '#7ef0d6', '#22b0a4', '#127272'] }),
      sporen: () => ({ x: camX + rnd(0, vw), y: camY + rnd(vh * 0.2, vh), vx: rnd(-3, 3), vy: -rnd(2, 6), g: 0, wob: 6, max: rnd(4, 8), f: Math.random() < 0.4 ? 1.2 : 0.5, c: Math.random() < 0.6 ? ['#b4f478', '#5ad040', '#22882e'] : ['#dea8ff', '#a458f4', '#6224b0'] }),
      schnee: () => { const near = Math.random() < 0.3; return { x: camX + rnd(-20, vw + 30), y: camY - 2, vx: -rnd(3, 8), vy: near ? rnd(14, 20) : rnd(6, 10), g: 0, wob: 4, max: rnd(8, 16), f: near ? 1.3 : 0.5, c: near ? ['#ffffff', '#d8ecff'] : ['#a8d0ff', '#6a8ea6'], rain: true }; },
    };
    const spawn = (q) => parts.push(Object.assign({ life: 0, seed: Math.random() * 9 }, q));
    const burst = (e) => {
      for (let i = 0; i < e.n; i++) spawn({ x: e.x + rnd(-e.r, e.r), y: e.y + rnd(-2, 1), vx: rnd(-e.vx, e.vx) + (e.dx ?? 0), vy: -rnd(e.vy * 0.4, e.vy), g: e.g ?? 220, wob: 0, max: rnd(0.4, 1.0), f: 1, c: e.c });
    };
    const ambient = (n) => {
      parts = [];
      const k = KIND[B.m.teilchen];
      if (!k) return;
      for (let i = 0; i < n; i++) { const q = k(); q.life = 0; q.y = q.rain ? camY + Math.random() * vh : q.y; q.max *= 0.4 + Math.random() * 0.6; spawn(q); }
    };

    // ---------- Boss zeigen
    const show = (i) => {
      cur = i; mark(i);
      B = { m: META.bosse[ORDER[i]] };
      T = 0; fired = new Set(); lastHit = false; shakeT = -1; kx = ky = 0;
      layout(B.m);
      ambient(18);
    };
    // nächsten Atlas schon laden
    const prefetch = () => load(ORDER[(cur + 1) % ORDER.length]).catch(() => {});

    let on = false, vis = false, last = 0;
    const go = (i, user) => {
      if (busy) { nextIdx = i; return; }
      if (B && ORDER[i] === ORDER[cur] && !user) return;
      busy = true;
      load(ORDER[i]).then((im) => {
        busy = false;
        if (B && !reduced) {
          const prev = document.createElement('canvas'); prev.width = cv.width; prev.height = cv.height;
          prev.getContext('2d').drawImage(cv, 0, 0);
          trans = { prev, t: 0, c: B.m.glut ?? ['#ffd890', '#f07a1c', '#a8300a'], seed: Math.random() * 99, sparks: 0 };
        }
        img = im; show(i); B.img = im;
        if (reduced) draw(); else prefetch();
        if (nextIdx >= 0) { const n = nextIdx; nextIdx = -1; go(n, true); }
      }, () => { busy = false; });
    };
    pick = (i, user) => go(i, user);

    const update = (dt) => {
      T += dt; t += dt;
      const m = B.m;
      mx += (tmx - mx) * Math.min(1, dt * 2.5); my += (tmy - my) * Math.min(1, dt * 2.5);
      sx = 3 * Math.sin((t * Math.PI * 2) / 23) + mx * 3;
      sy = 1 * Math.sin((t * Math.PI * 2) / 17) + my * 1;
      if (shakeT >= 0) { shakeT += dt; const s = [[0, 1], [1, -1], [-1, 0], [0, 1]][Math.floor(shakeT / 0.05)]; if (s) [kx, ky] = s; else { kx = ky = 0; shakeT = -1; } }
      // Attacke: Ereignisse relativ zum Einschlag
      const mt = (T - m.start) * 1000, hm = hitMs(m);
      if (mt >= hm && !lastHit) { lastHit = true; shakeT = 0; }
      for (const [k, e] of m.ereignisse.entries()) {
        if (fired.has(k) || mt < hm + e.at) continue;
        fired.add(k);
        if (e.k === 'funken') burst(e);
        if (e.k === 'zapfen') { shakeT = 0; burst({ x: e.x, y: e.y - 1, n: 24, r: 4, vx: 60, vy: 110, g: 300, c: m.glut }); }
      }
      // Umgebung
      const kind = KIND[m.teilchen];
      if (kind && Math.random() < dt * (m.dichte ?? 2.2)) spawn(kind());
      for (const [x, y] of m.schalen ?? []) if (Math.random() < dt * 3) spawn({ x: x + m.schale.w / 2 + rnd(-2, 2), y: y + 4, vx: rnd(-4, 4), vy: -rnd(16, 34), g: 0, wob: 10, max: rnd(0.5, 1.1), f: 0.45, c: m.glut });
      for (const q of parts) {
        q.life += dt;
        if (q.wob) q.vx += Math.sin(q.life * 6 + q.seed) * q.wob * dt;
        q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      }
      parts = parts.filter((q) => q.life < q.max && (!q.rain || q.y < S.H) && (q.g === 0 || q.y < S.FY + 4));
      if (parts.length > 320) parts.splice(0, parts.length - 320);
      if (trans && (trans.t += dt) > 0.8) trans = null;
      // Fortschritt und automatischer Wechsel
      const p = Math.min(1, T / m.dauer);
      const bar = tabs.find((q) => q.dataset.boss === ORDER[cur])?.querySelector('.kino-lauf');
      if (bar) bar.style.transform = `scaleX(${stepped(p, 60)})`;
      if (T >= m.dauer && !busy) go((cur + 1) % ORDER.length);
    };

    const pulse = (g, tt) => (g ? stepped(g.lo + (1 - g.lo) * (0.5 + 0.5 * Math.cos((tt * Math.PI * 2) / g.per)), g.steps) : 1);
    const drawFigure = (m, mt) => {
      const F = m.figur, R = F.r, x = m.fig.x, y = m.fig.y, w = m.fig.w, h = m.fig.h;
      const mf = mt >= 0 ? frameAt(m.moment.f, mt) : -1;
      if (mf >= 0) { blit(R.moment, m.moment.f[mf][0] * w, 0, w, h, x, y, 1); return; }
      // Ruhe: Teile mit eigenen Zyklen (n Bilder zu ms, oder feste Folge seq); dy: Versatz je Bild eines anderen Teils
      const ms = T * 1000, cur_ = {};
      for (const p of m.ruhe) {
        const k = p.seq ? p.seq[Math.floor(ms / p.ms) % p.seq.length] : Math.floor(ms / p.ms) % p.n;
        cur_[p.r] = k;
        blit(R[p.r], k * w, 0, w, h, x, y + (p.dy ? p.dy[cur_[p.von]] ?? 0 : 0), 1);
      }
    };
    const drawWarn = (m, mt) => {
      const W_ = m.warn, hm = hitMs(m);
      if (!W_ || mt < -W_.vor || mt >= hm) return;
      const p = Math.min(1, (mt + W_.vor) / ((hm + W_.vor) * 0.7));
      const blink = p >= 1 && Math.floor(mt / 90) % 2 === 0;
      const len = W_.x1 - W_.x0, fill = Math.floor((p * len) / 8) * 8;
      const dir = W_.dir ?? -1;
      const a = dir < 0 ? W_.x1 - fill : W_.x0, b = dir < 0 ? W_.x1 : W_.x0 + fill;
      const C = W_.c;
      for (let yy = 0; yy < W_.h; yy++) {
        const y = W_.y + yy;
        if (yy === 0 || yy === W_.h - 1) { run(a, y, b - a, blink ? C[2] : C[1]); continue; }
        // gefüllt: Schrägstreifen in zwei Stufen, die im Takt wandern
        const sh = Math.floor(mt / 80);
        for (let x = a; x < b; x++) dot(x, y, (x + yy + sh) % 6 < 3 ? C[1] : C[0]);
      }
      // Front der Füllung hell
      const fx = dir < 0 ? a : b - 1;
      for (let yy = 0; yy < W_.h; yy++) dot(fx, W_.y + yy, C[2]);
    };
    // Eiszapfen: Schattenmarke wächst in Stufen (vor ms vor dem Aufschlag), der Zapfen fällt beschleunigt, beim Aufschlag Splitter
    const drawZapfen = (m, e, et, z) => {
      if (et < 0 || et >= e.vor + e.n * e.ms) return;
      if (z === 'boden') {
        if (et >= e.vor) return;
        const p = et / e.vor, r = Math.max(1, Math.round(e.mr * Math.min(1, p * 1.25) * 2) / 2), ry = Math.max(1, Math.round(r / 3));
        const blink = p > 0.75 && Math.floor(et / 70) % 2 === 0;
        for (let yy = -ry; yy <= ry; yy++) for (let xx = -Math.ceil(r); xx <= Math.ceil(r); xx++) {
          const q = (xx * xx) / (r * r) + (yy * yy) / (ry * ry);
          if (q > 1) continue;
          if (q > 0.55) { if (q > 0.75 || ((xx + yy) & 1) === 0) dot(e.x + xx, e.y + yy - 1, blink ? m.glut[0] : m.glut[1]); }
          else if (q > 0.2 || ((xx + yy) & 1) === 0) dot(e.x + xx, e.y + yy - 1, '#04070e');
        }
        return;
      }
      const r = m.fxr[e.r];
      if (et < e.vor) {
        const f0 = e.vor * 0.45;
        if (et < f0) return;
        const p = (et - f0) / (e.vor - f0), top = camY - e.h - 4;
        const y = Math.round(top + (e.y - e.h - top) * p * p);
        blit(r, 0, 0, e.w, e.h, e.x - (e.w >> 1), y, 1);
        // Reifspur hinter dem Zapfen
        for (let k = 1; k < 4; k++) if (p > 0.2) dot(e.x + ((k & 1) ? -1 : 1), y - k * 3, k < 2 ? m.glut[0] : m.glut[2]);
      } else {
        const k = Math.floor((et - e.vor) / e.ms);
        blit(m.fxr[e.r2], k * e.sw, 0, e.sw, e.sh, e.x - (e.sw >> 1), e.y - e.sh + 2, 1);
      }
    };
    const drawEvents = (m, mt, z) => {
      const hm = hitMs(m);
      for (const e of m.ereignisse) {
        if (e.k === 'zapfen') { drawZapfen(m, e, mt - hm - e.at + e.vor, z); continue; }
        if (e.z !== z) continue;
        const et = mt - hm - e.at;
        if (et < 0) continue;
        const r = m.fxr[e.r];
        if (e.k === 'bild') {   // Bildfolge an fester Stelle (ganze Bilder untereinander oder nebeneinander)
          let k = Math.floor(et / e.ms);
          if (k >= e.n) continue;
          if (e.loop) k %= e.loop;
          if (e.quer) blit(r, k * e.w, 0, e.w, e.h, e.x, e.y, 1); else blit(r, 0, k * e.h, e.w, e.h, e.x, e.y, 1);
        } else if (e.k === 'wand') {   // Flammenwand läuft in ganzen Pixeln über den Boden, dahinter brennt eine Spur nieder
          const dist = Math.floor((et / 1000) * e.v), R2 = m.fxr[e.r2], R3 = m.fxr[e.r3];
          // Spur: alle e.abst Pixel eine Flamme, groß -> mittel -> klein, versetzt im Takt
          for (let q = e.abst, i = 1; q < Math.min(dist, e.weg); q += e.abst, i++) {
            const age = et - (q / e.v) * 1000;
            if (age >= e.nach) continue;
            const k = (Math.floor(age / e.ms) + i * 2) % e.n, x = e.x + e.dir * q;
            if (age < e.nach * 0.45) blit(R2, k * e.w2, 0, e.w2, e.h2, x - (e.w2 >> 1), e.y - e.h2, 1);
            else blit(R3, k * e.w3, 0, e.w3, e.h3, x - (e.w3 >> 1), e.y - e.h3, 1);
          }
          if (dist > e.weg) continue;
          const k = Math.floor(et / e.ms) % e.n, x = e.x + e.dir * dist - (e.w >> 1);
          blit(r, ((k + 3) % e.n) * e.w, 0, e.w, e.h, x - e.dir * 12, e.y - e.h + 6, 1);   // zweite Säule dahinter, etwas kleiner
          blit(r, k * e.w, 0, e.w, e.h, x, e.y - e.h, 1);
          if (Math.random() < 0.7) spawn({ x: x + e.w / 2 + rnd(-8, 8), y: e.y - rnd(6, e.h * 0.8), vx: rnd(-10, 10), vy: -rnd(24, 60), g: 0, wob: 10, max: rnd(0.3, 0.8), f: 1, c: m.glut });
          if (Math.random() < 0.4) spawn({ x: x + e.w / 2 + rnd(-6, 6), y: e.y - 1, vx: rnd(-20, 20) + e.dir * 10, vy: -rnd(10, 30), g: 80, wob: 0, max: rnd(0.4, 0.8), f: 1, c: ['#6a5040', '#4e3a30', '#3a2a24'] });
        }
      }
    };
    const draw = () => {
      if (!B || !img) return;
      const m = B.m;
      const mt = reduced ? -1e9 : (T - m.start) * 1000;
      const inMoment = mt >= 0 && mt < momentLen(m);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#05020a'; ctx.fillRect(0, 0, cv.width, cv.height);
      for (const L of m.layers) {
        ctx.globalAlpha = reduced ? 1 : pulse(L.glow, t);
        blit(L.r, 0, 0, L.r[2], L.r[3], L.x, L.y, L.f);
        ctx.globalAlpha = 1;
        if (L.name === m.schaleNach) {
          const sc = m.schale, k = reduced ? 0 : Math.floor((t * 1000) / sc.ms) % sc.n;
          for (const [x, y] of m.schalen) blit(m.fxr.schale, k * sc.w, 0, sc.w, sc.h, x, y, L.f);
        }
        if (L.name === m.nach) {
          drawEvents(m, mt, 'boden');
          drawWarn(m, mt);
          drawFigure(m, inMoment ? mt : -1);
          drawEvents(m, mt, 'vorn');
          for (const q of parts) {
            if (q.f > 1) continue;
            const k = q.life / q.max; if (q.rain && q.life < 0.3) continue;
            dot(q.x, q.y, q.c[Math.min(q.c.length - 1, Math.floor(k * q.c.length))], q.f);
          }
        }
      }
      for (const q of parts) {
        if (q.f <= 1) continue;
        const k = q.life / q.max; if (q.rain && q.life < 0.3) continue;
        dot(q.x, q.y, q.c[Math.min(q.c.length - 1, Math.floor(k * q.c.length))], q.f);
      }
      // Wechsel: das alte Bild zerfällt in Blöcken von unten nach oben, mit glühender Kante
      if (trans) {
        const P = trans.t / 0.8, bs = 6 * d, cols = Math.ceil(cv.width / bs), rows = Math.ceil(cv.height / bs);
        const thr = (i, j) => { const h = Math.sin(i * 12.9898 + j * 78.233 + trans.seed) * 43758.5453; return (h - Math.floor(h)) * 0.5 + (1 - j / rows) * 0.5; };
        for (let j = 0; j < rows; j++) {
          let a = -1;
          for (let i = 0; i <= cols; i++) {
            const v = i < cols ? thr(i, rows - 1 - j) * 1.08 - 0.04 : -1;
            const keep = v > P + 0.06;
            if (keep && a < 0) a = i;
            if (!keep && a >= 0) { ctx.drawImage(trans.prev, a * bs, j * bs, (i - a) * bs, bs, a * bs, j * bs, (i - a) * bs, bs); a = -1; }
            if (i < cols && !keep && v > P) { ctx.fillStyle = v > P + 0.03 ? trans.c[2] : trans.c[1]; ctx.fillRect(i * bs, j * bs, bs, bs); }
          }
        }
      }
    };

    const tick = (now) => {
      if (!vis || document.hidden) { on = false; return; }
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      if (B && img) { update(dt); draw(); }
      requestAnimationFrame(tick);
    };
    const run_ = () => { if (!reduced && vis && !document.hidden && !on) { on = true; last = 0; requestAnimationFrame(tick); } };
    load(ORDER[cur]).then((im) => {
      img = im; show(cur); B.img = im; size();
      draw(); cv.classList.add('on');
      if (!reduced) prefetch();
      new IntersectionObserver(([e]) => { vis = e.isIntersecting; run_(); }).observe(stage);
      document.addEventListener('visibilitychange', run_);
    }, () => {});
  }
})();
