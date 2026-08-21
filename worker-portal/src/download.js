const manifestUrl = "/app-version.json";
const downloadButton = document.getElementById("download-button");
const releaseDownload = document.getElementById("release-download");
const releaseDownloadLabel = releaseDownload.querySelector("span");
const buttonVersion = document.getElementById("button-version");
const releaseStatus = document.getElementById("release-status");

const translations = {
  sk: {
    locale: "sk-SK",
    title: "Stavebný denník — aplikácia pre majstrov",
    description: "Stavebný denník pre majstrov a malé stavebné tímy. Denné záznamy, fotodokumentácia, účtenky a požiadavky na materiál v jednej aplikácii.",
    navAria: "Hlavná navigácia", homeAria: "Stavebný denník — domov", languageAria: "Jazyk stránky",
    navFeatures: "Funkcie", workerEntry: "Vstup pre pracovníka", pilotBadge: "Bezplatná pilotná verzia",
    heroKicker: "PRE MAJSTROV · STAVBYVEDÚCICH · MALÉ TÍMY", heroTitle1: "Stavba pod kontrolou.", heroTitle2: "Dôkazy vždy poruke.",
    heroLead: "Denné záznamy, fotografie, účtenky a požiadavky pracovníkov na jednom mieste — priamo v mobile, aj bez stabilného internetu.",
    downloadAndroid: "STIAHNUŤ PRE ANDROID", howInstall: "Ako nainštalovať", downloadNote: "Podpísaný APK · Android 7.0 alebo novší",
    mockWeather: "POČASIE", mockSync: "SYNCHRONIZÁCIA", mockSaved: "Všetko uložené", mockToday: "DNES NA STAVBE", mockProject: "Rodinný dom",
    mockDailyRecord: "DENNÝ ZÁZNAM", mockReady: "Pripravený na doplnenie", mockWorkers: "pracovníkov", mockPhotos: "fotografií",
    mockActivity: "Aktivita objektu", mockThisWeek: "Tento týždeň", mockReceipt: "Účtenka pridaná", mockPhotoEvidence: "Fotodokumentácia", mockPhotoCount: "4 nové fotografie",
    trustAria: "Výhody", trustSecure: "Dáta oddelené podľa projektu", trustOffline: "Funguje aj offline", trustPdf: "PDF pripravené na odovzdanie",
    audienceLabel: "PRE KOHO JE APLIKÁCIA", audienceTitle: "Pre tím, ktorý riadi stavbu priamo v teréne.", audienceLead: "Každý vidí iba to, čo potrebuje. Majster riadi objekt, pracovník sa pripojí cez QR kód.",
    roleForemanInitial: "M", roleForeman: "Majster", roleForemanText: "Zaznamená priebeh dňa, ľudí, počasie a fotografie priamo na objekte.",
    roleManagerInitial: "S", roleManager: "Stavbyvedúci", roleManagerText: "Má prehľad o dôkazoch, materiáloch, výdavkoch a stave objektov.",
    roleWorkerInitial: "P", roleWorker: "Pracovník", roleWorkerText: "Pripojí sa cez QR kód a odošle majstrovi požiadavku na materiál.",
    featuresLabel: "VŠETKO PODSTATNÉ V MOBILE", featuresTitle: "Menej papierov. Viac prehľadu.", featuresLead: "Od prvého ranného záznamu až po podklady pre účtovníka.",
    featureDiary: "Stavebný denník", featureDiaryText: "Denné záznamy s počasím, GPS, ľuďmi, vykonanou prácou a poznámkami.",
    featurePhotos: "Fotografie a účtenky", featurePhotosText: "Fotodokumentácia a výdavky priradené k projektu. OCR pomôže prepísať účtenku.",
    featureQr: "Pracovníci cez QR", featureQrText: "Bez hesiel a registrácie. Prístup pracovníka vždy potvrdí majster.",
    featurePdf: "PDF pre odovzdanie", featurePdfText: "Prehľadný denník a balík účteniek s tabuľkou nákladov pripravené na zdieľanie.",
    releaseLabel: "AKTUÁLNA VERZIA", releaseTitle: "Vezmite si denník na stavbu.", downloadApk: "Stiahnuť APK",
    installLabel: "INŠTALÁCIA MIMO GOOGLE PLAY", installTitle: "Hotovo za pár minút.",
    step1Title: "Stiahnite APK", step1Text: "Telefón môže upozorniť, že súbor nie je z Google Play.",
    step2Title: "Povoľte inštaláciu", step2Text: "Povoľte tomuto prehliadaču inštalovať neznáme aplikácie.",
    step3Title: "Otvorte aplikáciu", step3Text: "Ďalšie verzie potom nainštalujete ako bežnú aktualizáciu.",
    footerPilot: "Pilotná verzia pre Android", privacy: "Ochrana súkromia", versionLoading: "Načítavam verziu…",
    versionLabel: "Verzia {version}", releaseReady: "Aktuálna verzia {version} · Android 7.0 alebo novší · podpísaný APK", releaseButton: "Stiahnuť verziu {version}",
    releaseErrorShort: "Skúste to o chvíľu", releaseError: "Odkaz na aktuálnu verziu sa nepodarilo načítať. Obnovte stránku.", refresh: "Obnoviť stránku",
  },
  uk: {
    locale: "uk-UA",
    title: "Будівельний щоденник — застосунок для виконробів",
    description: "Будівельний щоденник для виконробів і невеликих будівельних команд. Щоденні записи, фотографії, чеки та заявки на матеріали в одному застосунку.",
    navAria: "Головна навігація", homeAria: "Будівельний щоденник — головна", languageAria: "Мова сайту",
    navFeatures: "Функції", workerEntry: "Вхід для працівника", pilotBadge: "Безкоштовна пілотна версія",
    heroKicker: "ДЛЯ ВИКОНРОБІВ · КЕРІВНИКІВ · МАЛИХ КОМАНД", heroTitle1: "Будівництво під контролем.", heroTitle2: "Докази завжди поруч.",
    heroLead: "Щоденні записи, фотографії, чеки та заявки працівників в одному місці — прямо в телефоні, навіть без стабільного інтернету.",
    downloadAndroid: "ЗАВАНТАЖИТИ ДЛЯ ANDROID", howInstall: "Як встановити", downloadNote: "Підписаний APK · Android 7.0 або новіший",
    mockWeather: "ПОГОДА", mockSync: "СИНХРОНІЗАЦІЯ", mockSaved: "Усе збережено", mockToday: "СЬОГОДНІ НА ОБ’ЄКТІ", mockProject: "Приватний будинок",
    mockDailyRecord: "ЩОДЕННИЙ ЗАПИС", mockReady: "Готовий до заповнення", mockWorkers: "працівників", mockPhotos: "фотографій",
    mockActivity: "Активність об’єкта", mockThisWeek: "Цього тижня", mockReceipt: "Чек додано", mockPhotoEvidence: "Фотодокументація", mockPhotoCount: "4 нові фотографії",
    trustAria: "Переваги", trustSecure: "Дані розділені за проєктами", trustOffline: "Працює офлайн", trustPdf: "PDF готові до передачі",
    audienceLabel: "ДЛЯ КОГО ЗАСТОСУНОК", audienceTitle: "Для команди, яка керує будівництвом безпосередньо на об’єкті.", audienceLead: "Кожен бачить лише потрібне. Виконроб керує об’єктом, працівник приєднується через QR-код.",
    roleForemanInitial: "В", roleForeman: "Виконроб", roleForemanText: "Фіксує перебіг дня, людей, погоду та фотографії безпосередньо на об’єкті.",
    roleManagerInitial: "К", roleManager: "Керівник будівництва", roleManagerText: "Контролює докази, матеріали, витрати та стан усіх об’єктів.",
    roleWorkerInitial: "П", roleWorker: "Працівник", roleWorkerText: "Приєднується через QR-код і надсилає виконробу заявку на матеріали.",
    featuresLabel: "УСЕ ВАЖЛИВЕ В ТЕЛЕФОНІ", featuresTitle: "Менше паперів. Більше контролю.", featuresLead: "Від першого ранкового запису до документів для бухгалтера.",
    featureDiary: "Будівельний щоденник", featureDiaryText: "Щоденні записи з погодою, GPS, працівниками, виконаними роботами та примітками.",
    featurePhotos: "Фотографії та чеки", featurePhotosText: "Фотодокументація й витрати, прив’язані до проєкту. OCR допоможе розпізнати чек.",
    featureQr: "Працівники через QR", featureQrText: "Без паролів і реєстрації. Доступ працівника завжди підтверджує виконроб.",
    featurePdf: "PDF для передачі", featurePdfText: "Зрозумілий щоденник і пакет чеків з таблицею витрат, готові до поширення.",
    releaseLabel: "АКТУАЛЬНА ВЕРСІЯ", releaseTitle: "Візьміть щоденник із собою на будівництво.", downloadApk: "Завантажити APK",
    installLabel: "ВСТАНОВЛЕННЯ ПОЗА GOOGLE PLAY", installTitle: "Готово за кілька хвилин.",
    step1Title: "Завантажте APK", step1Text: "Телефон може попередити, що файл завантажено не з Google Play.",
    step2Title: "Дозвольте встановлення", step2Text: "Дозвольте цьому браузеру встановлювати невідомі застосунки.",
    step3Title: "Відкрийте застосунок", step3Text: "Наступні версії встановлюватимуться як звичайне оновлення.",
    footerPilot: "Пілотна версія для Android", privacy: "Захист приватності", versionLoading: "Завантажую версію…",
    versionLabel: "Версія {version}", releaseReady: "Актуальна версія {version} · Android 7.0 або новіший · підписаний APK", releaseButton: "Завантажити версію {version}",
    releaseErrorShort: "Спробуйте трохи пізніше", releaseError: "Не вдалося завантажити посилання на актуальну версію. Оновіть сторінку.", refresh: "Оновити сторінку",
  },
  ru: {
    locale: "ru-RU",
    title: "Строительный дневник — приложение для прорабов",
    description: "Строительный дневник для прорабов и небольших строительных команд. Ежедневные записи, фотографии, чеки и заявки на материалы в одном приложении.",
    navAria: "Главная навигация", homeAria: "Строительный дневник — главная", languageAria: "Язык сайта",
    navFeatures: "Функции", workerEntry: "Вход для работника", pilotBadge: "Бесплатная пилотная версия",
    heroKicker: "ДЛЯ ПРОРАБОВ · РУКОВОДИТЕЛЕЙ · НЕБОЛЬШИХ КОМАНД", heroTitle1: "Стройка под контролем.", heroTitle2: "Доказательства всегда под рукой.",
    heroLead: "Ежедневные записи, фотографии, чеки и заявки работников в одном месте — прямо в телефоне, даже без стабильного интернета.",
    downloadAndroid: "СКАЧАТЬ ДЛЯ ANDROID", howInstall: "Как установить", downloadNote: "Подписанный APK · Android 7.0 или новее",
    mockWeather: "ПОГОДА", mockSync: "СИНХРОНИЗАЦИЯ", mockSaved: "Всё сохранено", mockToday: "СЕГОДНЯ НА ОБЪЕКТЕ", mockProject: "Частный дом",
    mockDailyRecord: "ЕЖЕДНЕВНАЯ ЗАПИСЬ", mockReady: "Готова к заполнению", mockWorkers: "работников", mockPhotos: "фотографий",
    mockActivity: "Активность объекта", mockThisWeek: "На этой неделе", mockReceipt: "Чек добавлен", mockPhotoEvidence: "Фотодокументация", mockPhotoCount: "4 новые фотографии",
    trustAria: "Преимущества", trustSecure: "Данные разделены по проектам", trustOffline: "Работает офлайн", trustPdf: "PDF готовы к передаче",
    audienceLabel: "ДЛЯ КОГО ПРИЛОЖЕНИЕ", audienceTitle: "Для команды, которая управляет стройкой непосредственно на объекте.", audienceLead: "Каждый видит только нужное. Прораб управляет объектом, работник подключается по QR-коду.",
    roleForemanInitial: "П", roleForeman: "Прораб", roleForemanText: "Фиксирует ход дня, людей, погоду и фотографии непосредственно на объекте.",
    roleManagerInitial: "Р", roleManager: "Руководитель строительства", roleManagerText: "Контролирует доказательства, материалы, расходы и состояние всех объектов.",
    roleWorkerInitial: "Р", roleWorker: "Работник", roleWorkerText: "Подключается по QR-коду и отправляет прорабу заявку на материалы.",
    featuresLabel: "ВСЁ ВАЖНОЕ В ТЕЛЕФОНЕ", featuresTitle: "Меньше бумаг. Больше контроля.", featuresLead: "От первой утренней записи до документов для бухгалтера.",
    featureDiary: "Строительный дневник", featureDiaryText: "Ежедневные записи с погодой, GPS, работниками, выполненными работами и заметками.",
    featurePhotos: "Фотографии и чеки", featurePhotosText: "Фотодокументация и расходы, привязанные к проекту. OCR поможет распознать чек.",
    featureQr: "Работники через QR", featureQrText: "Без паролей и регистрации. Доступ работника всегда подтверждает прораб.",
    featurePdf: "PDF для передачи", featurePdfText: "Понятный дневник и пакет чеков с таблицей расходов, готовые к отправке.",
    releaseLabel: "АКТУАЛЬНАЯ ВЕРСИЯ", releaseTitle: "Возьмите дневник с собой на стройку.", downloadApk: "Скачать APK",
    installLabel: "УСТАНОВКА ВНЕ GOOGLE PLAY", installTitle: "Готово за несколько минут.",
    step1Title: "Скачайте APK", step1Text: "Телефон может предупредить, что файл загружен не из Google Play.",
    step2Title: "Разрешите установку", step2Text: "Разрешите этому браузеру устанавливать неизвестные приложения.",
    step3Title: "Откройте приложение", step3Text: "Следующие версии будут устанавливаться как обычное обновление.",
    footerPilot: "Пилотная версия для Android", privacy: "Защита конфиденциальности", versionLoading: "Загружаю версию…",
    versionLabel: "Версия {version}", releaseReady: "Актуальная версия {version} · Android 7.0 или новее · подписанный APK", releaseButton: "Скачать версию {version}",
    releaseErrorShort: "Попробуйте немного позже", releaseError: "Не удалось загрузить ссылку на актуальную версию. Обновите страницу.", refresh: "Обновить страницу",
  },
};

