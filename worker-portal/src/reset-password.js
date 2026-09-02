import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const copy = {
  sk: {
    eyebrow: "OBNOVA ÚČTU", title: "Vytvorte si nové heslo", intro: "Zadajte nové heslo pre svoj účet Stavuno.",
    checking: "Kontrolujem odkaz na obnovu…", password: "Nové heslo", confirmation: "Zopakujte nové heslo",
    hint: "Použite aspoň 6 znakov.", submit: "Uložiť nové heslo", saving: "Ukladám…",
    mismatch: "Heslá sa nezhodujú.", short: "Heslo musí mať aspoň 6 znakov.",
    invalid: "Odkaz je neplatný alebo už vypršal. Požiadajte v aplikácii o nový.",
    failed: "Heslo sa nepodarilo zmeniť. Požiadajte o nový odkaz a skúste to znova.",
    successTitle: "Heslo bolo zmenené.", successText: "Teraz sa môžete prihlásiť v aplikácii Stavuno.", openApp: "Otvoriť aplikáciu",
  },
  uk: {
    eyebrow: "ВІДНОВЛЕННЯ ОБЛІКОВОГО ЗАПИСУ", title: "Створіть новий пароль", intro: "Введіть новий пароль для свого облікового запису Stavuno.",
    checking: "Перевіряю посилання…", password: "Новий пароль", confirmation: "Повторіть новий пароль",
    hint: "Використайте щонайменше 6 символів.", submit: "Зберегти новий пароль", saving: "Зберігаю…",
    mismatch: "Паролі не збігаються.", short: "Пароль має містити щонайменше 6 символів.",
    invalid: "Посилання недійсне або вже прострочене. Запросіть нове в застосунку.",
    failed: "Не вдалося змінити пароль. Запросіть нове посилання та спробуйте ще раз.",
    successTitle: "Пароль змінено.", successText: "Тепер ви можете увійти в застосунок Stavuno.", openApp: "Відкрити застосунок",
  },
  ru: {
    eyebrow: "ВОССТАНОВЛЕНИЕ АККАУНТА", title: "Создайте новый пароль", intro: "Введите новый пароль для своего аккаунта Stavuno.",
    checking: "Проверяю ссылку восстановления…", password: "Новый пароль", confirmation: "Повторите новый пароль",
    hint: "Используйте не менее 6 символов.", submit: "Сохранить новый пароль", saving: "Сохраняю…",
    mismatch: "Пароли не совпадают.", short: "Пароль должен содержать не менее 6 символов.",
    invalid: "Ссылка недействительна или уже истекла. Запросите новую в приложении.",
    failed: "Не удалось изменить пароль. Запросите новую ссылку и попробуйте снова.",
    successTitle: "Пароль изменён.", successText: "Теперь вы можете войти в приложение Stavuno.", openApp: "Открыть приложение",
  },
};

const config = window.STAVBA_CONFIG || {};
const recoveryParameters = new URLSearchParams(
  location.hash.startsWith("#") ? location.hash.slice(1) : location.search,
);
const isRecoveryLink = recoveryParameters.get("type") === "recovery";
const client = config.supabaseUrl && config.anonKey
  ? createClient(config.supabaseUrl, config.anonKey, { auth: { detectSessionInUrl: true, persistSession: true } })
  : null;
const elements = {
  form: document.getElementById("recovery-form"), loading: document.getElementById("loading"),
  error: document.getElementById("error"), success: document.getElementById("success"),
  password: document.getElementById("password"), confirmation: document.getElementById("confirmation"),
  submit: document.getElementById("submit"),
};
let language = localStorage.getItem("stavuno-language") || navigator.language.slice(0, 2);
if (!(language in copy)) language = "sk";

function translate(nextLanguage) {
  language = nextLanguage;
  localStorage.setItem("stavuno-language", language);
  document.documentElement.lang = language;
  document.querySelectorAll("[data-copy]").forEach((element) => {
    element.textContent = copy[language][element.dataset.copy];
  });
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.classList.toggle("active", button.dataset.language === language);
  });
}

function showError(message) {
  elements.loading.classList.add("hidden");
  elements.form.classList.add("hidden");
  elements.success.classList.add("hidden");
  elements.error.textContent = message;
  elements.error.classList.remove("hidden");
}

async function initialize() {
  translate(language);
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => translate(button.dataset.language));
  });
  if (!client) return showError(copy[language].failed);
  if (!isRecoveryLink) return showError(copy[language].invalid);
  const { data, error } = await client.auth.getSession();
  elements.loading.classList.add("hidden");
  if (error || !data.session) return showError(copy[language].invalid);
  elements.form.classList.remove("hidden");
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.error.classList.add("hidden");
  const password = elements.password.value;
  if (password.length < 6) {
    elements.error.textContent = copy[language].short;
    return elements.error.classList.remove("hidden");
  }
  if (password !== elements.confirmation.value) {
    elements.error.textContent = copy[language].mismatch;
    return elements.error.classList.remove("hidden");
  }
  elements.submit.disabled = true;
  elements.submit.textContent = copy[language].saving;
  const { error } = await client.auth.updateUser({ password });
  if (error) {
    elements.submit.disabled = false;
    elements.submit.textContent = copy[language].submit;
    return showError(copy[language].failed);
  }
  await client.auth.signOut({ scope: "local" });
  history.replaceState({}, "", location.pathname);
  elements.form.classList.add("hidden");
  elements.success.classList.remove("hidden");
});

void initialize();
