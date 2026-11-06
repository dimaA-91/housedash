# Automatische Kalendersymbole

228 Zuordnungen, 1388 Begriffe und Schreibvarianten, 170 lokale SVG-Symbole.

Die deutsche Matrix ist eine eigene redaktionelle Zuordnung. iCalendar definiert Kategorien, aber keine allgemeine Wort-zu-Symbol-Matrix. Die Begriffe sind für den Familienalltag kuratiert, keine importierten Familiendaten.

## Verhalten

- Der Titel hat Vorrang vor einer allgemeinen Kategorie. Spezifische Aktivitäten gewinnen vor den allgemeinen Regeln Training, Schule, Arbeit und Freizeit (z. B. Yoga vor Training). Danach entscheiden die längere passende Wortgruppe und schließlich die Reihenfolge dieser Matrix.
- Groß-/Kleinschreibung, Umlaute (auch ae/oe/ue), ß/ss und Satzzeichen werden vereinheitlicht. Nur ganze Wörter oder Wortgruppen zählen: „Ball“ trifft nicht „Ballon“. Zusammengesetzte Wörter sind ausdrücklich hinterlegt.
- Wenn im Titel nichts erkannt wird, dienen Kategorie Schule, Arbeit, Freizeit, Arzt, Familie und weitere unten dokumentierte Kategorien als Rückfall. Ohne Treffer erscheint ein neutrales Kalendersymbol.
- Bestehende farbige Mülltonnen und die bisherigen Geburtstagstorten haben Vorrang in Kalender und Startansicht. Personenfarben bleiben erhalten.
- Es wird nur die Darstellung abgeleitet: keine Änderung gespeicherter Termine, kein Schemawechsel, keine Migration, keine Netzabfragen. Neue Regeln wirken auf bestehende Termine.
- Keine Sprach-KI: Verneinungen, Tippfehler und unbekannte Zusammensetzungen werden nicht semantisch verstanden. Bei mehreren Aktivitäten kann nur ein Symbol angezeigt werden.

## Pflege

`src/lib/calendar-icon-rules.ts` enthält die Regeln; `calendar-icon-mapping.ts` die Erkennung und Kategorie-Rückfälle. Nach Regeländerungen `node scripts/generate-calendar-icons.mjs` ausführen (Node ≥ 22.18, npm-Abhängigkeiten installiert). Der Generator aktualisiert diese Tabelle und extrahiert ausschließlich benötigte freie SVG-Pfade. Keine neuen Abhängigkeiten. Unter **Mehr → Kalendersymbole** lässt sich die Matrix durchsuchen; im Terminformular erscheint eine Vorschau.

## Quellen und Lizenz