let latestManifest = null;
let releaseFailed = false;
const requestedLanguage = new URL(location.href).searchParams.get("lang");
const savedLanguage = localStorage.getItem("stavba-site-language");
const browserLanguage = navigator.language.toLowerCase().startsWith("uk")
  ? "uk"
  : navigator.language.toLowerCase().startsWith("ru")
    ? "ru"
    : "sk";
let currentLanguage = translations[requestedLanguage]
  ? requestedLanguage
  : translations[savedLanguage]
    ? savedLanguage
    : browserLanguage;

function format(text, values) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    text,
  );
}

function activateDownload(element, url) {
  element.href = url;
  element.classList.remove("is-loading");
  element.setAttribute("download", "");
}

function renderRelease() {
  const copy = translations[currentLanguage];
  if (releaseFailed) {
    buttonVersion.textContent = copy.releaseErrorShort;
    releaseStatus.textContent = copy.releaseError;
    releaseDownloadLabel.textContent = copy.refresh;
    releaseDownload.href = location.href;
    releaseDownload.classList.remove("is-loading");
    return;
  }
  if (!latestManifest) {
    buttonVersion.textContent = copy.versionLoading;
    releaseStatus.textContent = copy.versionLoading;
    releaseDownloadLabel.textContent = copy.downloadApk;
    return;
  }
  const version = latestManifest.version;
  buttonVersion.textContent = format(copy.versionLabel, { version });
  releaseStatus.textContent = format(copy.releaseReady, { version });
  releaseDownloadLabel.textContent = format(copy.releaseButton, { version });
  activateDownload(downloadButton, latestManifest.apkUrl);
  activateDownload(releaseDownload, latestManifest.apkUrl);
}

