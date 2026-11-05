// German: the source language. Every key here must exist in fr, it and en (the type Catalog enforces it).
// Terms follow docs/glossar.md (BABS: Handbuch Führung im Zivilschutz, Weisungen Sicherheitsvorschriften).
// Placeholders: {name}.
export const de = {
  // ---- Common ----
  'common.loading': 'Laden …',
  'common.language': 'Sprache',

  // ---- Diet (Verpflegung) ----
  'diet.NORMAL': 'Normal',
  'diet.KEIN_SCHWEIN': 'Kein Schwein',
  'diet.VEGETARISCH': 'Vegetarisch',

  // ---- Sanitarische Eintrittsbefragung (Weisungen BABS Sicherheitsvorschriften, Art. 6 Abs. 2, in der Ich-Form) ----
  'health.title': 'Sanitarische Eintrittsbefragung',
  'health.A': 'Ich habe ein ärztliches Zeugnis oder medizinische Akten mitgebracht.',
  'health.B': 'Ich habe vor dem Dienst eine schwere Krankheit durchgemacht oder einen schweren Unfall erlitten.',
  'health.C': 'Ich leide an einer Gesundheitsschädigung, Krankheit oder Unfallfolge.',
  'health.D': 'Ich habe vor dem Dienst eine ansteckende Krankheit durchgemacht oder war möglicherweise mit einer ansteckenden Krankheit in Kontakt.',
  'health.E': 'Ich glaube, den Anforderungen des Dienstes aus medizinischen Gründen nicht gewachsen zu sein.',
  'healthStatus.GESUND': 'Gesund',
  'healthStatus.MELDUNG': 'Gemeldet – zum Kursarzt',
  'healthStatus.KURSARZT': 'Beim Kursarzt gewesen',
  'healthStatus.ERLEDIGT': 'Erledigt',

  // ---- QR check-in (public page, informal) ----
  'checkin.title': 'Check-in',
  'checkin.thanks': 'Danke, {name}!',
  'checkin.matched': 'Du bist eingecheckt.',
  'checkin.received': 'Dein Check-in ist eingegangen.',
  'checkin.notMatched': 'Wir konnten dich nicht eindeutig auf der Liste finden – der Kp Kdt ordnet dich zu.',
  'checkin.reported': 'Deine Meldung ist eingegangen. Melde dich bitte beim Kp Kdt – du wirst dem Kursarzt zugeführt.',
  'checkin.edit': 'Angaben ändern',
  'checkin.closed': 'Der Check-in für {day} ist nicht offen. Er ist nur an diesem Tag möglich.',
  'checkin.as': 'Einchecken als {name}',
  'checkin.notYou': 'Nicht {name}?',
  'checkin.firstName': 'Vorname',
  'checkin.lastName': 'Nachname',
  'checkin.email': 'E-Mail',
  'checkin.optional': 'freiwillig',
  'checkin.zug': 'Zug',
  'checkin.food': 'Essen',
  'checkin.intolerances': 'Unverträglichkeiten, z. B. laktosefrei, Nüsse',
  'checkin.addIntolerance': '+ Unverträglichkeit / Allergie angeben',
  'checkin.submit': 'Einchecken',
  'checkin.chooseZug': 'Bitte deinen Zug wählen.',
  'checkin.healthAsk': 'Bitte noch beantworten.',
  'checkin.healthAgain': 'Du hast die Befragung schon beantwortet. Hat sich etwas geändert? Eine frühere Meldung bleibt bestehen, bis der Kp Kdt sie mit dir geklärt hat.',
  'checkin.healthWhich': 'Was trifft auf dich zu?',
  'checkin.healthAny': 'Trifft einer dieser Punkte auf dich zu?',
  'checkin.healthNote': 'Kurz beschreiben (freiwillig, nur für den Kp Kdt)',
  'checkin.healthReport': 'Melden und einchecken',
  'checkin.healthCancel': 'Doch nicht – nichts trifft zu',
  'checkin.healthy': 'Nichts davon – gesund einchecken',
  'checkin.healthSomething': 'Etwas trifft zu …',

  // ---- Server messages of the public check-in ----
  'err.checkin.invalidCode': 'Dieser QR-Code ist nicht (mehr) gültig',
  'err.checkin.closed': 'Der Check-in für diesen Tag ist nicht offen',
  'err.checkin.unknownZug': 'Unbekannter Zug',
  'err.checkin.healthRequired': 'Bitte zuerst die sanitarische Eintrittsbefragung ausfüllen',
  'err.invalidInput': 'Ungültige Eingabe',
  'err.internal': 'Interner Fehler',
  'err.tooLarge': 'Die Datei ist zu gross',

  // ---- Mein Konto ----
  'profile.language': 'Sprache',
  'profile.languageHint': 'Sprache der Oberfläche und der Ausdrucke. Eingegebene Inhalte bleiben, wie sie erfasst wurden.',
  'profile.languageSaved': 'Sprache gespeichert',
};

export type Key = keyof typeof de;
export type Catalog = Record<Key, string>;
