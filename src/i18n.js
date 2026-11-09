// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: connection statuses, the results of the buttons, the widget.
// German says "du", Spanish "usted", like Gladys. Voice and family names are
// never translated.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // connection status and buttons
  statusNoKey: {
    en: 'No Google Cloud API key: create one in the Google Cloud console (APIs & Services, Credentials) and paste it in the configuration.',
    fr: 'Pas de clé d’API Google Cloud : créez-en une dans la console Google Cloud (API et services, Identifiants) et collez-la dans la configuration.',
    de: 'Kein Google-Cloud-API-Schlüssel: Erstelle einen in der Google-Cloud-Konsole (APIs & Dienste, Anmeldedaten) und füge ihn in die Konfiguration ein.',
    es: 'No hay clave de API de Google Cloud: cree una en la consola de Google Cloud (API y servicios, Credenciales) y péguela en la configuración.',
  },
  statusBadKey: {
    en: 'Google refused the API key: check it, and that its API restrictions allow the Cloud Text-to-Speech API.',
    fr: 'Google a refusé la clé d’API : vérifiez-la, et que ses restrictions d’API autorisent l’API Cloud Text-to-Speech.',
    de: 'Google hat den API-Schlüssel abgelehnt: Prüfe ihn und ob seine API-Einschränkungen die Cloud Text-to-Speech API erlauben.',
    es: 'Google ha rechazado la clave de API: compruébela, y que sus restricciones de API permitan la API Cloud Text-to-Speech.',
  },
  statusDisabled: {
    en: 'The Cloud Text-to-Speech API is not enabled on the project of this key: enable it in the API Library of the Google Cloud console.',
    fr: 'L’API Cloud Text-to-Speech n’est pas activée sur le projet de cette clé : activez-la dans la bibliothèque d’API de la console Google Cloud.',
    de: 'Die Cloud Text-to-Speech API ist im Projekt dieses Schlüssels nicht aktiviert: Aktiviere sie in der API-Bibliothek der Google-Cloud-Konsole.',
    es: 'La API Cloud Text-to-Speech no está habilitada en el proyecto de esta clave: habilítela en la biblioteca de API de la consola de Google Cloud.',
  },
  statusBilling: {
    en: 'Google requires billing on the project of this key: link a billing account to it (the free allowance still applies).',
    fr: 'Google exige la facturation sur le projet de cette clé : associez-lui un compte de facturation (la franchise gratuite s’applique toujours).',
    de: 'Google verlangt die Abrechnung im Projekt dieses Schlüssels: Verknüpfe ein Rechnungskonto (das kostenlose Kontingent gilt weiterhin).',
    es: 'Google exige la facturación en el proyecto de esta clave: vincúlele una cuenta de facturación (la cuota gratuita sigue aplicándose).',
  },
  statusNoVoice: {
    en: 'No voice found: {detail}. Check the voices typed in the configuration with the “List the voices” button.',
    fr: 'Aucune voix trouvée : {detail}. Vérifiez les voix saisies dans la configuration avec le bouton « Lister les voix ».',
    de: 'Keine Stimme gefunden: {detail}. Prüfe die in der Konfiguration eingegebenen Stimmen mit der Schaltfläche „Stimmen auflisten“.',
    es: 'No se ha encontrado ninguna voz: {detail}. Compruebe las voces escritas en la configuración con el botón «Listar las voces».',
  },
  statusRateLimited: {
    en: 'Google rate limit reached: try again in a moment.',
    fr: 'Limite de requêtes de Google atteinte : réessayez dans un instant.',
    de: 'Anfragelimit von Google erreicht: Versuche es gleich noch einmal.',
    es: 'Se ha alcanzado el límite de solicitudes de Google: inténtelo de nuevo en un momento.',
  },
  statusLimit: {
    en: 'Monthly character limit of the integration reached: clips are refused until the 1st of next month (Pacific time), or raise the limit in the configuration.',
    fr: 'Plafond mensuel de caractères de l’intégration atteint : les clips sont refusés jusqu’au 1er du mois prochain (heure du Pacifique), ou relevez le plafond dans la configuration.',
    de: 'Monatliches Zeichenlimit der Integration erreicht: Clips werden bis zum 1. des nächsten Monats (pazifische Zeit) abgelehnt, oder erhöhe das Limit in der Konfiguration.',
    es: 'Se ha alcanzado el límite mensual de caracteres de la integración: los clips se rechazan hasta el día 1 del mes que viene (hora del Pacífico), o aumente el límite en la configuración.',
  },
  statusUnreachable: {
    en: 'Cannot reach texttospeech.googleapis.com: check the internet access of Gladys.',
    fr: 'Impossible de joindre texttospeech.googleapis.com : vérifiez l’accès Internet de Gladys.',
    de: 'texttospeech.googleapis.com ist nicht erreichbar: Prüfe den Internetzugang von Gladys.',
    es: 'No se puede acceder a texttospeech.googleapis.com: compruebe el acceso a Internet de Gladys.',
  },
  statusApiError: {
    en: 'Google Cloud Text-to-Speech error: {detail}',
    fr: 'Erreur de Google Cloud Text-to-Speech : {detail}',
    de: 'Fehler von Google Cloud Text-to-Speech: {detail}',
    es: 'Error de Google Cloud Text-to-Speech: {detail}',
  },
  statusInitFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: 'L’initialisation a échoué, consultez les journaux de l’intégration.',
    de: 'Die Initialisierung ist fehlgeschlagen, prüfe die Protokolle der Integration.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  warnUnknownVoice: {
    en: 'The voice {voice} typed in the configuration does not exist: its language uses the automatic voice instead once removed.',
    fr: 'La voix {voice} saisie dans la configuration n’existe pas : retirez-la pour que sa langue reprenne la voix automatique.',
    de: 'Die in der Konfiguration eingegebene Stimme {voice} existiert nicht: Entferne sie, damit ihre Sprache wieder die automatische Stimme nutzt.',
    es: 'La voz {voice} escrita en la configuración no existe: quítela para que su idioma vuelva a usar la voz automática.',
  },
  warnFamilyFallback: {
    en: 'No {family} voice for this language: {voice} speaks instead.',
    fr: 'Pas de voix {family} pour cette langue : {voice} parle à la place.',
    de: 'Keine {family}-Stimme für diese Sprache: Stattdessen spricht {voice}.',
    es: 'No hay voz {family} para este idioma: habla {voice} en su lugar.',
  },
  testSentence: {
    en: 'Hello, I am the voice of Gladys. Everything is fine at home.',
    fr: 'Bonjour, je suis la voix de Gladys. Tout va bien à la maison.',
    de: 'Hallo, ich bin die Stimme von Gladys. Zu Hause ist alles in Ordnung.',
    es: 'Hola, soy la voz de Gladys. Todo está bien en casa.',
  },
  testSpoken: {
    en: '{voice} spoke {characters} characters in {seconds} s ({kb} KB of audio).',
    fr: '{voice} a prononcé {characters} caractères en {seconds} s ({kb} Ko d’audio).',
    de: '{voice} hat {characters} Zeichen in {seconds} s gesprochen ({kb} KB Audio).',
    es: '{voice} ha pronunciado {characters} caracteres en {seconds} s ({kb} KB de audio).',
  },
  testCached: {
    en: '{voice}: this sentence was already in the clip cache, nothing billed ({kb} KB of audio).',
    fr: '{voice} : cette phrase était déjà dans le cache des clips, rien de facturé ({kb} Ko d’audio).',
    de: '{voice}: Dieser Satz war schon im Clip-Cache, nichts abgerechnet ({kb} KB Audio).',
    es: '{voice}: esta frase ya estaba en la caché de clips, nada facturado ({kb} KB de audio).',
  },
  testMonth: {
    en: 'Characters this month: {used} of {limit}.',
    fr: 'Caractères ce mois-ci : {used} sur {limit}.',
    de: 'Zeichen in diesem Monat: {used} von {limit}.',
    es: 'Caracteres este mes: {used} de {limit}.',
  },
  listHeader: {
    en: '{count} {family} voices for “{language}”:',
    fr: '{count} voix {family} pour « {language} » :',
    de: '{count} {family}-Stimmen für „{language}“:',
    es: '{count} voces {family} para «{language}»:',
  },
  listMore: {
    en: '… and {count} more.',
    fr: '… et {count} de plus.',
    de: '… und {count} weitere.',
    es: '… y {count} más.',
  },
  listOthers: {
    en: 'Other families: {families}.',
    fr: 'Autres familles : {families}.',
    de: 'Andere Familien: {families}.',
    es: 'Otras familias: {families}.',
  },
  cacheCleared: {
    en: '{count} clips removed from the cache.',
    fr: '{count} clips retirés du cache.',
    de: '{count} Clips aus dem Cache entfernt.',
    es: '{count} clips eliminados de la caché.',
  },
  gender_female: { en: 'female', fr: 'féminine', de: 'weiblich', es: 'femenina' },
  gender_male: { en: 'male', fr: 'masculine', de: 'männlich', es: 'masculina' },
  gender_neutral: { en: 'neutral', fr: 'neutre', de: 'neutral', es: 'neutra' },

  // widget
  widgetNoKey: {
    en: 'No Google Cloud API key yet: add it in the configuration of the integration, then choose it as the voice in Settings, Artificial Intelligence.',
    fr: 'Pas encore de clé d’API Google Cloud : ajoutez-la dans la configuration de l’intégration, puis choisissez-la comme voix dans Paramètres, Intelligence artificielle.',
    de: 'Noch kein Google-Cloud-API-Schlüssel: Füge ihn in der Konfiguration der Integration hinzu und wähle sie dann als Stimme unter Einstellungen, Künstliche Intelligenz.',
    es: 'Todavía no hay clave de API de Google Cloud: añádala en la configuración de la integración y luego elíjala como voz en Ajustes, Inteligencia artificial.',
  },
  gaugeMonth: {
    en: 'Characters this month',
    fr: 'Caractères du mois',
    de: 'Zeichen im Monat',
    es: 'Caracteres del mes',
  },
  tileClipsToday: { en: 'Clips today', fr: 'Clips du jour', de: 'Clips heute', es: 'Clips hoy' },
  tileCachedMonth: {
    en: 'From cache (month)',
    fr: 'Du cache (mois)',
    de: 'Aus Cache (Monat)',
    es: 'De caché (mes)',
  },
  tileLeft: {
    en: 'Left this month',
    fr: 'Reste ce mois',
    de: 'Übrig im Monat',
    es: 'Quedan este mes',
  },
  chartTitle: {
    en: 'Characters per day',
    fr: 'Caractères par jour',
    de: 'Zeichen pro Tag',
    es: 'Caracteres por día',
  },
  chartSeries: { en: 'Characters', fr: 'Caractères', de: 'Zeichen', es: 'Caracteres' },
  rowState: { en: 'Google', fr: 'Google', de: 'Google', es: 'Google' },
  stateOk: { en: 'Speaking', fr: 'Parle', de: 'Spricht', es: 'Habla' },
  stateNoKey: {
    en: 'No API key',
    fr: 'Pas de clé d’API',
    de: 'Kein API-Schlüssel',
    es: 'Sin clave de API',
  },
  stateLimit: {
    en: 'Monthly limit reached',
    fr: 'Plafond du mois atteint',
    de: 'Monatslimit erreicht',
    es: 'Límite del mes alcanzado',
  },
  stateFailing: {
    en: 'Failing since {time}',
    fr: 'En erreur depuis {time}',
    de: 'Fehler seit {time}',
    es: 'Con errores desde {time}',
  },
  rowLastClip: { en: 'Last clip', fr: 'Dernier clip', de: 'Letzter Clip', es: 'Último clip' },
  valueLastClip: {
    en: '{characters} car., {ago}',
    fr: '{characters} car., {ago}',
    de: '{characters} Z., {ago}',
    es: '{characters} car., {ago}',
  },
  valueLastCached: {
    en: 'cache, {ago}',
    fr: 'cache, {ago}',
    de: 'Cache, {ago}',
    es: 'caché, {ago}',
  },
  rowLastError: {
    en: 'Last error',
    fr: 'Dernière erreur',
    de: 'Letzter Fehler',
    es: 'Último error',
  },
  buttonConsole: {
    en: 'Google Cloud usage',
    fr: 'Usage Google Cloud',
    de: 'Google-Cloud-Nutzung',
    es: 'Uso de Google Cloud',
  },
  kind_auth: {
    en: 'key refused',
    fr: 'clé refusée',
    de: 'Schlüssel abgelehnt',
    es: 'clave rechazada',
  },
  kind_disabled: {
    en: 'API disabled',
    fr: 'API désactivée',
    de: 'API deaktiviert',
    es: 'API deshabilitada',
  },
  kind_billing: {
    en: 'billing',
    fr: 'facturation',
    de: 'Abrechnung',
    es: 'facturación',
  },
  kind_voice: {
    en: 'voice unknown',
    fr: 'voix inconnue',
    de: 'Stimme unbekannt',
    es: 'voz desconocida',
  },
  kind_rate_limit: {
    en: 'rate limit',
    fr: 'limite de requêtes',
    de: 'Anfragelimit',
    es: 'límite de solicitudes',
  },
  kind_limit: {
    en: 'monthly limit',
    fr: 'plafond du mois',
    de: 'Monatslimit',
    es: 'límite del mes',
  },
  kind_request: {
    en: 'text refused',
    fr: 'texte refusé',
    de: 'Text abgelehnt',
    es: 'texto rechazado',
  },
  kind_server: {
    en: 'Google error',
    fr: 'erreur Google',
    de: 'Google-Fehler',
    es: 'error de Google',
  },
  kind_unreachable: {
    en: 'unreachable',
    fr: 'injoignable',
    de: 'nicht erreichbar',
    es: 'inaccesible',
  },
  kind_timeout: { en: 'too slow', fr: 'trop lent', de: 'zu langsam', es: 'demasiado lento' },

  // durations
  never: { en: 'Never', fr: 'Jamais', de: 'Nie', es: 'Nunca' },
  justNow: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  minutesAgo: {
    en: '{n} min ago',
    fr: 'il y a {n} min',
    de: 'vor {n} Min.',
    es: 'hace {n} min',
  },
  hoursAgo: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  daysAgo: {
    en: '{n} days ago',
    fr: 'il y a {n} jours',
    de: 'vor {n} Tagen',
    es: 'hace {n} días',
  },
};

/**
 * @description Whether a value is a language of the integration.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, with its values.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The values of the `{placeholders}`.
 * @returns {string} The text, the key itself when unknown.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string|Function} key - A TEXTS key, or `(language) => text`.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function'
        ? key(language)
        : t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description How long ago an instant was: "just now", "12 min ago", "3 h ago".
 * @param {number} at - The instant, in ms (0: never).
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function ago(at, now, language) {
  if (!at) {
    return t('never', language);
  }
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) {
    return t('justNow', language);
  }
  if (minutes < 60) {
    return t('minutesAgo', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('hoursAgo', language, { n: hours });
  }
  return t('daysAgo', language, { n: Math.floor(hours / 24) });
}

/**
 * @description A number in the format of a language.
 * @param {number} value - The number.
 * @param {string} language - The language.
 * @param {number} [decimals] - The decimals at most.
 * @returns {string} "12,5" in French.
 */
function formatNumber(value, language, decimals = 1) {
  if (!Number.isFinite(value)) {
    return '–';
  }
  return new Intl.NumberFormat(isLanguage(language) ? language : 'en', {
    maximumFractionDigits: decimals,
  }).format(value);
}

export { LANGUAGES, TEXTS, isLanguage, t, all, ago, formatNumber };