function applyLanguage(language, persist = false) {
  currentLanguage = translations[language] ? language : "sk";
  const copy = translations[currentLanguage];
  document.documentElement.lang = currentLanguage;
  document.title = copy.title;
  document.querySelector('meta[name="description"]').content = copy.description;
  document.querySelector('meta[property="og:description"]').content = copy.heroLead;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const value = copy[element.dataset.i18n];
    if (value) element.textContent = value;
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
    const value = copy[element.dataset.i18nAria];
    if (value) element.setAttribute("aria-label", value);
  });
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.lang === currentLanguage));
  });
  if (persist) {
    localStorage.setItem("stavba-site-language", currentLanguage);
    const url = new URL(location.href);
    url.searchParams.set("lang", currentLanguage);
    history.replaceState(null, "", url);
  }
  renderRelease();
}

async function loadLatestRelease() {
  try {
    const response = await fetch(manifestUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("VERSION_UNAVAILABLE");
    const manifest = await response.json();
    const apkUrl = manifest.androidUrls?.["arm64-v8a"];
    if (!manifest.version || !apkUrl) throw new Error("APK_UNAVAILABLE");
    latestManifest = { version: manifest.version, apkUrl };
  } catch {
    releaseFailed = true;
  }
  renderRelease();
}

document.querySelectorAll("[data-lang]").forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.lang, true));
});

applyLanguage(currentLanguage);
void loadLatestRelease();
