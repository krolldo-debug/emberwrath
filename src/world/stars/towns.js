// Bewohner der Orte in den Sternenscherben (Format wie TOWNS in world/townlife.js, dort eingemischt).
// Sternhafen hat drei Ortsflächen (Ankerplatz mit Wohnvierteln, Sternmarkt, Schmiedegasse mit Gasthaus), damit
// sich die Bewohner über die Stadt verteilen; dazu das Gärtnerdorf Morgentau in den Treibenden Gärten.

const say = (text, cond) => ({ text, ...cond });

export const STAR_TOWNS = {
  sternhafen_anker: {
    folk: [
      { outfit: 'citizen', race: 'human', variant: 0, say: ['Der Ankerstein summt heute lauter als sonst.', 'Wer zum ersten Mal hier ist, schaut immer nach unten.'] },
      { outfit: 'noble', race: 'elf', variant: 1, say: ['Die Fürstin empfängt nur, wer etwas zu sagen hat.', 'Glutländer! Wie aufregend.', say('Man erzählt sich, du hättest die Gärten gerettet.', { level: 45 })] },
      { outfit: 'citizen', race: 'dwarf', variant: 2, say: ['Ich habe die Palastbrücke mitgebaut. Jeder Stein ist gezählt.', 'Perlstein wird nachts warm. Fühl mal.'] },
      { outfit: 'scholar', race: 'elf', variant: 0, say: ['Seraphe zählt die Sterne jede Nacht. Es werden weniger.', 'In Aurels Bibliothek fehlen ganze Jahrhunderte.'] },
      { outfit: 'courier', race: 'human', variant: 1, say: ['Briefe in die Gärten, Briefe in die Weiten. Nie Pause.', 'Die Lichtbrücken schwanken bei Wind. Nicht hinsehen.'] },
      { outfit: 'noble', race: 'human', variant: 2, say: ['Mein Großvater hat das Glutland noch gesehen. Von oben.', 'Ein Fest auf dem Ankerplatz! Bald, hoffe ich.'] },
      { outfit: 'gardener', race: 'elf', variant: 2, say: ['Die Blütenbäume hier sind Ableger vom Ankerbaum.', 'Gieß nie mit Sternwasser. Dann leuchten die Wurzeln.'] },
      { outfit: 'citizen', race: 'emberborn', variant: 1, say: ['Ich bin vor Jahren durchs Tor gekommen. Geblieben bin ich wegen des Lichts.', 'Hier oben friert die Glut in mir nicht.'] },
      { outfit: 'maid', race: 'human', variant: 0, cloth: 'slate', say: ['Im Palast werden wieder Gäste erwartet.', 'Halvard hat schlechte Laune. Wie immer.'] },
      { outfit: 'elder', race: 'dwarf', variant: 1, say: ['Früher gab es zwölf Scherben. Heute zähle ich neun.', 'Die Leere ist geduldig. Wir müssen es auch sein.'] },
      { outfit: 'apprentice', race: 'human', variant: 2, say: ['Ich lerne bei Seraphe. Meistens putze ich Linsen.', 'Durch das Fernrohr sieht man die Splitterweiten glitzern.'] },
      { outfit: 'citizen', race: 'elf', variant: 2, say: ['Die versiegelte Brücke? Frag lieber nicht.', 'Man hört nachts Glocken jenseits des Siegels.'] },
      { outfit: 'merchant', race: 'human', variant: 1, say: ['Das Auktionshaus hier oben ist das größte, das ich kenne.', 'Sternglas steigt im Preis. Kauf, solange du kannst.'] },
      { outfit: 'starguard', race: 'human', variant: 0, role: 'guard', say: ['Sternwacht. Halt dich an die Brücken.', 'Am Tor ist alles ruhig.'] },
      { outfit: 'starguard', race: 'dwarf', variant: 1, role: 'guard', say: ['Wir stehen hier, seit Aurel fiel.', 'Wenn das Siegel flackert, läuten wir.'] },
      { outfit: 'starguard', race: 'elf', variant: 0, role: 'guard', say: ['Der Hauptmann sieht dich gern auf den Brücken.', say('Die Gärten atmen wieder. Gute Arbeit.', { level: 46 })] },
    ],
  },
  sternhafen_markt: {
    folk: [
      { outfit: 'merchant', race: 'elf', variant: 0, say: ['Frische Sternäpfel! Wer will?', 'Seide aus den Gärten, so leicht wie Morgenlicht.'] },
      { outfit: 'merchant', race: 'dwarf', variant: 0, say: ['Ich handle mit allem, was nicht wegschwebt.', 'Gold ist Gold. Auch hier oben.'] },
      { outfit: 'farmwife', race: 'human', variant: 1, cloth: 'teal', say: ['Die Ernte aus den Gärten wird kleiner.', 'Lio verkauft zu teuer. Sag es ihm nicht.'] },
      { outfit: 'citizen', race: 'human', variant: 1, say: ['Ich suche ein Geschenk für die Fürstin. Etwas Glänzendes.', 'Ysolde hat Steine, die singen, wenn man sie hält.'] },
      { outfit: 'laborer', race: 'human', variant: 0, say: ['Kisten schleppen über Brücken. Das ist kein Spaß.', 'Wenn ich falle, fange ich mich an einer Wolke.'] },
      { outfit: 'noble', race: 'elf', variant: 2, say: ['Die Bank verwahrt alles. Sogar Erinnerungen, sagt man.', 'Ich kaufe nur, was vom Glutland heraufkommt. Exotisch!'] },
      { outfit: 'courier', race: 'dwarf', variant: 2, say: ['Ein Paket für Funkenruh. Wo ist das noch mal?', 'Die Post ist schneller als jedes Sternross.'] },
      { outfit: 'maid', race: 'elf', variant: 1, say: ['Die Gewandmeisterin näht mit Sternfäden.', 'Rosa ist dieses Jahr die Farbe am Hof.'] },
      { outfit: 'apprentice', race: 'emberborn', variant: 0, say: ['Ich bin hier für Ysolde. Ich halte die Lupe.', 'Ein Splitter aus den Weiten ist ein Vermögen wert.'] },
      { outfit: 'elder', race: 'human', variant: 0, say: ['Früher zahlte man hier mit Sternstaub.', 'Handel hält eine Stadt zusammen. Und Brücken.'] },
      { outfit: 'merchant', race: 'human', variant: 2, say: ['Tränke! Tränke für die Splitterweiten!', say('Die Schürfer in Funkenruh zahlen gut für Vorräte.', { level: 45 })] },
      { outfit: 'gardener', race: 'human', variant: 0, say: ['Blüten für den Brunnen. Jeden Morgen.', 'Wer Blumen verkauft, hat immer gute Laune.'] },
      { outfit: 'starguard', race: 'human', variant: 2, role: 'guard', say: ['Kein Gedränge am Tresor.', 'Taschendiebe gibt es auch hier oben.'] },
    ],
  },
  sternhafen_gassen: {
    folk: [
      { outfit: 'laborer', race: 'dwarf', variant: 1, say: ['Brunna hämmert schon seit dem Morgengrauen.', 'Sternstahl klingt anders als Glutstahl. Heller.'] },
      { outfit: 'laborer', race: 'emberborn', variant: 2, say: ['Ich halte die Esse warm. Das kann ich gut.', 'In der Glut geboren, im Himmel gelandet.'] },
      { outfit: 'apprentice', race: 'dwarf', variant: 0, say: ['Ich schmiede Nägel. Tausende Nägel.', 'Eines Tages schmiede ich eine Klinge für die Fürstin.'] },
      { outfit: 'hunter', race: 'elf', variant: 1, cloth: 'slate', say: ['In den Splitterweiten jagt man nicht. Man wird gejagt.', 'Die Scherbenkriecher sind schneller, als sie aussehen.'] },
      { outfit: 'farmwife', race: 'human', variant: 2, say: ['Mein Mann ist Schürfer in Funkenruh. Er schreibt selten.', 'Im Gasthaus gibt es heute Sternsuppe.'] },
      { outfit: 'citizen', race: 'human', variant: 2, say: ['Mirela kennt jede Geschichte, die hier oben erzählt wird.', 'Abends singen sie im Fallenden Stern.'] },
      { outfit: 'nomad', race: 'human', variant: 0, say: ['Ich suche eine Gruppe für die Gläsernen Hallen.', 'Allein geht dort keiner hinein. Nicht zweimal.'] },
      { outfit: 'pilgrim', race: 'elf', variant: 0, say: ['Ich bin auf dem Weg zur Sternwarte. Zu Fuß.', 'Die Königin der Sternwarte wartet. Sie hat Zeit.'] },
      { outfit: 'citizen', race: 'dwarf', variant: 0, say: ['Tamsin gibt Rüstungen nur an die, die sie verdienen.', 'Die Sternwacht braucht immer Leute.'] },
      { outfit: 'maid', race: 'human', variant: 1, say: ['Ich trage Brot ins Gasthaus. Warm muss es bleiben.', 'Der Wind hier oben riecht nach Blüten und Metall.'] },
      { outfit: 'northman', race: 'human', variant: 1, say: ['Aus den Frostzinnen bis hierher. Was für eine Reise.', 'Kalt ist es hier nicht. Nur hoch.'] },
      { outfit: 'merchant', race: 'emberborn', variant: 1, say: ['Werkzeug für Schürfer! Hacken, Seile, Laternen!', 'Wer in die Weiten geht, braucht mehr als Mut.'] },
      { outfit: 'elder', race: 'elf', variant: 2, say: ['Ich habe die Rankengruft gesehen, als sie noch ein Garten war.', say('Ysgarns Ranken sind verdorrt. Endlich.', { level: 45 })] },
      { outfit: 'starguard', race: 'emberborn', variant: 0, role: 'guard', say: ['Das Südtor ist offen. Die Weiten nicht immer.', 'Wer über die Brücke geht, kommt nicht immer zurück.'] },
    ],
  },
  morgentau: {
    folk: [
      { outfit: 'gardener', race: 'elf', variant: 0, say: ['Die Wurzeln des Ankerbaums reichen bis unter den Mondweiher.', 'Wir schneiden die Ranken jeden Tag. Sie wachsen jede Nacht.'] },
      { outfit: 'gardener', race: 'human', variant: 1, say: ['Bren redet mit den Bäumen. Manchmal antworten sie.', 'Lichtsamen fallen nur, wenn der Baum es will.'] },
      { outfit: 'farmwife', race: 'human', variant: 0, cloth: 'teal', say: ['Morgentau heißt so, weil hier jeder Morgen glitzert.', 'Iss nie eine Blüte, die nachts leuchtet.'] },
      { outfit: 'apprentice', race: 'elf', variant: 1, say: ['Ich trage Wasser vom Weiher herauf. Den ganzen Tag.', 'Die Terrassen waren einmal Aurels Lieblingsort.'] },
      { outfit: 'elder', race: 'human', variant: 1, say: ['Der Wurzelbruch war früher eine Wiese.', say('Die Risse im Wurzelbruch sind still. Danke dir.', { level: 43 })] },
      { outfit: 'starguard', race: 'human', variant: 1, role: 'guard', say: ['Veyra hat hier das Sagen. Nicht die Sternwacht.', 'Blütenpirscher kommen bis an die Beete.'] },
    ],
  },
  funkenruh: {
    folk: [
      { outfit: 'laborer', race: 'dwarf', variant: 2, say: ['Drei Tage geschürft, ein Splitter gefunden. Ein guter Tag.', 'Dagna zahlt pünktlich. Das ist hier oben selten.'] },
      { outfit: 'laborer', race: 'human', variant: 1, say: ['Halt dich vom Kran fern, wenn er schwingt.', 'Die Lore klemmt schon wieder.'] },
      { outfit: 'hunter', race: 'elf', variant: 0, cloth: 'slate', say: ['Die Leerenhunde kommen vom Spiegelsee herauf.', 'Nachts singen die Grate. Man gewöhnt sich nicht daran.'] },
      { outfit: 'laborer', race: 'emberborn', variant: 1, say: ['Glutländer graben besser. Wir sind die Hitze gewohnt.', 'Ein Splitter hat mir den Daumen gekostet. Er war es wert.'] },
      { outfit: 'farmwife', race: 'human', variant: 1, cloth: 'teal', say: ['Ich koche für dreißig Schürfer. Jeden Tag.', 'Die Suppe schmeckt nach Kristallstaub. Alles schmeckt danach.'] },
      { outfit: 'apprentice', race: 'dwarf', variant: 0, say: ['Mira hat mir eine Karte geschenkt. Sie stimmt schon nicht mehr.', 'Ich will einmal bis zur Sternwarte.'] },
      { outfit: 'nomad', race: 'human', variant: 2, say: ['Wer zur Sternwarte geht, nimmt besser Freunde mit.', say('Die Sternwarte schweigt? Dann schlafe ich heute ruhig.', { level: 50 })] },
      { outfit: 'starguard', race: 'human', variant: 2, role: 'guard', say: ['Die Sternwacht hält das Lager. Mehr nicht.', 'Irre Schürfer im Scherbenfeld. Bleib wachsam.'] },
    ],
  },
};