- [Font Awesome: lokale SVG-Verwendung](https://docs.fontawesome.com/web/add-icons/svg-bare)
- [Font Awesome Free: Lizenz](https://fontawesome.com/license/free), SVG-Icons von Fonticons, Inc., CC BY 4.0. Pfade aus dem installierten Paket, Form unverändert; Darstellung mit aktueller Textfarbe.
- [RFC 5545, CATEGORIES](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.8.1.2)

## Sport & Bewegung

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Fußball | futbol | Fußball, Fußballtraining, Fußballspiel, Fußballturnier, Fußballcamp, Fußballverein, Fussball, Soccer, Kicken, Bolzplatz |
| Kinderfußball | futbol | Kinderfußball, Bambini Fußball, F Jugend, E Jugend, D Jugend, Minikicker, G Jugend, Fußball Training |
| Basketball | basketball | Basketball, Basketballtraining, Basketballspiel, Basketballturnier, Basketball Training |
| Volleyball | volleyball | Volleyball, Volleyballtraining, Beachvolleyball, Volleyballturnier |
| Baseball | baseball-bat-ball | Baseball, Baseballtraining, Softball |
| American Football | football | American Football, Footballtraining, Super Bowl, Flag Football |
| Tischtennis | table-tennis-paddle-ball | Tischtennis, Tischtennistraining, Tischtennisturnier, Ping Pong |
| Tennis | table-tennis-paddle-ball | Tennis, Tennistraining, Tennismatch, Tennisstunde, Tennisplatz, Padel, Badminton, Squash |
| Handball | volleyball | Handball, Handballtraining, Handballspiel, Handballturnier |
| Schwimmen | person-swimming | Schwimmen, Schwimmtraining, Schwimmkurs, Schwimmstunde, Schwimmbad, Hallenbad, Freibad, Seepferdchen, Schwimmverein |
| Babyschwimmen | person-swimming | Babyschwimmen, Baby Schwimmen, Wassergewöhnung, Aquafitness, Aquagymnastik |
| Radfahren | person-biking | Radfahren, Fahrradtour, Radtour, Radtraining, Rennrad, Mountainbike, BMX, Fahrradtraining, Cycling, Spinning |
| Laufen | person-running | Laufen, Joggen, Jogging, Lauftraining, Lauftreff, Marathon, Halbmarathon, Stadtlauf, Crosslauf |
| Leichtathletik | person-running | Leichtathletik, Leichtathletiktraining, Sprinttraining, Weitsprung, Hochsprung |
| Wandern | person-hiking | Wandern, Wanderung, Wandertag, Bergtour, Trekking, Hiking |
| Spaziergang | person-walking | Spaziergang, Spazieren, Nordic Walking, Walking |
| Fitness | dumbbell | Fitness, Fitnessstudio, Krafttraining, Crossfit, Workout, Bodypump, Functional Training, Kraftraum |
| Yoga | spa | Yoga, Yogakurs, Yogastunde, Pilates, Meditation, Achtsamkeit, Entspannungskurs |
| Turnen | person | Turnen, Kinderturnen, Eltern Kind Turnen, Geräteturnen, Bodenturnen, Turnstunde, Turntraining, Gymnastik, Akrobatik |
| Tanzen | music | Tanzen, Tanzkurs, Tanztraining, Tanzschule, Ballett, Ballettstunde, Hip Hop, Zumba, Kindertanzen, Modern Dance |
| Kampfsport | hand-fist | Kampfsport, Karate, Judo, Taekwondo, Jiu Jitsu, Ju Jutsu, Boxen, Kickboxen, Aikido, Selbstverteidigung |
| Reiten | horse | Reiten, Reitstunde, Reitunterricht, Reittraining, Reitturnier, Voltigieren, Ponyreiten, Reiterhof |
| Skifahren | person-skiing | Skifahren, Skikurs, Skiurlaub, Skilanglauf, Langlauf, Skischule, Skiausflug |
| Snowboarden | person-snowboarding | Snowboarden, Snowboard, Snowboardkurs |
| Eislaufen | person-skating | Eislaufen, Schlittschuhlaufen, Eishalle, Eiskunstlauf, Eishockey, Inline Skaten, Inlineskaten, Rollschuhlaufen |
| Klettern | mountain | Klettern, Kletterhalle, Kletterkurs, Bouldern, Boulderhalle, Kletterpark, Hochseilgarten |
| Golf | golf-ball-tee | Golf, Golftraining, Minigolf, Golfkurs |
| Bowling | bowling-ball | Bowling, Kegeln, Kegelabend, Bowlingabend |
| Wassersport | sailboat | Wassersport, Segeln, Segelkurs, Surfen, Windsurfen, Kajak, Kanufahren, Paddeln, Stand Up Paddling, Rudern |
| Wettkampf | medal | Wettkampf, Sportfest, Sportturnier, Meisterschaft, Bundesjugendspiele, Siegerehrung |
| Training | dumbbell | Training, Sport, Sportkurs, Vereinssport, Probetraining, Trainingslager |

## Gesundheit & Vorsorge

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Zahnarzt | tooth | Zahnarzt, Zahnärztin, Zahnarzttermin, Zahnkontrolle, Zahnreinigung, PZR, Zahnprophylaxe, Zahnbehandlung |
| Kieferorthopädie | tooth | Kieferorthopädie, Kieferorthopäde, Kieferorthopädin, Zahnspange, Spangenkontrolle |
| Kinderarzt | baby | Kinderarzt, Kinderärztin, Kinderarzttermin, U Untersuchung, U1, U2, U3, U4, U5, U6, U7, U7a, U8, U9, J1, J2 |
| Augenarzt | eye | Augenarzt, Augenärztin, Augenarzttermin, Sehtest, Orthoptik |
| HNO | ear-listen | HNO, HNO Arzt, Hals Nasen Ohren, Hörtest, Hörakustiker |
| Kardiologie | heart-pulse | Kardiologie, Kardiologe, Herzuntersuchung, EKG, Herzultraschall |
| Hautarzt | hand-dots | Hautarzt, Hautärztin, Dermatologie, Hautkrebsvorsorge, Allergietest |
| Frauenarzt | person-pregnant | Frauenarzt, Frauenärztin, Gynäkologie, Schwangerschaftsvorsorge, Schwangerschaftskontrolle |
| Orthopädie | bone | Orthopädie, Orthopäde, Orthopädin, Unfallchirurgie |
| Neurologie | brain | Neurologie, Neurologe, Neurologin, EEG |
| Hausarzt | stethoscope | Hausarzt, Hausärztin, Hausarzttermin, Arzt, Ärztin, Arzttermin, Sprechstunde, Gesundheitscheck, Check Up |
| Impfung | syringe | Impfung, Impfen, Impftermin, Auffrischimpfung, Grippeimpfung, Reiseimpfung, Blutabnahme, Bluttest |
| Krankenhaus | hospital | Krankenhaus, Klinik, Operation, OP Termin, Ambulanz, Notaufnahme, Klinikbesuch, Krankenbesuch |
| Bildgebung | x-ray | Bildgebung, Röntgen, MRT, CT Termin, Ultraschall, Radiologie |
| Physiotherapie | person-walking | Physiotherapie, Physio, Krankengymnastik, Manuelle Therapie, Osteopathie, Rehasport, Reha |
| Ergotherapie | hands | Ergotherapie, Ergo, Ergotherapiestunde |
| Logopädie | comments | Logopädie, Logopäde, Logopädin, Sprachtherapie, Logopädiestunde |
| Psychotherapie | brain | Psychotherapie, Psychologe, Psychologin, Psychiater, Psychiatrie, Therapiegespräch, Familientherapie |
| Apotheke | prescription-bottle-medical | Apotheke, Medikamente, Rezept abholen, Medikament abholen, Apothekendienst |
| Krank | bed | Krank, Krankmeldung, Krankentag, Bettruhe, Genesung, Erholungstag |
| Blutspende | droplet | Blutspende, Plasmaspende, Blutspendetermin |
| Optiker | glasses | Optiker, Brille abholen, Kontaktlinsenanpassung, Brillenanpassung |
| Fußpflege | shoe-prints | Fußpflege, Podologie, Medizinische Fußpflege |
| Massage | spa | Massage, Massagetermin, Wellness, Sauna, Therme |

## Schule & Lernen

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Schule | school | Schule, Schulbeginn, Schulschluss, Schulveranstaltung, Schultag, Grundschule, Gymnasium, Realschule |
| Einschulung | school | Einschulung, Schulanfang, Erster Schultag, Schultüte, Schuleinführung |
| Elternabend | people-group | Elternabend, Klassenelternabend, Elternversammlung, Elternbeirat, Schulkonferenz |
| Elterngespräch | comments | Elterngespräch, Elternsprechtag, Lehrergespräch, Lernentwicklungsgespräch, Entwicklungsgespräch |
| Klassenarbeit | pen | Klassenarbeit, Klausur, Schulaufgabe, Lernkontrolle, Vokabeltest, Mathearbeit, Deutschtest, Englischarbeit |
| Prüfung | graduation-cap | Prüfung, Abitur, Abschlussprüfung, Prüfungstermin, Mündliche Prüfung, Zeugnis, Zeugnisausgabe |
| Hausaufgaben | book-open | Hausaufgaben, Hausaufgabenbetreuung, Lernzeit, Lernen, Üben, Lerngruppe, Nachhilfe, Nachhilfestunde |
| Mathematik | calculator | Mathematik, Mathe, Rechnen, Mathe Nachhilfe, Matheförderung |
| Sprachkurs | language | Sprachkurs, Englischkurs, Deutschkurs, Französischkurs, Spanischkurs, Italienischkurs, Sprachschule |
| Naturwissenschaften | flask | Naturwissenschaften, Chemie, Physik, Biologie, Experimentieren, Forscherkurs |
| Programmieren | laptop-code | Programmieren, Programmierkurs, Coding, Robotik, Informatik, Computer AG |
| Lesen | book | Lesen, Lesestunde, Lesekreis, Vorlesestunde, Leseförderung, Buchclub |
| Klassenfahrt | bus | Klassenfahrt, Schulfahrt, Studienfahrt, Schulausflug, Wandertag Schule |
| Schulfest | school-flag | Schulfest, Sommerfest Schule, Tag der offenen Tür, Projektwoche, Projekttag |
| Schulferien | umbrella-beach | Schulferien, Sommerferien, Herbstferien, Winterferien, Osterferien, Pfingstferien, Weihnachtsferien, Ferienbeginn, Ferienende |
| Hort | school | Hort, Ganztagsbetreuung, Nachmittagsbetreuung, OGS, Schülerbetreuung |
| Studium | graduation-cap | Studium, Vorlesung, Seminar, Universität, Uni Termin, Tutorium, Bachelorarbeit, Masterarbeit |
| Weiterbildung | chalkboard-user | Weiterbildung, Fortbildung, Workshop, VHS, Volkshochschule, Onlinekurs, Schulung |

## Kinder & Betreuung

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Kita | children | Kita, Kindergarten, Kinderkrippe, Krippe, Kitatag, Kindergartentag, Vorschule |
| Eingewöhnung | baby | Eingewöhnung, Kita Eingewöhnung, Kindergarten Eingewöhnung, Krippeneingewöhnung |
| Kitafest | children | Kitafest, Kindergartenfest, Laternenfest, Laternenumzug, Martinsumzug, St Martins Umzug |
| Babysitter | hand-holding-heart | Babysitter, Babysitting, Kinderbetreuung, Tagesmutter, Tagesvater, Leihoma |
| Abholen | person-walking | Abholen, Kind abholen, Kinder abholen, Abholzeit, Kita abholen, Schule abholen, Hort abholen |
| Bringen | person-walking | Bringen, Kind bringen, Kinder bringen, Bringzeit, Zur Kita, Zur Schule |
| Spielgruppe | shapes | Spielgruppe, Krabbelgruppe, Eltern Kind Gruppe, PEKiP, Babykurs, Babytreff, Miniclub |
| Spielplatz | child-reaching | Spielplatz, Spielplatztreff, Spielverabredung, Spielenachmittag, Spieltreff, Playdate, Kinderbesuch |
| Ferienbetreuung | campground | Ferienbetreuung, Feriencamp, Ferienfreizeit, Zeltlager, Jugendlager, Kinderfreizeit |
| Hebamme | baby-carriage | Hebamme, Hebammentermin, Geburtsvorbereitung, Rückbildung, Stillberatung, Wochenbettbesuch |
| Übernachtung | moon | Übernachtung, Übernachtungsparty, Pyjamaparty, Bei Oma schlafen, Bei Opa schlafen |
| Jugendtreff | children | Jugendtreff, Jugendgruppe, Jugendzentrum, Pfadfinder, Gruppenstunde |

## Musik & Kreativität

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Gitarre | guitar | Gitarre, Gitarrenunterricht, Gitarrenstunde, Gitarrenkurs, Ukulele, Bassunterricht, E Gitarre |
| Klavier | music | Klavier, Klavierunterricht, Klavierstunde, Keyboard, Keyboardunterricht, Pianounterricht |
| Schlagzeug | drum | Schlagzeug, Schlagzeugunterricht, Schlagzeugstunde, Trommeln, Trommelkurs, Percussion |
| Streichinstrumente | music | Streichinstrumente, Geige, Geigenunterricht, Violine, Cello, Cellounterricht, Bratsche, Kontrabass |
| Blasinstrumente | music | Blasinstrumente, Flöte, Blockflöte, Querflöte, Trompete, Saxophon, Klarinette, Posaune, Flötenunterricht |
| Singen | microphone | Singen, Gesangsunterricht, Gesangsstunde, Chor, Chorprobe, Kinderchor, Vokalensemble |
| Musikunterricht | music | Musikunterricht, Musikschule, Musikstunde, Musikalische Früherziehung, Instrumentalunterricht |
| Bandprobe | music | Bandprobe, Orchesterprobe, Ensembleprobe, Musikprobe, Band Probe |
| Malen | palette | Malen, Malkurs, Zeichnen, Zeichenkurs, Kunstkurs, Atelier, Aquarell, Malstunde |
| Basteln | scissors | Basteln, Bastelnachmittag, Bastelkurs, Handarbeiten, Nähen, Nähkurs, Stricken, Häkeln |
| Töpfern | hands | Töpfern, Töpferkurs, Keramik, Keramikkurs, Modellieren |
| Fotografie | camera | Fotografie, Fotokurs, Fotoshooting, Fototermin, Familienfotos, Schulfotograf, Kitafotograf |
| Theaterkurs | masks-theater | Theaterkurs, Theater AG, Schauspielunterricht, Schauspielkurs, Theaterprobe, Improtheater |
| Schreiben | pen-nib | Schreiben, Schreibwerkstatt, Kreatives Schreiben, Kalligrafie, Schreibkurs |

## Arbeit & Termine

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Arbeit | briefcase | Arbeit, Arbeitstag, Büro, Dienst, Arbeitstermin, Dienstbeginn, Dienstende |
| Homeoffice | house-laptop | Homeoffice, Home Office, Mobiles Arbeiten, Remote Work, HO Tag |
| Besprechung | users | Besprechung, Meeting, Teammeeting, Teamsitzung, Jour Fixe, Jourfixe, Abstimmung, Projektmeeting |
| Videokonferenz | video | Videokonferenz, Videocall, Video Call, Teams Call, Zoom Meeting, Online Meeting, Webmeeting |
| Telefonat | phone | Telefonat, Telefontermin, Telefonkonferenz, Rückruf, Anrufen, Conference Call |
| Präsentation | person-chalkboard | Präsentation, Vortrag, Pitch, Demo Termin, Kundentermin, Kundenbesuch |
| Bewerbung | user-tie | Bewerbung, Bewerbungsgespräch, Vorstellungsgespräch, Jobinterview, Assessment Center |
| Dienstreise | suitcase | Dienstreise, Geschäftsreise, Messebesuch, Fachtagung, Kongress, Konferenz |
| Schichtdienst | clock | Schichtdienst, Frühschicht, Spätschicht, Nachtschicht, Bereitschaft, Rufbereitschaft, Wochenenddienst |
| Abgabe | flag-checkered | Abgabe, Deadline, Abgabetermin, Projektabschluss, Frist, Abgabefrist |
| Feierabend | mug-hot | Feierabend, Betriebsfeier, Betriebsausflug, Teamevent, Team Event, After Work |
| Urlaubstag | umbrella-beach | Urlaubstag, Gleittag, Überstundenfrei, Freizeitausgleich, Arbeitsfrei |

## Familie & Freunde

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Geburtstag | cake-candles | Geburtstag, Geburtstagsfeier, Geburtstagsparty, Kindergeburtstag, Birthday, Geburtstagsessen |
| Geschenke | gift | Geschenke, Geschenk kaufen, Geschenke besorgen, Geschenk einpacken, Bescherung |
| Familientreffen | people-roof | Familientreffen, Familienfeier, Familienbesuch, Familienzeit, Familienrat, Familienausflug |
| Großeltern | heart | Großeltern, Oma, Opa, Oma besuchen, Opa besuchen, Großelternbesuch, Omatag, Opatag |
| Freunde treffen | user-group | Freunde treffen, Freundetreffen, Besuch, Besuch bekommen, Verabredung, Freundinnenabend, Mädelsabend, Männerabend |
| Date | heart | Date, Date Night, Paarzeit, Jahrestag, Hochzeitstag, Valentinstag, Kennenlerntag |
| Hochzeit | gem | Hochzeit, Trauung, Hochzeitsfeier, Standesamtliche Trauung, Polterabend, Junggesellenabschied, Junggesellinnenabschied |
| Babyfeier | baby | Babyfeier, Babyparty, Baby Shower, Willkommensfeier, Geburt |
| Taufe | hands-praying | Taufe, Tauffeier, Kommunion, Erstkommunion, Konfirmation, Firmung, Jugendweihe |
| Jubiläum | champagne-glasses | Jubiläum, Jubiläumsfeier, Abschiedsfeier, Einweihungsfeier, Richtfest, Ruhestandsfeier |
| Trauerfeier | dove | Trauerfeier, Beerdigung, Bestattung, Beisetzung, Gedenkfeier, Friedhof, Todestag |
| Unterstützung | hand-holding-heart | Unterstützung, Nachbarschaftshilfe, Besuchsdienst, Pflegebesuch, Pflegedienst, Angehörigenpflege |

## Feste & Feiertage

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Weihnachten | tree | Weihnachten, Heiligabend, Advent, Adventsfeier, Weihnachtsfeier, Weihnachtsmarkt, Nikolaus, Nikolaustag, Wichteln |
| Ostern | egg | Ostern, Ostersonntag, Ostermontag, Ostereiersuche, Eier färben, Osterfeier |
| Halloween | ghost | Halloween, Halloweenparty, Kürbis schnitzen, Süßes oder Saures |
| Karneval | masks-theater | Karneval, Fasching, Fastnacht, Faschingsfeier, Rosenmontag, Karnevalsumzug, Kostümparty |
| Silvester | champagne-glasses | Silvester, Neujahr, Jahreswechsel, Silvesterparty, Neujahrsempfang |
| Muttertag | heart | Muttertag, Vatertag, Elterntag, Weltkindertag, Kindertag |
| Feiertag | calendar-day | Feiertag, Tag der Arbeit, Tag der Deutschen Einheit, Christi Himmelfahrt, Pfingsten, Allerheiligen, Fronleichnam, Karfreitag |
| Religiöse Feste | hands-praying | Religiöse Feste, Zuckerfest, Opferfest, Ramadan, Eid, Chanukka, Pessach, Diwali |
| Stadtfest | flag | Stadtfest, Straßenfest, Nachbarschaftsfest, Dorffest, Volksfest, Sommerfest, Herbstfest, Kirmes, Kerb |

## Essen & Genuss

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Essen gehen | utensils | Essen gehen, Restaurant, Restaurantbesuch, Abendessen, Mittagessen, Familienessen, Dinner, Lunch |
| Frühstück | mug-hot | Frühstück, Frühstücken, Brunch, Frühstückstreffen, Frühstücksbuffet |
| Kaffeetreffen | mug-saucer | Kaffeetreffen, Kaffee trinken, Kaffeeklatsch, Kaffee und Kuchen, Café, Kaffeepause |
| Kochen | fire-burner | Kochen, Kochkurs, Kochabend, Gemeinsam kochen, Meal Prep, Vorkochen |
| Backen | cookie-bite | Backen, Plätzchen backen, Kuchen backen, Backkurs, Brot backen, Weihnachtsbäckerei |
| Grillen | fire | Grillen, Grillabend, Grillfest, BBQ, Barbecue, Angrillen |
| Pizza | pizza-slice | Pizza, Pizzaabend, Pizza essen, Pizzeria |
| Eis essen | ice-cream | Eis essen, Eisdiele, Eiscafé, Eisbecher |
| Verkostung | wine-glass | Verkostung, Weinprobe, Bierprobe, Weinabend, Tasting |
| Essensplanung | utensils | Essensplanung, Wochenmenü, Speiseplan, Mahlzeitenplanung, Menüplanung |

## Freizeit & Ausflüge

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Freizeit | star | Freizeit, Freie Zeit, Freizeitaktivität |
| Kino | film | Kino, Kinobesuch, Kinoabend, Filmabend, Freiluftkino, Autokino |
| Theater | masks-theater | Theater, Theaterbesuch, Musical, Oper, Ballettaufführung, Schauspiel, Puppentheater |
| Konzert | ticket | Konzert, Konzertbesuch, Festival, Live Musik, Open Air, Musikfestival |
| Museum | landmark | Museum, Museumsbesuch, Ausstellung, Galerie, Kunsthalle, Vernissage |
| Zoo | paw | Zoo, Zoobesuch, Tierpark, Wildpark, Streichelzoo, Tiergarten |
| Aquarium | fish | Aquarium, Sea Life, Meeresaquarium |
| Freizeitpark | rocket | Freizeitpark, Erlebnispark, Vergnügungspark, Achterbahn, Legoland, Europapark, Europa Park, Phantasialand |
| Spieleabend | dice | Spieleabend, Brettspiele, Brettspielabend, Kartenspiel, Skatabend, Schach, Schachclub |
| Gaming | gamepad | Gaming, Computerspiele, Videospiele, LAN Party, E Sport |
| Bibliothek | book | Bibliothek, Bücherei, Stadtbibliothek, Bücher abgeben, Bücher ausleihen |
| Naturausflug | tree | Naturausflug, Waldspaziergang, Walderkundung, Naturpark, Botanischer Garten, Waldtag |
| Strand | umbrella-beach | Strand, Badesee, Strandtag, Seeausflug, Badeausflug, Picknick |
| Camping | tent | Camping, Campen, Zelten, Campingplatz, Wohnmobilwochenende |
| Escape Room | puzzle-piece | Escape Room, Escaperoom, Rätselabend, Schnitzeljagd, Schatzsuche, Geocaching |
| Planetarium | star | Planetarium, Sternwarte, Sterne beobachten, Astronomie |
| Zirkus | face-laugh | Zirkus, Zirkusbesuch, Zaubershow, Comedy, Kabarett, Stand Up Comedy |

## Reisen & Mobilität

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Flug | plane | Flug, Abflug, Rückflug, Hinflug, Flugreise, Fliegen, Flughafen, Flughafentransfer |
| Bahnreise | train | Bahnreise, Zugfahrt, Zugreise, Bahnhof, ICE, Intercity, Bahnfahrt |
| Busfahrt | bus | Busfahrt, Busreise, Reisebus, Fernbus, Schulbus |
| Straßenbahn | train-tram | Straßenbahn, Tram, U Bahn, S Bahn, Nahverkehr, ÖPNV |
| Autofahrt | car | Autofahrt, Fahrgemeinschaft, Mitfahrgelegenheit, Fahrdienst, Roadtrip, Road Trip |
| Schiffsreise | ship | Schiffsreise, Fähre, Fährfahrt, Kreuzfahrt, Bootsfahrt, Schiffsfahrt |
| Urlaub | suitcase-rolling | Urlaub, Familienurlaub, Reise, Reisebeginn, Reiseende, Reisen, Kurzurlaub, Städtereise, Wochenendtrip |
| Hotel | hotel | Hotel, Check In, Check Out, Hotelanreise, Hotelabreise, Ferienwohnung, Unterkunft |
| Koffer packen | suitcase | Koffer packen, Packen, Reisevorbereitung, Packliste, Kofferpacken |
| Rückkehr | house | Rückkehr, Heimreise, Rückreise, Nach Hause, Urlaubsrückkehr |
| Reisedokumente | id-card | Reisedokumente, Reisepass beantragen, Reisepass abholen, Visum, Passkontrolle |
| Taxi | taxi | Taxi, Taxifahrt, Taxi bestellen, Mietwagen abholen, Mietwagen zurückgeben |

## Haushalt & Garten

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Putzen | broom | Putzen, Hausputz, Frühjahrsputz, Wohnungsputz, Reinigung, Putztermin, Bad putzen, Fenster putzen |
| Aufräumen | box | Aufräumen, Ausmisten, Entrümpeln, Keller aufräumen, Garage aufräumen, Schrank aufräumen |
| Wäsche | shirt | Wäsche, Wäsche waschen, Waschtag, Bügeln, Wäsche aufhängen, Textilreinigung |
| Gartenarbeit | seedling | Gartenarbeit, Gärtnern, Pflanzen, Umtopfen, Beet anlegen, Unkraut jäten, Rasen mähen, Hecke schneiden |
| Gießen | droplet | Gießen, Blumen gießen, Pflanzen gießen, Garten bewässern |
| Ernte | apple-whole | Ernte, Äpfel ernten, Gemüse ernten, Obst pflücken, Erdbeeren pflücken, Einmachen |
| Heimwerken | screwdriver-wrench | Heimwerken, Reparatur, Reparieren, Renovieren, Streichen, Tapezieren, Möbel aufbauen, Handwerken |
| Umzug | truck-moving | Umzug, Umzugstag, Umzugshelfer, Kisten packen, Wohnungsübergabe, Schlüsselübergabe |
| Wohnungsbesichtigung | house | Wohnungsbesichtigung, Hausbesichtigung, Besichtigung, Maklertermin, Mietvertrag |
| Wartung | plug | Wartung, Heizungswartung, Heizung warten, Schornsteinfeger, Rauchmelderprüfung, Zähler ablesen, Strom ablesen |
| Handwerker | faucet-drip | Handwerker, Klempner, Installateur, Sanitärtermin, Wasserinstallateur, Rohrreinigung |
| Elektriker | bolt | Elektriker, Elektroinstallation, Elektroprüfung, Stromanschluss, Internetanschluss, Technikertermin |
| Schlüsseldienst | key | Schlüsseldienst, Schlüssel nachmachen, Schloss tauschen |
| Winterdienst | snowflake | Winterdienst, Schnee räumen, Streuen, Schneeschippen |

## Einkaufen & Erledigungen

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Einkaufen | cart-shopping | Einkaufen, Einkauf, Wocheneinkauf, Lebensmittel, Supermarkt, Großeinkauf, Vorräte auffüllen |
| Wochenmarkt | carrot | Wochenmarkt, Bauernmarkt, Gemüsemarkt, Hofladen, Bioladen |
| Kleidung kaufen | shirt | Kleidung kaufen, Shopping, Schuhe kaufen, Klamotten kaufen, Kleiderkauf, Schuhkauf |
| Baumarkt | screwdriver-wrench | Baumarkt, Baumarkteinkauf, Bauhaus, Hornbach, Obi |
| Möbel kaufen | couch | Möbel kaufen, Möbelhaus, Ikea, Einrichtung kaufen |
| Drogerie | soap | Drogerie, Drogerieeinkauf, Rossmann, Müller Drogerie |
| Post | envelope | Post, Postfiliale, Brief abschicken, Brief einwerfen, Einschreiben, Briefmarken |
| Paket | box | Paket, Paket abholen, Paket abgeben, Paket versenden, Retoure, Packstation, Paketshop |
| Lieferung | truck | Lieferung, Liefertermin, Anlieferung, Möbellieferung, Spedition, Essenslieferung |
| Flohmarkt | tags | Flohmarkt, Kinderflohmarkt, Basar, Kleiderbasar, Trödelmarkt, Garagenverkauf |
| Schneider | scissors | Schneider, Änderungsschneiderei, Hose kürzen, Kleidung ändern |
| Schuster | shoe-prints | Schuster, Schuhreparatur, Schuhe reparieren |

## Auto & Fahrrad

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Werkstatt | car | Werkstatt, Autowerkstatt, Inspektion, Autoinspektion, Ölwechsel, Autoreparatur, Werkstatttermin |
| Hauptuntersuchung | clipboard-check | Hauptuntersuchung, TÜV, HU Termin, AU Termin, Abgasuntersuchung, DEKRA, GTÜ |
| Reifenwechsel | circle | Reifenwechsel, Winterreifen, Sommerreifen, Räderwechsel, Reifen umstecken, Reifenservice |
| Autowäsche | soap | Autowäsche, Waschanlage, Auto waschen, Auto reinigen |
| Tanken | gas-pump | Tanken, Tankstelle, Auto laden, Ladestation, Ladepause |
| Fahrradwerkstatt | bicycle | Fahrradwerkstatt, Fahrradreparatur, Fahrradinspektion, Fahrrad reparieren, Fahrradservice |
| Fahrschule | car-side | Fahrschule, Fahrstunde, Fahrprüfung, Führerscheinprüfung, Theorieprüfung, Fahrunterricht |
| Zulassungsstelle | id-card | Zulassungsstelle, Auto anmelden, Auto abmelden, Fahrzeugzulassung, Kfz Zulassung |

## Behörden & Finanzen

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Bürgeramt | landmark | Bürgeramt, Bürgerbüro, Rathaus, Einwohnermeldeamt, Meldeamt, Ummelden, Anmeldung Wohnsitz |
| Ausweis | id-card | Ausweis, Personalausweis, Ausweis beantragen, Ausweis abholen, Pass beantragen, Pass abholen |
| Notar | file-signature | Notar, Notartermin, Vertragsunterzeichnung, Kaufvertrag, Testament |
| Anwalt | scale-balanced | Anwalt, Anwältin, Rechtsanwalt, Rechtsanwältin, Rechtsberatung, Gerichtstermin |
| Bank | building-columns | Bank, Banktermin, Sparkasse, Konto eröffnen, Finanzierung, Kreditberatung |
| Steuern | calculator | Steuern, Steuererklärung, Steuerberater, Steuerberatung, Finanzamt, Lohnsteuer |
| Versicherung | shield-halved | Versicherung, Versicherungstermin, Versicherungsberatung, Versicherungswechsel |
| Rechnung | file-invoice-dollar | Rechnung, Rechnung bezahlen, Rechnungen bezahlen, Überweisung, Zahlungsfrist, Lastschrift |
| Haushaltsbudget | coins | Haushaltsbudget, Finanzplanung, Budgetplanung, Taschengeld, Finanzcheck |
| Vertrag | file-contract | Vertrag, Vertragsende, Vertrag kündigen, Kündigungsfrist, Vertragsverlängerung, Abo kündigen |
| Wahl | check-to-slot | Wahl, Wählen gehen, Wahltermin, Briefwahl, Bundestagswahl, Kommunalwahl, Europawahl |
| Beratung | hands-helping | Beratung, Beratungsstelle, Familienberatung, Elternberatung, Erziehungsberatung, Schuldnerberatung |

## Haustiere & Ehrenamt

| Zuordnung | SVG-Symbol | Erkannte Begriffe |
|---|---|---|
| Tierarzt | paw | Tierarzt, Tierärztin, Tierarzttermin, Tierklinik, Tierimpfung, Tierkontrolle |
| Hund | dog | Hund, Gassi, Gassigehen, Gassi gehen, Hundespaziergang, Hundeschule, Hundetraining, Hundefriseur, Hundesitter |
| Katze | cat | Katze, Katzensitter, Katzenbetreuung, Katzenpension, Katzenfutter kaufen |
| Pferd | horse | Pferd, Stalldienst, Pferdepflege, Hufschmied, Pferdefütterung |
| Aquarienpflege | fish | Aquarienpflege, Aquarium reinigen, Wasserwechsel, Fische füttern |
| Tierbetreuung | paw | Tierbetreuung, Tiersitter, Tierpension, Tierheim, Tierschutz, Haustierbetreuung |
| Ehrenamt | hands-holding-circle | Ehrenamt, Freiwilligendienst, Helfereinsatz, Vereinsarbeit, Vereinssitzung, Mitgliederversammlung |
| Feuerwehr | fire-extinguisher | Feuerwehr, Feuerwehrübung, Feuerwehrdienst, Jugendfeuerwehr, Freiwillige Feuerwehr |
| Erste Hilfe | kit-medical | Erste Hilfe, Erste Hilfe Kurs, Ersthelferkurs, Sanitätsdienst, DRK, THW, Rettungsdienst |
| Gemeinde | church | Gemeinde, Gottesdienst, Kirche, Gemeindefest, Kirchengemeinde, Gemeindegruppe |
| Umweltschutz | leaf | Umweltschutz, Müllsammeln, Clean Up, Cleanup, Naturschutzeinsatz, Pflanzaktion |

