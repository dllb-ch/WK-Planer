// Demo data, modelled on the Pi Kp example in "Führung im Zivilschutz – Anhänge" (WK-Konzept p. 17, Arbeitsprogramm p. 19).
import { fileURLToPath } from 'node:url';
import type { DB } from './db';
import { fillDayDuty, openDb, tx } from './db';
import { DEMO_PASSWORD, hashPassword } from './auth';
import { KDO_ID, type BlockType, type Role } from '../../shared/types';
import { DEFAULT_VORBEREITUNG, parseTime } from '../../shared/util';
import { insertMilestones, saveTemplate } from './vorbereitung';

export { DEMO_PASSWORD };

export async function seedDemo(db: DB) {
  await tx(db, async () => {
    const pw = hashPassword(DEMO_PASSWORD);
    const id = (r: { lastInsertRowid: number | bigint }) => Number(r.lastInsertRowid);

    const bat = id(
      (await db.prepare('INSERT INTO bataillon (name, region_name) VALUES (?, ?)').run('ZS Bat Musterregion', 'Zivilschutzorganisation Region Musterland')),
    );
    const piKp = id((await db.prepare('INSERT INTO kompanie (bat_id, name) VALUES (?, ?)').run(bat, 'Pi Kp')));
    const betrKp = id((await db.prepare('INSERT INTO kompanie (bat_id, name) VALUES (?, ?)').run(bat, 'Betreu Kp')));

    const zug = async (kp: number, name: string, sort: number) =>
      id((await db.prepare('INSERT INTO zug (kp_id, name, sort) VALUES (?, ?, ?)').run(kp, name, sort)));
    const z1 = await zug(piKp, 'Pi Z 1', 1);
    const z2 = await zug(piKp, 'Pi Z 2', 2);
    const z3 = await zug(piKp, 'Pi Z 3', 3);
    const zl = await zug(piKp, 'Log Z', 4);
    const bz1 = await zug(betrKp, 'Betreu Z 1', 1);
    const bz2 = await zug(betrKp, 'Betreu Z 2', 2);

    const addUser = async (name: string, email: string, role: Role, kp: number | null, z: number | null, funktion: string) =>
      id(
        (await db
          .prepare('INSERT INTO app_user (name, email, pw_hash, role, bat_id, kp_id, zug_id, funktion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(name, email, pw, role, bat, kp, z, funktion)),
      );
    await addUser('Org Admin', 'admin@demo.ch', 'ADMIN', null, null, 'Administration Zivilschutz');
    await addUser('Maj Keller', 'bat@demo.ch', 'BAT', null, null, 'Bat Kdt');
    await addUser('Hptm Meier', 'kpkdt@demo.ch', 'KPKDT', piKp, null, 'Kp Kdt Pi Kp');
    await addUser('Hptm Frei', 'kpkdt.betreu@demo.ch', 'KPKDT', betrKp, null, 'Kp Kdt Betreu Kp');
    const zf = [
      (await addUser('Lt Gruber', 'zfhr1@demo.ch', 'ZFHR', piKp, z1, 'Zfhr Pi Z 1')),
      (await addUser('Lt Wenger', 'zfhr2@demo.ch', 'ZFHR', piKp, z2, 'Zfhr Pi Z 2')),
      (await addUser('Lt Berger', 'zfhr3@demo.ch', 'ZFHR', piKp, z3, 'Zfhr Pi Z 3')),
      (await addUser('Lt Koch', 'zfhrlog@demo.ch', 'ZFHR', piKp, zl, 'Zfhr Log Z')),
    ];
    for (const [i, z] of [z1, z2, z3, zl].entries()) await db.prepare('UPDATE zug SET zfhr_user_id = ? WHERE id = ?').run(zf[i], z);
    await addUser('Lt Ammann', 'zfhr1stv@demo.ch', 'ZFHR', piKp, z1, 'Zfhr Stv Pi Z 1');
    await addUser('Oblt Brand', 'logof@demo.ch', 'LOGOF', piKp, null, 'Log Of Pi Kp');
    const huber = await addUser('Wm Huber', 'kader@demo.ch', 'KADER', piKp, z1, 'Grfhr Pi Z 1');
    await addUser('Kpl Steiner', 'kader2@demo.ch', 'KADER', piKp, z2, 'Grfhr Pi Z 2');
    const bzf = await addUser('Lt Kummer', 'zfhr.betreu@demo.ch', 'ZFHR', betrKp, bz1, 'Zfhr Betreu Z 1');
    await db.prepare('UPDATE zug SET zfhr_user_id = ? WHERE id = ?').run(bzf, bz1);

    // ---- Ausbildungsbefehl ----
    const befehl = id(
      (await db
        .prepare('INSERT INTO befehl (bat_id, year, dienstart, leitziel, absicht, organisation, besonderes) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(
          bat,
          2027,
          'Wiederholungskurse nach Art. 53 BZG',
          'Die Formationen des Bataillons erreichen und erhalten die Einsatzbereitschaft für Hochwasserereignisse gemäss Leistungsauftrag.',
          'Ich will, dass jeder Fachbereich die Abläufe im Hochwassereinsatz gemäss Leistungsauftrag trainiert, dass Zugsübungen unter realitätsnahen Voraussetzungen durchgeführt werden und dass optimale Voraussetzungen für den Einsatz geschaffen werden.',
          'Kursleitung: jeweilige Kp Kdt. Material und Fahrzeuge werden durch die Stabskompanie gestellt.',
          'Dienstbetrieb gemäss Dienstreglement. Disziplinarfälle sind a d Dw dem Bat Kdt zu melden.',
        )),
    );
    const auftrag = db.prepare(
      'INSERT INTO auftrag_kp (befehl_id, kp_id, richtziele, teilnehmende, kvk_dates, wk_from, wk_to) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    await auftrag.run(
      befehl,
      piKp,
      'Die Pi Kp kann mobile behelfsmässige Wasserschutzmassnahmen innerhalb von 3–5 Stunden aufbauen und während Stunden aufrechterhalten.\nZusammenarbeit mit der Feuerwehr in einer Übung trainieren.',
      'Gesamte Pi Kp (92 AdZS), Kader Log Z, 1 Four, 1 Kü C, 4 Kü Geh, 6 Fahrer',
      JSON.stringify(['2027-03-13', '2027-04-26']),
      '2027-04-27',
      '2027-04-30',
    );
    await auftrag.run(
      befehl,
      betrKp,
      'Die Betreu Kp kann eine Betreuungsstelle für 200 Personen innerhalb von 6 Stunden in Betrieb nehmen.',
      'Gesamte Betreu Kp',
      JSON.stringify(['2027-05-31']),
      '2027-06-01',
      '2027-06-03',
    );

    // ---- WK Pi Kp (draft) ----
    const wk = id(
      (await db
        .prepare('INSERT INTO wk (kp_id, title, start_date, end_date, day_start, day_end, snap_min, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(piKp, 'WK I / 2027 Pi Kp', '2027-04-27', '2027-04-30', 420, 1020, 15, 'ENTWURF')),
    );
    // AVOR days for the Kader: Kaderarbeitstag in March and the KVK the day before the WK.
    // Kaderarbeitstag of the Kdo (AVOR) and the KVK the day before the WK.
    await db.prepare('UPDATE wk SET avor_days = ?, kvk_days = ? WHERE id = ?').run(JSON.stringify(['2027-03-13']), JSON.stringify(['2027-04-26']), wk);
    // Vorbereitung: Bat template = built-in default; items due before the seed date are done by everyone responsible.
    await saveTemplate(db, bat, null, DEFAULT_VORBEREITUNG);
    await insertMilestones(db, wk, '2027-04-27', DEFAULT_VORBEREITUNG);
    await db.prepare(
      `INSERT INTO milestone_done (milestone_id, user_id)
       SELECT m.id, app_user.id FROM milestone m JOIN app_user ON app_user.role = m.owner_role AND (app_user.kp_id = ? OR (app_user.role = 'BAT' AND app_user.bat_id = ?))
       WHERE m.wk_id = ? AND m.due_date < '2026-10-01'`,
    ).run(piKp, bat, wk);
    // Lt Gruber is ahead of the other Zugführer.
    await db.prepare(
      `INSERT INTO milestone_done (milestone_id, user_id)
       SELECT id, ?::int FROM milestone WHERE wk_id = ? AND owner_role = 'ZFHR' AND due_date < '2027-03-20'
       ON CONFLICT DO NOTHING`,
    ).run(zf[0], wk);

    const loc = async (nr: number, name: string) =>
      id((await db.prepare('INSERT INTO location (wk_id, nr, name) VALUES (?, ?, ?)').run(wk, nr, name)));
    const L1 = await loc(1, 'Werkhof');
    const L2 = await loc(2, 'Kieswerk');
    const L3 = await loc(3, 'BSA Bühl');
    const L4 = await loc(4, 'Wangen a.A.');

    const days = ['2027-04-26', '2027-04-27', '2027-04-28', '2027-04-29', '2027-04-30', '2027-03-13'];
    const PI = [z1, z2, z3];
    const ALL = [z1, z2, z3, zl];
    const KDO = [KDO_ID];
    const KALL = [KDO_ID, ...ALL];
    const insBlock = db.prepare(
      `INSERT INTO block (wk_id, date, start_min, end_min, zug_ids, title, type, location_id, verantwortlich, notes, locked, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const b = async (
      day: number,
      from: string,
      to: string,
      zuege: number[],
      title: string,
      type: BlockType,
      opts: { loc?: number; who?: string; notes?: string; locked?: boolean; bat?: boolean } = {},
    ) =>
      Number(
        (await insBlock.run(
        wk,
        days[day],
        parseTime(from),
        parseTime(to),
        JSON.stringify(zuege),
        title,
        type,
        opts.loc ?? null,
        opts.who ?? '',
        opts.notes ?? '',
        opts.locked || opts.bat ? 1 : 0,
        opts.bat ? 'BAT' : 'KP',
        )).lastInsertRowid,
      );

    // Kaderarbeitstag (AVOR, März)
    await b(5, '08:00', '12:00', KALL, 'Kaderarbeitstag: Konzept bereinigen, Aufträge Detailvorbereitung', 'RAPPORT', { loc: L1, who: 'Kp Kdt' });
    await b(5, '13:00', '16:00', PI, 'Rekognoszierung Arbeitsplätze', 'AVOR', { loc: L2 });
    await b(5, '13:00', '16:00', KDO, 'Kdo: Ressourcenplanung mit Log Of', 'AVOR', { loc: L1, who: 'Oblt Brand' });

    // Montag: KVK (AVOR)
    await b(0, '08:00', '08:30', KALL, 'Kurseröffnung KVK', 'APPELL', { loc: L1, who: 'Kp Kdt', locked: true });
    await b(0, '08:30', '12:00', ALL, 'KVK: Vorbereitung Ausbildungssequenzen', 'AVOR', {
      loc: L1,
      who: 'Kp Kdt',
      notes: 'Kdt, Stv, Zfhr Pi, Grfhr Pi, Zfhr Log, Kü C, Kü Geh, Fahrer',
    });
    await b(0, '12:00', '13:00', ALL, 'Mittagessen', 'VERPFLEGUNG', { loc: L1 });
    await b(0, '13:00', '16:00', PI, 'Testen Ausbildungssequenzen / Arbeitsplätze einrichten', 'AVOR', { loc: L2 });
    await b(0, '13:00', '16:00', [zl], 'Vorbereitung Küche und Transporte', 'AVOR', { loc: L1, who: 'Lt Koch' });
    await b(0, '08:30', '12:00', KDO, 'Kdo: Kontrolle Arbeitsplätze', 'AVOR', { who: 'Kp Kdt' });
    await b(0, '12:00', '13:00', KDO, 'Mittagessen', 'VERPFLEGUNG', { loc: L1 });
    await b(0, '13:00', '16:00', KDO, 'Kdo: Abnahme Ausbildungssequenzen', 'AVOR', { who: 'Kp Kdt / Stv' });
    await b(0, '16:00', '17:00', KALL, 'Kaderrapport', 'RAPPORT', { loc: L1, who: 'Kp Kdt', locked: true });

    // Dienstag: Detailausbildung
    await b(1, '07:00', '07:30', KDO, 'Kdo-Rapport', 'RAPPORT', { loc: L1, who: 'Kp Kdt' });
    await b(1, '07:30', '08:15', KALL, 'Kurseröffnung / Appell', 'APPELL', { loc: L1, who: 'Kp Kdt', locked: true });
    const sofort = await b(1, '08:15', '09:30', PI, 'Sofortausbildung Grundlagen', 'AUSBILDUNG', { loc: L1 });
    await b(1, '08:15', '12:00', KDO, 'Kdo: Besuch Arbeitsplätze', 'DIVERSES', { who: 'Kp Kdt' });
    await b(1, '08:15', '10:00', [zl], 'Info C Log / Marschbereitschaft erstellen', 'AVOR', { loc: L1 });
    await b(1, '09:30', '09:45', PI, 'Vs', 'VERSCHIEBUNG');
    const da1 = await b(1, '09:45', '12:00', [z1], 'Detailausbildung 1', 'AUSBILDUNG', { loc: L1, who: 'Lt Gruber' });
    await b(1, '09:45', '12:00', [z2], 'Detailausbildung 2', 'AUSBILDUNG', { loc: L2, who: 'Lt Wenger' });
    await b(1, '09:45', '12:00', [z3], 'Detailausbildung 3', 'AUSBILDUNG', { loc: L3, who: 'Lt Berger' });
    await b(1, '10:00', '12:00', [zl], 'Verpflegung bereitstellen', 'VERPFLEGUNG', { loc: L1 });
    await b(1, '12:00', '13:00', ALL, 'Mittagessen', 'VERPFLEGUNG', { loc: L1 });
    await b(1, '13:00', '15:45', [z1], 'Detailausbildung 2', 'AUSBILDUNG', { loc: L2, who: 'Lt Gruber' });
    await b(1, '13:00', '15:45', [z2], 'Detailausbildung 3', 'AUSBILDUNG', { loc: L3, who: 'Lt Wenger' });
    await b(1, '13:00', '15:45', [z3], 'Detailausbildung 1', 'AUSBILDUNG', { loc: L1, who: 'Lt Berger' });
    await b(1, '13:00', '16:00', [zl], 'Transporte / Retablieren Küche', 'RETABLIEREN', { loc: L1 });
    await b(1, '15:45', '16:30', PI, 'Retablieren', 'RETABLIEREN', { loc: L1 });
    await b(1, '16:30', '17:00', KALL, 'Kaderrapport', 'RAPPORT', { loc: L1, who: 'Kp Kdt', locked: true });

    // Mittwoch: Fachausbildung / Gruppenübung, Besuch Bat Kdt
    await b(2, '07:30', '07:45', ALL, 'Appell', 'APPELL', { loc: L1, locked: true });
    await b(2, '07:45', '12:00', PI, 'Fachausbildung', 'AUSBILDUNG', { loc: L1, notes: 'Pumpen, Riverside, Motorspritze' });
    await b(2, '07:45', '12:00', [zl], 'Ausbildung Kochen im Felde', 'AUSBILDUNG', { loc: L1 });
    await b(2, '12:00', '13:00', ALL, 'Mittagessen', 'VERPFLEGUNG', { loc: L1 });
    await b(2, '13:00', '13:30', PI, 'Vs', 'VERSCHIEBUNG');
    await b(2, '13:30', '15:30', PI, 'Gruppenübung', 'UEBUNG', { loc: L3 });
    await b(2, '13:00', '15:30', [zl], 'Verpflegungsstelle bereitstellen', 'VERPFLEGUNG', { loc: L1 });
    await b(2, '15:30', '16:15', KALL, 'Besuch Bat Kdt / Info Kdt', 'DIVERSES', { loc: L3, who: 'Maj Keller', bat: true });
    await b(2, '16:15', '17:00', ALL, 'Retablieren / Kaderrapport', 'RETABLIEREN', { loc: L1 });

    // Donnerstag: Instandstellung Dorfbach
    await b(3, '07:30', '07:45', ALL, 'Appell', 'APPELL', { loc: L1, locked: true });
    await b(3, '07:45', '08:15', PI, 'Vs', 'VERSCHIEBUNG');
    await b(3, '08:15', '12:00', PI, 'Instandstellung Dorfbach', 'UEBUNG', { loc: L2, notes: 'Einsatz mit Gde Vertreter' });
    await b(3, '08:00', '12:00', [zl], 'Mittagsverpflegung vor Ort', 'VERPFLEGUNG', { loc: L2 });
    await b(3, '12:00', '13:00', ALL, 'Mittagessen', 'VERPFLEGUNG', { loc: L2 });
    await b(3, '13:00', '15:30', PI, 'Instandstellung Dorfbach', 'UEBUNG', { loc: L2 });
    await b(3, '15:30', '16:00', PI, 'Vs', 'VERSCHIEBUNG');
    await b(3, '16:00', '17:00', ALL, 'AVOR Übung «AQUA» / Kaderrapport', 'RAPPORT', { loc: L1, who: 'Kp Kdt' });

    // Freitag: Übung AQUA
    await b(4, '07:00', '07:30', ALL, 'Appell / Marschbereitschaft', 'APPELL', { loc: L1, locked: true });
    await b(4, '07:30', '08:00', ALL, 'Vs (4)', 'VERSCHIEBUNG');
    await b(4, '08:00', '15:00', PI, 'Übung «AQUA» mit Feuerwehr', 'UEBUNG', {
      loc: L4,
      who: 'Kp Kdt',
      locked: true,
      notes: 'Figuranten: 6 Pers. FW, 6 Pers. Samariterverein',
    });
    await b(4, '08:00', '15:00', [zl], 'Verpflegung im Felde (2 Vpfl Stellen)', 'VERPFLEGUNG', { loc: L4 });
    await b(4, '15:00', '15:30', ALL, 'Vs', 'VERSCHIEBUNG');
    await b(4, '15:30', '16:30', ALL, 'Retablieren', 'RETABLIEREN', { loc: L1 });
    await b(4, '16:30', '17:00', ALL, 'Entlassung', 'APPELL', { loc: L1, who: 'Kp Kdt', locked: true });

    // Detailplanung Pi Z 1 (Zfhr-Zeitplan, Anhänge p. 21)
    const det = db.prepare('INSERT INTO block_detail (block_id, zug_id, start_min, end_min, title, verantwortlich) VALUES (?, ?, ?, ?, ?, ?)');
    await det.run(sofort, z1, parseTime('08:15'), parseTime('08:50'), 'Kameradenhilfe: Ampelschema, Lagerung / Vorplatz BSA', 'Wm Huber');
    await det.run(sofort, z1, parseTime('08:50'), parseTime('09:30'), 'Polycom TPH 700: Kanalwechsel, Sprechregeln', 'Lt Ammann');
    // Pi Z 1 works in three groups; Detailausbildung 1 is a rotation over three posts (Postenarbeit, Anhänge p. 22).
    const grp = db.prepare('INSERT INTO zug_group (wk_id, zug_id, name, sort) VALUES (?, ?, ?, ?)');
    const groups: number[] = [];
    for (const [i, name] of ['Gr 1', 'Gr 2', 'Gr 3'].entries()) groups.push(Number((await grp.run(wk, z1, name, i)).lastInsertRowid));
    const posten = [
      ['Po 1 Kameradenhilfe / Vorplatz BSA', 'Wm Huber'],
      ['Po 2 Polycom / Gelände Werkhof', 'Kpl Graf'],
      ['Po 3 Pumpen / Werkhof', 'Kpl Imhof'],
    ];
    const detG = db.prepare(
      'INSERT INTO block_detail (block_id, zug_id, start_min, end_min, title, verantwortlich, group_ids) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const [slot, from] of ['09:45', '10:30', '11:15'].entries()) {
      for (const [k, g] of groups.entries()) {
        const [title, who] = posten[(slot + k) % 3];
        await detG.run(da1, z1, parseTime(from), parseTime(from) + 45, title, who, JSON.stringify([g]));
      }
    }

    // Ausbildungsvorbereitung Grfhr (Anhänge p. 24–25)
    await db.prepare('INSERT INTO ausbildungsvorbereitung (wk_id, block_id, zug_id, created_by, data) VALUES (?, ?, ?, ?, ?)').run(
      wk,
      sofort,
      z1,
      huber,
      JSON.stringify({
        ausbildungsart: 'Festigungsstufe',
        thema: 'Kameradenhilfe',
        datum: '2027-04-27',
        zeitVon: '08:15',
        zeitBis: '08:50',
        teilnehmer: '8',
        arbeitsplatz: 'Vorplatz BSA',
        leiter: 'Wm Huber',
        grundlagen: 'Reglement Nothilfe 1309-08-1',
        stufe: 'FESTIGEN',
        zielsetzungen: [
          'Die Rettungskette und das Ampelschema gemäss Reglement Nothilfe ohne Hilfe korrekt anwenden und erklären',
          'Einen Verletzten beurteilen und eine situationsgerechte Lagerung vornehmen',
          'Eine Verletzung beurteilen und mit dem Dreiecktuch korrekte behelfsmässige Verbände machen',
          'Einen Verletzten situationsgerecht bergen und korrekt transportieren',
        ],
        persAusruestung: 'Arbeitsanzug',
        postenplakat: 'Plakat mit den Lagerungen und dem Ampelschema',
        fahrzeug: 'keines',
        material: '2 Bahren, 30 Dreieckstücher, 6 Wolldecken, Sanitätsrucksack, 15 elastische Binden',
        unterlagen: '30 Regl. Nothilfe zur Abgabe, Auftragspapiere, Testbogen',
        bemerkungen: '',
        controlling: 'Am Schluss der Sequenz Einzeltests, Ergebnis in die Ausbildungskontrolle übertragen.',
        ablauf: [
          { dauer: 5, phase: 'P', text: 'Einführung mit aktivem Rollenspiel (Grfhr fällt um und blutet) – Was ist zu tun?' },
          { dauer: 10, phase: 'I', text: 'Zielsetzungen bekanntgeben, Wissen abfragen: Ampelschema, Bergung, Lagerung, Verbände' },
          { dauer: 15, phase: 'T1', text: 'In Zweierteams gemäss Auftragspapier durcharbeiten' },
          { dauer: 5, phase: 'T2', text: 'Einzelsprung: Wissensabfrage mit Testbogen' },
        ],
      }),
    );

    // Ressourcen-Katalog und Anfragen
    // Vehicles are shared by all Kompanien of the Bataillon; rooms and terrain belong to the Pi Kp.
    const resIns = db.prepare('INSERT INTO resource (bat_id, kp_id, kind, category, name, description, capacity, seats, area) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const res = async (kind: string, name: string, capacity = '', area: [number, number][] | null = null, description = '', kp: number | null = piKp) =>
      Number((await resIns.run(bat, kp, kind, name.replace(/\s*\d+$/, ''), name, description, capacity, kind === 'FAHRZEUG' ? Number(capacity.match(/\d+/)?.[0] ?? 0) : 0, area ? JSON.stringify(area) : null)).lastInsertRowid);
    const bus1 = await res('FAHRZEUG', 'Mannschaftsbus 1', '9 Pl.', null, 'Standort Stabskompanie', null);
    await res('FAHRZEUG', 'Mannschaftsbus 2', '9 Pl.', null, 'Standort Stabskompanie', null);
    await res('FAHRZEUG', 'Pickup 1', '4 Pl.', null, '', null);
    await res('FAHRZEUG', 'Pickup 2', '4 Pl.', null, '', null);
    await res('FAHRZEUG', 'Lastwagen mit Kran', '2 Pl.', null, 'Nur mit Fahrer Kat. C', null);
    await res('RAUM', 'Theoriesaal 1 MZH', '40 Pers.');
    await res('RAUM', 'Theoriesaal BSA Bühl', '25 Pers.');
    const kies = await res('GELAENDE', 'Kieswerk', '', [[47.2418, 7.6395], [47.2425, 7.644], [47.24, 7.6452], [47.2393, 7.6405]], 'Zufahrt über Werkstrasse');
    await res('GELAENDE', 'Werkhof Vorplatz', '', [[47.2338, 7.656], [47.2342, 7.6575], [47.2333, 7.658], [47.233, 7.6565]]);
    await res('GELAENDE', 'Aareufer Wangen (Übungsraum AQUA)', '', [[47.2365, 7.648], [47.2372, 7.653], [47.236, 7.6535], [47.2355, 7.6485]]);
    const reqIns = db.prepare(
      `INSERT INTO resource_request (wk_id, zug_id, block_id, resource_id, kind, date, start_min, end_min, zweck, note, status, requested_by, decided_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    await reqIns.run(wk, z3, null, bus1, 'FAHRZEUG', '2027-04-27', 600, 660, 'Materialtransport BSA Bühl', '', 'BEWILLIGT', zf[2], zf[3]);
    await reqIns.run(wk, z1, da1, bus1, 'FAHRZEUG', '2027-04-27', 585, 720, 'Verschiebung Gr 3 zum Kieswerk', '', 'BEANTRAGT', zf[0], null);
    // Requested by amount; the Log Of assigns the concrete pickups when approving.
    await db.prepare(
      `INSERT INTO resource_request (wk_id, zug_id, block_id, resource_id, kind, category, quantity, date, start_min, end_min, zweck, note, status, requested_by)
       VALUES (?, ?, NULL, NULL, 'FAHRZEUG', 'Pickup', 2, '2027-04-29', 450, 1020, 'Material Instandstellung Dorfbach', 'Mit Anhängerkupplung', 'BEANTRAGT', ?)`,
    ).run(wk, z2, zf[1]);
    await reqIns.run(wk, z2, null, kies, 'GELAENDE', '2027-04-27', 585, 720, 'Detailausbildung 2: Rückhaltebecken', 'Absprache mit Kieswerk erfolgt', 'BEWILLIGT', zf[1], zf[3]);

    await db.prepare('INSERT INTO konzept (wk_id, data) VALUES (?, ?)').run(
      wk,
      JSON.stringify({
        orientierung:
          'Der Wiederholungskurs I / 2027 der Pionierkompanie dient der Festigung von Detailkenntnissen und deren Anwendung im praktischen Umfeld sowie der Formationsschulung. Die Zusammenarbeit mit den Partnerorganisationen soll gefördert werden.',
        organisation:
          'Kursleitung: Hptm Meier, Stv: Oblt Huber\nPi Zug 1: Lt Gruber\nPi Zug 2: Lt Wenger\nPi Zug 3: Lt Berger\nLog Z: Lt Koch\nKü C: Müller',
        absicht:
          'Im ersten Teil des WK mit allen Pi Zügen in der Detailausbildung die Bedienung und den Einsatz der Geräte zur Wasserwehr festigen.\nIm zweiten Teil die Geräte unter erschwerten Bedingungen situationsbezogen einsetzen.\nAm letzten Tag die Abläufe bei einem Hochwasserereignis mit einer 6-stündigen Übung überprüfen und die Zusammenarbeit mit der Feuerwehr trainieren.',
        zielsetzungen: [
          'Der Unterstützungszug kann die Gerätschaften zur Wasserwehr situationsbezogen und unter Einhaltung der Sicherheitsvorschriften zeitgerecht einsetzen.',
          'Der Unterstützungszug kann mobile behelfsmässige Wasserschutzmassnahmen innerhalb von 3–5 Stunden aufbauen und während Stunden aufrechterhalten.',
          'Der Unterstützungszug kann innerhalb von 3 Stunden ein Rückhaltebecken für 120 m³ errichten.',
          'Die Logistik stellt während der ganzen WK-Zeit die Transporte und die Verpflegung sicher.',
          'Sämtliche AdZS haben die Kenntnisse in Polycom und Kameradenhilfe aufgefrischt.',
        ],
        verpflegung: 'Eigener Haushalt im KVK und WK. Am Freitag wird im Felde gekocht, Abgabe an zwei Verpflegungsstellen.',
        material:
          '2 Mannschaftsbusse und 2 Pickups der Nachbarorganisation. Sandsäcke, Schalungstafeln und Plastik im Werkhof. Transporte beim Zfhr Log bestellen.',
        standorte: 'Werkhof (1), Kieswerk (2), BSA Bühl (3), Übung in Wangen a.A. (4). Führung und Logistik ab Einrückungsstandort Eywald.',
      }),
    );

    await db.prepare('INSERT INTO zfhr_programm (wk_id, zug_id, data) VALUES (?, ?, ?)').run(
      wk,
      z1,
      JSON.stringify({
        ziele: [
          'Jeder AdZS des Pi Zuges beherrscht das Ampelschema, die Lagerungsarten und die Notverbände gemäss Regl. Nothilfe.',
          'Jeder AdZS kann das TPH 700 bedienen, beherrscht den Kanalwechsel und die Sprechregeln.',
          'Jede Gruppe kann sämtliche Pumpen des Zugsortiments in Betrieb nehmen und zeitgerecht einsetzen.',
          'Jede Gruppe kann behelfsmässige Wasserschutzmassnahmen innerhalb von 3–5 Stunden aufbauen.',
          'Jede Gruppe kann innerhalb von 3 Stunden ein Rückhaltebecken für 120 m³ errichten.',
        ],
        gruppen: ['Gr 1', 'Gr 2', 'Gr 3'],
        posten: [
          { nr: 1, thema: 'Kameradenhilfe', ort: 'Vorplatz BSA', lernziel: 'Ziel 1', material: 'Dreieckstücher, Wolldecken, Bahren', postenchef: 'Wm Huber' },
          { nr: 2, thema: 'Polycom', ort: 'Gelände Werkhof', lernziel: 'Ziel 2', material: '7 TPH 700', postenchef: 'Kpl Graf' },
          { nr: 3, thema: 'Pumparbeiten', ort: 'BSA Bühl', lernziel: 'Ziel 3', material: 'Zugsortiment Wasser, Riverside, Motorspritze', postenchef: 'Kpl Imhof' },
        ],
        rotation: [],
        zfhrAktivitaeten: 'Besuch aller Posten, Ausbildungskontrolle Ziel 1–3, Besprechung mit Grfhr um 15:45.',
      }),
    );

    // ---- WK Betreu Kp (submitted, waiting for the Bat) ----
    const wk2 = id(
      (await db
        .prepare('INSERT INTO wk (kp_id, title, start_date, end_date, day_start, day_end, snap_min, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(betrKp, 'WK 2027 Betreu Kp', '2027-06-01', '2027-06-03', 450, 1020, 15, 'EINGEREICHT')),
    );
    // The Betreu Kp has its own, shorter Vorbereitung.
    const betreuTemplate = DEFAULT_VORBEREITUNG.filter((it) => it.ownerRole !== 'LOGOF').concat({
      title: 'Absprache mit Pflegeheim über Einsatz der Betreuer',
      description: 'Kontaktperson, Hausordnung, Einsatzzeiten.',
      daysBefore: 60,
      ownerRole: 'KPKDT',
    });
    await saveTemplate(db, bat, betrKp, betreuTemplate);
    await insertMilestones(db, wk2, '2027-06-01', betreuTemplate);
    const bl = id((await db.prepare('INSERT INTO location (wk_id, nr, name) VALUES (?, ?, ?)').run(wk2, 1, 'Schulhaus Thunstrasse')));
    const BZ = [bz1, bz2];
    // The Betreu Kp also uses the shared Mannschaftsbus 1.
    const betreuZfhr = (await db.prepare("SELECT id FROM app_user WHERE email = 'zfhr.betreu@demo.ch'").get()) as any;
    const betreuKdt = (await db.prepare("SELECT id FROM app_user WHERE email = 'kpkdt.betreu@demo.ch'").get()) as any;
    await db.prepare(
      `INSERT INTO resource_request (wk_id, zug_id, block_id, resource_id, kind, date, start_min, end_min, zweck, note, status, requested_by, decided_by)
       VALUES (?, ?, NULL, ?, 'FAHRZEUG', '2027-06-02', 480, 720, 'Transport Betreute zum Pflegeheim', '', 'BEWILLIGT', ?, ?)`,
    ).run(wk2, bz1, bus1, betreuZfhr.id, betreuKdt.id);
    for (const day of ['2027-06-01', '2027-06-02', '2027-06-03']) {
      await insBlock.run(wk2, day, 450, 480, JSON.stringify(BZ), 'Appell', 'APPELL', bl, 'Kp Kdt', '', 1, 'KP');
      await insBlock.run(wk2, day, 480, 720, JSON.stringify(BZ), 'Betrieb Betreuungsstelle', 'AUSBILDUNG', bl, '', '', 0, 'KP');
      await insBlock.run(wk2, day, 720, 780, JSON.stringify(BZ), 'Mittagessen', 'VERPFLEGUNG', bl, '', '', 0, 'KP');
      await insBlock.run(wk2, day, 780, 990, JSON.stringify(BZ), 'Aufnahme von Evakuierten', 'UEBUNG', bl, '', '', 0, 'KP');
      await insBlock.run(wk2, day, 990, 1020, JSON.stringify(BZ), 'Kaderrapport', 'RAPPORT', bl, 'Kp Kdt', '', 1, 'KP');
    }
  });
  await fillDayDuty(db);
}

/** `npm run seed`: wipe and re-create the demo data. */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = await openDb();
  await db.exec('DELETE FROM session; DELETE FROM audit_log; DELETE FROM app_user; DELETE FROM bataillon;');
  await seedDemo(db);
  console.log(`Demo-Daten angelegt. Passwort für alle Demo-Konten: ${DEMO_PASSWORD}`);
}
