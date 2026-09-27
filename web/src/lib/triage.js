// Chat triage: one question at a time, in English or Kiswahili.
// Each step belongs to one of 12 profile topics shown in the "Your profile so far" panel.
// The safety rules live in the backend (engine/safety_screen.py); this file only asks and collects.

export const LANGS = ["en", "sw"];
export const lang = (code) => (code === "sw" ? "sw" : "en");

export const DOCTORS = {
  amara: { name: "Dr. Amara", initials: "DA", image: "/avatars/amara.png", role: { en: "Female doctor", sw: "Daktari wa kike" } },
  kofi: { name: "Dr. Kofi", initials: "DK", image: "/avatars/kofi.png", role: { en: "Male doctor", sw: "Daktari wa kiume" } },
};

export const TOPICS = [
  { id: "age", en: "Age", sw: "Umri" },
  { id: "goal", en: "Goal", sw: "Lengo" },
  { id: "pregnancy", en: "Pregnancy", sw: "Ujauzito" },
  { id: "breastfeeding", en: "Breastfeeding", sw: "Kunyonyesha" },
  { id: "health", en: "Health", sw: "Afya" },
  { id: "medications", en: "Medicines", sw: "Dawa" },
  { id: "smoking", en: "Smoking", sw: "Uvutaji sigara" },
  { id: "periods", en: "Periods", sw: "Hedhi" },
  { id: "experience", en: "Experience", sw: "Uzoefu" },
  { id: "routine", en: "Routine", sw: "Ratiba" },
  { id: "sti", en: "STI concern", sw: "Kinga ya magonjwa ya zinaa" },
  { id: "access", en: "Access", sw: "Kufika kliniki" },
];

const o = (v, en, sw = en, extra = {}) => ({ v, en, sw, ...extra });
const YES_NO = [o("yes", "Yes", "Ndiyo"), o("no", "No", "Hapana")];

const female = (a) => one(a.sex) !== "male";
const hasBeenPregnant = (a) => female(a) && one(a.preg_history) === "yes";
const WITHIN_6_MONTHS = ["lt48h", "2d_3w", "3_4w", "4_6w", "6w_6m"];

export function one(values) {
  return Array.isArray(values) ? values[0] : values;
}

export const STEPS = [
  {
    id: "sex", topic: "age",
    q: { en: "First, who is this advice for?", sw: "Kwanza, ushauri huu ni kwa ajili ya nani?" },
    options: [o("female", "I'm a woman", "Mimi ni mwanamke"), o("male", "I'm a man", "Mimi ni mwanaume")],
  },
  {
    id: "age", topic: "age",
    q: { en: "How old are you?", sw: "Una umri gani?" },
    options: [
      o("u18", "Under 18", "Chini ya 18"), o("18_19", "18–19"), o("20_34", "20–34"),
      o("35_39", "35–39"), o("40_45", "40–45"), o("46", "46 or older", "46 au zaidi"),
    ],
  },
  {
    id: "goal", topic: "goal",
    q: { en: "What is your family planning goal right now?", sw: "Lengo lako la uzazi wa mpango kwa sasa ni lipi?" },
    options: [
      o("long", "Avoid pregnancy for a long time (2+ years)", "Kuepuka mimba kwa muda mrefu (miaka 2+)"),
      o("space12", "Spacing: another child in 1–2 years", "Kupanga uzazi: mtoto mwingine baada ya miaka 1–2"),
      o("space3", "Spacing: another child in 3+ years", "Kupanga uzazi: mtoto mwingine baada ya miaka 3+"),
      o("no_more", "I don't want more children", "Sitaki watoto zaidi"),
      o("unsure", "I'm not sure yet", "Bado sina uhakika"),
    ],
  },
  {
    id: "preg_history", topic: "pregnancy", when: female,
    q: { en: "Have you ever been pregnant?", sw: "Umewahi kuwa mjamzito?" },
    options: [o("never", "No, never", "Hapana, sijawahi"), o("yes", "Yes", "Ndiyo"), o("now", "I'm pregnant now", "Nina mimba sasa hivi")],
  },
  {
    id: "preg_check", topic: "pregnancy", multi: true, when: (a) => female(a) && one(a.preg_history) !== "now",
    q: {
      en: "To make sure pregnancy can be ruled out, which of these are true for you? Tick all that apply.",
      sw: "Ili kuhakikisha huna mimba, ni yapi kati ya haya ni kweli kwako? Chagua yote yanayohusika.",
    },
    options: [
      o("p7", "My period started in the last 7 days", "Hedhi yangu ilianza ndani ya siku 7 zilizopita"),
      o("nosex", "No sex since my last period", "Sijafanya ngono tangu hedhi yangu ya mwisho"),
      o("reliable", "I've used a reliable method correctly every time", "Nimetumia njia ya kuaminika kwa usahihi kila mara"),
      o("birth4", "I gave birth in the last 4 weeks", "Nilijifungua ndani ya wiki 4 zilizopita", { when: hasBeenPregnant }),
      o("loss7", "Miscarriage or abortion in the last 7 days", "Mimba iliharibika au kutolewa ndani ya siku 7 zilizopita", { when: hasBeenPregnant }),
      o("lamfull", "Baby under 6 months, only breastfeeding, no period yet", "Mtoto chini ya miezi 6, ninanyonyesha tu, hedhi haijarudi", { when: hasBeenPregnant }),
      o("none", "None of these", "Hakuna kati ya haya", { exclusive: true }),
    ],
  },
  {
    id: "unprotected", topic: "pregnancy", when: (a) => female(a) && one(a.preg_history) !== "now",
    q: { en: "Have you had sex without protection in the last 5 days?", sw: "Umefanya ngono bila kinga ndani ya siku 5 zilizopita?" },
    options: YES_NO,
  },
  {
    id: "birth", topic: "breastfeeding", when: hasBeenPregnant,
    q: { en: "When did you last give birth?", sw: "Ulijifungua lini mara ya mwisho?" },
    options: [
      o("none", "More than 6 months ago, or never", "Zaidi ya miezi 6 iliyopita, au sijawahi"),
      o("lt48h", "Less than 2 days ago", "Chini ya siku 2 zilizopita"),
      o("2d_3w", "2 days to 3 weeks ago", "Siku 2 hadi wiki 3 zilizopita"),
      o("3_4w", "3–4 weeks ago", "Wiki 3–4 zilizopita"),
      o("4_6w", "4–6 weeks ago", "Wiki 4–6 zilizopita"),
      o("6w_6m", "6 weeks to 6 months ago", "Wiki 6 hadi miezi 6 iliyopita"),
    ],
  },
  {
    id: "bf", topic: "breastfeeding", when: hasBeenPregnant,
    q: { en: "Are you breastfeeding?", sw: "Unanyonyesha?" },
    options: [
      o("exclusive", "Yes, breast milk only", "Ndiyo, maziwa ya mama pekee"),
      o("partial", "Yes, with other food or formula", "Ndiyo, pamoja na vyakula vingine au maziwa ya kopo"),
      o("none", "No", "Hapana"),
    ],
  },
  {
    id: "periods_back", topic: "breastfeeding",
    when: (a) => hasBeenPregnant(a) && one(a.bf) === "exclusive" && WITHIN_6_MONTHS.includes(one(a.birth)),
    q: { en: "Have your periods come back since the birth?", sw: "Hedhi imerudi tangu ujifungue?" },
    options: YES_NO,
  },
  {
    id: "health", topic: "health", multi: true, when: female,
    q: {
      en: "Do you have, or have you ever had, any of these? Tick all that apply.",
      sw: "Una, au umewahi kuwa na, lolote kati ya haya? Chagua yote yanayohusika.",
    },
    options: [
      o("high_bp", "High blood pressure", "Shinikizo la juu la damu"),
      o("migraine_aura", "Migraines with flashing lights or zigzag lines first", "Kipandauso chenye mwanga au mistari ya zigzag kabla"),
      o("migraine", "Migraines without those warning signs", "Kipandauso bila dalili hizo"),
      o("blood_clot", "A blood clot in the leg or lung", "Damu kuganda mguuni au kwenye mapafu"),
      o("stroke_heart", "Stroke or heart disease", "Kiharusi au ugonjwa wa moyo"),
      o("diabetes", "Diabetes", "Kisukari"),
      o("liver_disease", "Serious liver disease", "Ugonjwa mkubwa wa ini"),
      o("breast_cancer", "Breast cancer", "Saratani ya matiti"),
      o("cervical_cancer", "Cancer of the cervix or womb", "Saratani ya shingo ya kizazi au mfuko wa uzazi"),
      o("unexplained_bleeding", "Unexplained vaginal bleeding (between periods or after sex)", "Kutokwa damu ukeni bila sababu (kati ya hedhi au baada ya ngono)"),
      o("sti_signs", "Unusual discharge or pelvic pain right now", "Uchafu usio wa kawaida ukeni au maumivu ya nyonga sasa hivi"),
      o("none", "None of these", "Hakuna kati ya haya", { exclusive: true }),
    ],
  },
  {
    id: "bp_level", topic: "health", when: (a) => female(a) && (a.health || []).includes("high_bp"),
    q: { en: "What was your last blood pressure reading?", sw: "Kipimo chako cha mwisho cha shinikizo la damu kilikuwa kipi?" },
    options: [
      o("controlled", "Normal now, on treatment", "Kawaida sasa, natumia dawa"),
      o("140_159", "140–159 / 90–99"),
      o("160_plus", "160/100 or higher", "160/100 au zaidi"),
      o("unknown", "I don't know, or not measured recently", "Sijui, au sijapima hivi karibuni"),
    ],
  },
  {
    id: "diabetes_level", topic: "health", when: (a) => female(a) && (a.health || []).includes("diabetes"),
    q: { en: "Has diabetes affected your eyes, kidneys or nerves?", sw: "Je, kisukari kimeathiri macho, figo au neva zako?" },
    options: YES_NO,
  },
  {
    id: "breast_cancer_when", topic: "health", when: (a) => female(a) && (a.health || []).includes("breast_cancer"),
    q: { en: "Do you have breast cancer now, or was it in the past?", sw: "Je, una saratani ya matiti sasa, au ilikuwa zamani?" },
    options: [o("current", "I have it now", "Ninayo sasa"), o("past", "In the past, no sign for 5+ years", "Zamani, hakuna dalili kwa miaka 5+")],
  },
  {
    id: "meds", topic: "medications", multi: true, when: female,
    q: { en: "Are you taking any of these medicines?", sw: "Unatumia dawa yoyote kati ya hizi?" },
    options: [
      o("rifampicin", "TB medicine (rifampicin)", "Dawa ya TB (rifampicin)"),
      o("anticonvulsant", "Epilepsy medicine", "Dawa ya kifafa"),
      o("efavirenz", "HIV medicine with efavirenz or nevirapine", "Dawa ya VVU yenye efavirenz au nevirapine"),
      o("ritonavir", "HIV medicine with ritonavir", "Dawa ya VVU yenye ritonavir"),
      o("dolutegravir", "HIV medicine with dolutegravir (TLD)", "Dawa ya VVU yenye dolutegravir (TLD)"),
      o("none", "None of these", "Hakuna kati ya hizi", { exclusive: true }),
    ],
  },
  {
    id: "smoking", topic: "smoking", when: female,
    q: { en: "Do you smoke?", sw: "Unavuta sigara?" },
    options: [
      o("no", "No", "Hapana"),
      o("under_15", "Yes, fewer than 15 a day", "Ndiyo, chini ya 15 kwa siku"),
      o("15_plus", "Yes, 15 or more a day", "Ndiyo, 15 au zaidi kwa siku"),
    ],
  },
  {
    id: "periods", topic: "periods", when: female,
    q: { en: "How are your periods usually?", sw: "Hedhi zako huwa vipi kwa kawaida?" },
    options: [
      o("regular", "Regular and predictable", "Za kawaida na zinatabirika"),
      o("heavy", "Heavy or painful", "Nzito au zenye maumivu"),
      o("irregular", "Irregular", "Hazina mpangilio"),
      o("absent", "I'm not having periods now", "Sipati hedhi kwa sasa"),
    ],
  },
  {
    id: "bleeding_ok", topic: "periods", when: female,
    q: {
      en: "Some methods change bleeding: spotting, irregular periods, or no periods at all. Would that bother you?",
      sw: "Baadhi ya njia hubadilisha hedhi: matone, hedhi zisizo na mpangilio, au kukosa hedhi kabisa. Je, hilo lingekusumbua?",
    },
    options: [o("ok", "No, that's fine", "Hapana, ni sawa"), o("bother", "Yes, a lot", "Ndiyo, sana"), o("unsure", "Not sure", "Sina uhakika")],
  },
  {
    id: "experience", topic: "experience", when: female,
    q: { en: "Have you used contraception before?", sw: "Umewahi kutumia njia za uzazi wa mpango?" },
    options: [
      o("first", "No, this is my first time", "Hapana, hii ni mara yangu ya kwanza"),
      o("happy", "Yes, and it worked well", "Ndiyo, na ilifanya kazi vizuri"),
      o("stopped", "Yes, but I stopped because of side effects", "Ndiyo, lakini niliacha kwa sababu ya madhara"),
    ],
  },
  {
    id: "routine", topic: "routine", when: female,
    q: { en: "Which sounds most like you?", sw: "Kipi kinakuelezea vizuri zaidi?" },
    options: [
      o("consistent", "I remember things daily, like taking a pill", "Ninakumbuka mambo kila siku, kama kumeza kidonge"),
      o("forget", "I sometimes forget things", "Wakati mwingine ninasahau"),
      o("set", "I'd rather set it and forget it", "Ningependa kitu cha kuweka na kusahau"),
    ],
  },
  {
    id: "comfortable", topic: "routine", multi: true, when: female,
    q: {
      en: "Which of these would you be comfortable with? Tick all that apply.",
      sw: "Ni zipi kati ya hizi ungejisikia huru kutumia? Chagua zote zinazohusika.",
    },
    options: [
      o("pill", "A daily pill", "Kidonge cha kila siku"),
      o("injection", "An injection every 3 months", "Sindano kila miezi 3"),
      o("implant", "A small rod in the arm", "Kijiti kidogo mkononi"),
      o("iud", "A device placed in the womb", "Kifaa kinachowekwa kwenye mfuko wa uzazi"),
      o("condom", "Condoms", "Kondomu"),
      o("any", "I'm open to anything", "Niko tayari kwa chochote", { exclusive: true }),
    ],
  },
  {
    id: "sti", topic: "sti",
    q: { en: "Is protection from HIV and other STIs important to you?", sw: "Je, kinga dhidi ya VVU na magonjwa mengine ya zinaa ni muhimu kwako?" },
    options: [o("yes", "Yes, this matters to me", "Ndiyo, ni muhimu kwangu"), o("no", "No", "Hapana"), o("unsure", "Not sure", "Sina uhakika")],
  },
  {
    id: "access", topic: "access", when: female,
    q: { en: "How easily can you get to a clinic?", sw: "Ni rahisi kiasi gani kwako kufika kliniki?" },
    options: [
      o("easy", "I can visit a clinic anytime", "Naweza kwenda kliniki wakati wowote"),
      o("sometimes", "Now and then", "Mara moja moja"),
      o("hard", "It's very hard (distance or cost)", "Ni vigumu sana (umbali au gharama)"),
    ],
  },
  {
    id: "privacy", topic: "access", when: female,
    q: { en: "Do you need a method your partner won't notice?", sw: "Unahitaji njia ambayo mwenzi wako hataigundua?" },
    options: YES_NO,
  },
];

const STEP_BY_ID = Object.fromEntries(STEPS.map((s) => [s.id, s]));
export const getStep = (id) => STEP_BY_ID[id];

export const isVisible = (step, answers) => !step.when || step.when(answers);
export const visibleOptions = (step, answers) => step.options.filter((opt) => !opt.when || opt.when(answers));

export function nextStepId(answers, afterId) {
  const start = afterId ? STEPS.findIndex((s) => s.id === afterId) + 1 : 0;
  for (let i = start; i < STEPS.length; i++) {
    if (isVisible(STEPS[i], answers) && answers[STEPS[i].id] === undefined) return STEPS[i].id;
  }
  return null;
}

export function optionLabel(stepId, value, l) {
  const opt = getStep(stepId)?.options.find((x) => x.v === value);
  return opt ? opt[l] : value;
}

export function answerLabel(stepId, values, l) {
  return (values || []).map((v) => optionLabel(stepId, v, l)).join(", ");
}

// Status of each profile topic, for the "Your profile so far" panel.
export function topicStatus(answers, currentStepId) {
  const current = currentStepId ? getStep(currentStepId)?.topic : null;
  return TOPICS.map((topic) => {
    const steps = STEPS.filter((s) => s.topic === topic.id && isVisible(s, answers));
    const answered = steps.filter((s) => answers[s.id] !== undefined);
    const applicable = steps.length > 0;
    return {
      ...topic,
      applicable,
      done: applicable && answered.length === steps.length && topic.id !== current,
      current: topic.id === current,
      summary: (l) => answered.map((s) => answerLabel(s.id, answers[s.id], l)).join(" · "),
    };
  });
}

// ---------- Mapping answers to the backend triage payload ----------

const AGE_VALUE = { u18: 16, "18_19": 19, "20_34": 27, "35_39": 37, "40_45": 42, "46": 48 };
const GOAL_INTENT = { long: "over_2y", space12: "within_2y", space3: "over_2y", no_more: "no_more", unsure: "unsure" };
const ACCESS_VISITS = { easy: "easy", sometimes: "sometimes", hard: "hard" };

export function buildTriagePayload(a) {
  const isMale = one(a.sex) === "male";
  const health = a.health || [];
  const neverPregnant = one(a.preg_history) === "never";

  const conditions = [];
  for (const h of health) {
    if (h === "none" || h === "high_bp") continue;
    if (h === "diabetes") conditions.push(one(a.diabetes_level) === "yes" ? "diabetes_complications" : "diabetes");
    else if (h === "breast_cancer") conditions.push(one(a.breast_cancer_when) === "current" ? "breast_cancer_current" : "breast_cancer_past");
    else conditions.push(h);
  }
  if (one(a.periods) === "heavy") conditions.push("heavy_periods");

  let pregnancyStatus = null;
  if (one(a.preg_history) === "now") pregnancyStatus = "pregnant";
  else if (a.preg_check) pregnancyStatus = a.preg_check.some((v) => v !== "none") ? "not_pregnant" : "unsure";

  const bleedingOk = one(a.bleeding_ok);

  return {
    age: AGE_VALUE[one(a.age)] ?? 27,
    gender: isMale ? "male" : "female",
    pregnancy_status: isMale ? null : pregnancyStatus,
    unprotected_sex_5d: one(a.unprotected) === "yes",
    postpartum: isMale ? null : neverPregnant ? "none" : one(a.birth) ?? null,
    breastfeeding_mode: isMale ? null : neverPregnant ? "none" : one(a.bf) ?? null,
    periods_returned: a.periods_back ? one(a.periods_back) === "yes" : null,
    blood_pressure: isMale || !a.health ? null : health.includes("high_bp") ? one(a.bp_level) || "unknown" : "normal",
    smoking: one(a.smoking) ?? null,
    conditions,
    medications: (a.meds || []).filter((m) => m !== "none" && m !== "dolutegravir"),
    fertility_intent: GOAL_INTENT[one(a.goal)] ?? null,
    comfortable_with: (a.comfortable || []).filter((c) => c !== "any"),
    bleeding_changes_ok: bleedingOk === "ok" ? true : bleedingOk === "bother" ? false : null,
    needs_privacy: one(a.privacy) === "yes",
    sti_protection: one(a.sti) === "yes",
    clinic_visits: ACCESS_VISITS[one(a.access)] ?? null,
  };
}

// Plain-English summary sent with free questions so answers fit the user's profile.
export function triageSummary(answers) {
  return STEPS.filter((s) => answers[s.id] !== undefined)
    .map((s) => `${s.q.en} ${answerLabel(s.id, answers[s.id], "en")}`)
    .join(" | ");
}

// ---------- Language of typed questions ----------

const SW_HINTS = ["ndiyo", "ndio", "hapana", "sina", "nina", "sijawahi", "hakuna", "je", "kwa", "mimi", "ninataka", "nataka", "ni", "sawa", "umri", "miaka", "mimba", "hedhi", "dawa", "vipi", "nini"];
const EN_HINTS = ["the", "i", "my", "is", "and", "have", "what", "how"];
const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

// True when a typed question is clearly in Kiswahili, so the page can switch language.
export function looksSwahili(text) {
  const w = words(text);
  return w.some((x) => SW_HINTS.includes(x)) && !w.some((x) => EN_HINTS.includes(x));
}

// ---------- Text shown in the chat ----------

export const UI = {
  en: {
    online: "Online",
    guide: "Your AI health guide",
    switchDoctor: "Switch doctor",
    chooseTitle: "Who would you like to talk to?",
    chooseSub: "Both doctors give the same WHO-based advice. Choose whoever you feel most comfortable with.",
    choose: "Talk to",
    navTriage: "Get a recommendation",
    navAsk: "Just ask a question",
    placeholderAsk: "Ask anything about contraception…",
    tapToAnswer: "Tap an answer above to continue.",
    continue: "Continue",
    profileTitle: "Your profile so far",
    triageTitle: "Your triage answers",
    notNeeded: "Not needed",
    now: "Now",
    privacy: "Your answers are not saved after this session.",
    restartTitle: "Start over?",
    restartBody: "Your answers will be cleared.",
    restartYes: "Yes, start over",
    cancel: "Cancel",
    stepOf: (n, total, topic) => `Step ${n} of ${total} · ${topic}`,
    viewProfile: "View profile",
    askQuestion: "Ask a question",
    startOver: "Start over",
    noTriageYet: "No triage answers yet. Answer the questions for a personal recommendation.",
    startTriage: "Start the questions",
  },
  sw: {
    online: "Yupo mtandaoni",
    guide: "Mwongozo wako wa afya wa AI",
    switchDoctor: "Badilisha daktari",
    chooseTitle: "Ungependa kuzungumza na nani?",
    chooseSub: "Madaktari wote wawili wanatoa ushauri uleule unaotegemea WHO. Chagua unayejisikia huru naye zaidi.",
    choose: "Ongea na",
    navTriage: "Pata mapendekezo",
    navAsk: "Uliza swali tu",
    placeholderAsk: "Uliza lolote kuhusu uzazi wa mpango…",
    tapToAnswer: "Gusa jibu hapo juu ili kuendelea.",
    continue: "Endelea",
    profileTitle: "Wasifu wako hadi sasa",
    triageTitle: "Majibu yako ya maswali",
    notNeeded: "Haihitajiki",
    now: "Sasa",
    privacy: "Majibu yako hayahifadhiwi baada ya kikao hiki.",
    restartTitle: "Anza upya?",
    restartBody: "Majibu yako yatafutwa.",
    restartYes: "Ndiyo, anza upya",
    cancel: "Ghairi",
    stepOf: (n, total, topic) => `Hatua ${n} kati ya ${total} · ${topic}`,
    viewProfile: "Tazama wasifu",
    askQuestion: "Uliza swali",
    startOver: "Anza upya",
    noTriageYet: "Bado hujajibu maswali. Jibu maswali ili upate mapendekezo yako binafsi.",
    startTriage: "Anza maswali",
  },
};

// Bot lines. {doctor} is replaced with the chosen doctor's name.
export const BOT = {
  welcome: {
    en: "Hi, I'm {doctor}. I'll ask you a few quick questions, one at a time, to find the contraception options that are safe for you and fit your life. Just tap your answer. Your answers stay private. Ready?",
    sw: "Habari, mimi ni {doctor}. Nitakuuliza maswali machache mafupi, moja baada ya jingine, ili kupata njia za uzazi wa mpango zilizo salama kwako na zinazoendana na maisha yako. Gusa tu jibu lako. Majibu yako ni siri. Uko tayari?",
  },
  about: {
    en: "ContraBot gives free, private contraception advice based on the World Health Organization's medical eligibility guidelines. I check your answers against those rules, then suggest the options that suit you. A clinic or community health worker should confirm before you start.",
    sw: "ContraBot inatoa ushauri wa bure na wa siri kuhusu uzazi wa mpango, kulingana na miongozo ya Shirika la Afya Duniani (WHO). Ninalinganisha majibu yako na miongozo hiyo, kisha napendekeza njia zinazokufaa. Kliniki au mhudumu wa afya ya jamii anapaswa kuthibitisha kabla hujaanza.",
  },
  startYes: { en: "Yes, let's go", sw: "Ndiyo, tuanze" },
  startWhat: { en: "What is this?", sw: "Hii ni nini?" },
  acks: {
    en: ["Got it.", "Thanks.", "Okay.", "Thank you."],
    sw: ["Sawa.", "Asante.", "Nimeelewa.", "Asante sana."],
  },
  sensitiveAck: { en: "Thank you for sharing that.", sw: "Asante kwa kunieleza." },
  switchedToSwahili: { en: "I'll continue in Kiswahili.", sw: "Nitaendelea kwa Kiswahili." },
  underAge: {
    en: "Thank you for telling me. ContraBot's recommendations are for people aged 18 and over, so I can't continue the questions. You still deserve good, private advice: a youth-friendly clinic or a health worker can help you, and it's confidential.",
    sw: "Asante kwa kunieleza. Mapendekezo ya ContraBot ni kwa watu wenye umri wa miaka 18 na zaidi, kwa hiyo siwezi kuendelea na maswali. Bado unastahili ushauri mzuri wa siri: kliniki rafiki kwa vijana au mhudumu wa afya anaweza kukusaidia, na ni siri.",
  },
  emergencyNow: {
    en: "Important: because it's been less than 5 days, emergency contraception can still prevent pregnancy. Emergency pills (like P2) work best as soon as possible. A copper IUD fitted within 5 days is the most effective option.",
    sw: "Muhimu: kwa kuwa ni chini ya siku 5, dawa ya dharura bado inaweza kuzuia mimba. Vidonge vya dharura (kama P2) hufanya kazi vizuri zaidi vikimezwa mapema iwezekanavyo. Kitanzi cha shaba kikiwekwa ndani ya siku 5 ndicho chenye ufanisi zaidi.",
  },
  pregnancyUnsure: {
    en: "Okay. We can't rule out pregnancy yet, so I'll keep that in mind. A pregnancy test before starting a method is a good idea.",
    sw: "Sawa. Bado hatuwezi kuwa na uhakika kuwa huna mimba, kwa hiyo nitazingatia hilo. Ni vizuri kupima mimba kabla ya kuanza njia yoyote.",
  },
  pregnantNow: {
    en: "Thank you for telling me. You don't need contraception while you're pregnant. Please keep up your antenatal visits. After the birth, many methods can be started, some straight away. If you have questions, tap \"Ask a question\".",
    sw: "Asante kwa kunieleza. Huhitaji njia ya uzazi wa mpango ukiwa mjamzito. Tafadhali endelea na kliniki ya wajawazito. Baada ya kujifungua, njia nyingi zinaweza kuanzishwa, nyingine mara moja. Ukiwa na maswali, gusa \"Uliza swali\".",
  },
  checking: {
    en: "Thank you. I'm checking your answers against the WHO guidelines…",
    sw: "Asante. Ninalinganisha majibu yako na miongozo ya WHO…",
  },
  recommendationIntro: {
    en: "Here are the options that are safe for you and fit your answers best.",
    sw: "Hizi ndizo njia zilizo salama kwako na zinazoendana zaidi na majibu yako.",
  },
  afterRecommendation: {
    en: "Do you have questions about these options, side effects, or what to expect at the clinic? Tap \"Ask a question\" and I'll answer with your answers in mind.",
    sw: "Una maswali kuhusu njia hizi, madhara, au cha kutarajia kliniki? Gusa \"Uliza swali\" nami nitajibu nikizingatia majibu yako.",
  },
  recommendError: {
    en: "Sorry, I couldn't get your recommendation right now. Please check your connection and try again.",
    sw: "Samahani, sikuweza kupata mapendekezo yako sasa hivi. Tafadhali angalia mtandao wako na ujaribu tena.",
  },
  tryAgain: { en: "Try again", sw: "Jaribu tena" },
  askWelcome: {
    en: "Hi, I'm {doctor}. Ask me anything about contraception: methods, side effects, fertility, or what to expect at the clinic.",
    sw: "Habari, mimi ni {doctor}. Niulize lolote kuhusu uzazi wa mpango: njia, madhara, uwezo wa kupata mimba, au cha kutarajia kliniki.",
  },
  askWelcomeWithProfile: {
    en: "Hi again. Ask me anything about contraception. I'll keep your triage answers in mind.",
    sw: "Habari tena. Niulize lolote kuhusu uzazi wa mpango. Nitazingatia majibu yako ya maswali.",
  },
  askError: {
    en: "Sorry, I couldn't answer that right now. If something is urgent or worrying, please visit a clinic.",
    sw: "Samahani, sikuweza kujibu hilo sasa hivi. Kama ni jambo la dharura au linalokutia wasiwasi, tafadhali nenda kliniki.",
  },
};

export const SUGGESTED_QUESTIONS = {
  en: ["How does the implant work?", "Will it affect my fertility later?", "What side effects are normal?", "Is it safe while breastfeeding?"],
  sw: ["Kijiti cha mkononi hufanyaje kazi?", "Je, kitaathiri uwezo wangu wa kupata mimba baadaye?", "Madhara gani ni ya kawaida?", "Je, ni salama wakati wa kunyonyesha?"],
};

// ---------- Home page ----------

export const HOME = {
  en: {
    badge: "Free · Private · English, Kiswahili and Sheng",
    phone: {
      title: "Also on your phone",
      sub: "Chat with the doctor on WhatsApp, or dial the USSD code on any phone. No smartphone or internet needed for USSD.",
      whatsapp: "Try it on WhatsApp",
      ussd: "Try it by USSD",
      dial: "Dial",
      soon: "Coming soon",
      greeting: "Hi",
    },
    ussdDemo: {
      title: "Try the menu on a feature phone",
      sub: "This handset runs the real USSD service. Press Call, answer with the number keys, then OK. No airtime and no mobile network.",
      steps: [
        ["Dial", "Press the green button. That opens the same menu as the code."],
        ["Answer", "Tap a number, then OK. Press 9 when a screen says More."],
        ["Type", "For a question, type on your keyboard, then OK."],
      ],
      ok: "OK",
      exit: "Exit",
      call: "Call",
      end: "End",
      clear: "Clear",
      waiting: "Please wait...",
      idleBody: "Press Call to dial",
      ended: "Session ended.\nPress Call to dial again.",
      error: "Could not reach the service.\nPress Call to try again.",
      unknown: "That code is not on this phone.\nPress Call for ContraBot.",
      reply: "Your reply",
      abc: "ABC",
      num: "123",
    },
    titleA: "Family planning,",
    titleB: "explained simply.",
    sub: "ContraBot is a friendly AI doctor for people in Kenya. Ask anything about contraception in your own words, or answer a few questions to find methods that are safe for you.",
    start: "Start",
    paths: {
      chat: {
        title: "Talk to the doctor",
        text: "Ask anything in your own words: how a method works, side effects, P2, pregnancy. The doctor explains in simple language.",
        cta: "Start chatting",
      },
      triage: {
        title: "Find a method that suits me",
        text: "Answer a few short questions about your health and your life. Get the methods that are safe for your body.",
        cta: "Start the questions",
      },
    },
    howTitle: "How it works",
    howSub: "There are two ways to use ContraBot. You can switch between them at any time.",
    howChat: {
      title: "Chat",
      steps: [
        ["You write your question", "In English, Kiswahili or Sheng, the way you would talk to a friend."],
        ["The doctor understands what you need", "An AI reads your message and decides: is this a question, a request for a recommendation, or an emergency?"],
        ["It looks in the guidelines", "It finds the parts of the official guidelines that answer your question."],
        ["You get a simple answer", "The doctor explains it in plain words, then asks a question to help you further."],
      ],
    },
    howTriage: {
      title: "Triage",
      steps: [
        ["You answer short questions", "Your age, if you are breastfeeding, your health, and what matters to you. Just tap your answers."],
        ["Every method is safety-checked", "Your answers are checked against the WHO medical eligibility rules. If several rules apply, the strictest one wins."],
        ["You see your best options", "Methods that are safe for you, ranked by what fits your life, and the ones to avoid, with the reason."],
        ["You can keep asking", "Go to the chat and the doctor will remember your answers."],
      ],
    },
    dataTitle: "Where the information comes from",
    dataSub: "ContraBot does not make things up. Every medical answer is built from these trusted documents.",
    sources: [
      ["Kenya National Family Planning Guidelines", "Ministry of Health, 7th edition, 2025. The official guide Kenyan health workers use: every method, how to use it, side effects and what to do when things go wrong."],
      ["WHO Medical Eligibility Criteria", "World Health Organization, 5th edition. The rules for which methods are safe for people with different health conditions."],
      ["Community experience notes (APHRC)", "Short notes on why people in Kenya stop using methods, so the doctor can talk about real worries."],
    ],
    dataHowTitle: "How the doctor uses them",
    dataHow: [
      "The documents are split into small parts, each labelled with its page.",
      "For every question, the most relevant parts are found and given to the doctor.",
      "The doctor may only answer from those parts. If they don't cover it, the doctor says so and sends you to a health worker.",
      "Ask \"where is this from?\" at any time and the doctor will tell you.",
    ],
    safetyTitle: "Safe and private",
    safety: [
      ["Danger signs come first", "If you mention things like chest pain, very heavy bleeding or being forced to have sex, you are told right away where to get help."],
      ["A guide, not a clinic", "ContraBot helps you understand your options. A nurse, clinic or community health promoter should confirm before you start or change a method."],
      ["Your chat stays private", "We don't ask for your name or phone number, and your chat is not saved: it is gone when you close the page. Your messages are processed by an AI model to write the answers."],
    ],
    ctaTitle: "Ready when you are.",
    footer: "ContraBot is based on the Kenya National Family Planning Guidelines (2025) and the WHO Medical Eligibility Criteria. It does not replace a health worker.",
  },
  sw: {
    badge: "Bure · Siri · Kiingereza, Kiswahili na Sheng",
    phone: {
      title: "Pia kwenye simu yako",
      sub: "Ongea na daktari kwenye WhatsApp, au piga msimbo wa USSD kwenye simu yoyote. USSD haihitaji simu janja wala intaneti.",
      whatsapp: "Jaribu kwenye WhatsApp",
      ussd: "Jaribu kwa USSD",
      dial: "Piga",
      soon: "Inakuja hivi karibuni",
      greeting: "Habari",
    },
    ussdDemo: {
      title: "Jaribu menyu kwenye simu ya kawaida",
      sub: "Simu hii inaendesha huduma halisi ya USSD. Bonyeza Piga, jibu kwa nambari, kisha Sawa. Huhitaji salio wala mtandao wa simu.",
      steps: [
        ["Piga", "Bonyeza kitufe cha kijani. Hiyo inafungua menyu ile ile ya msimbo."],
        ["Jibu", "Gonga namba, kisha Sawa. Bonyeza 9 ukiona More."],
        ["Andika", "Kwa swali, andika kwenye kibodi, kisha Sawa."],
      ],
      ok: "Sawa",
      exit: "Toka",
      call: "Piga",
      end: "Kata",
      clear: "Futa",
      waiting: "Tafadhali subiri...",
      idleBody: "Bonyeza Piga",
      ended: "Imeisha.\nBonyeza Piga kujaribu tena.",
      error: "Huduma haipatikani.\nBonyeza Piga kujaribu tena.",
      unknown: "Msimbo huo haupo kwenye simu hii.\nBonyeza Piga kwa ContraBot.",
      reply: "Jibu lako",
      abc: "ABC",
      num: "123",
    },
    titleA: "Uzazi wa mpango,",
    titleB: "kwa maneno rahisi.",
    sub: "ContraBot ni daktari rafiki wa AI kwa watu wa Kenya. Uliza lolote kuhusu uzazi wa mpango kwa maneno yako mwenyewe, au jibu maswali machache ili upate njia zilizo salama kwako.",
    start: "Anza",
    paths: {
      chat: {
        title: "Ongea na daktari",
        text: "Uliza lolote kwa maneno yako: jinsi njia inavyofanya kazi, madhara, P2, mimba. Daktari anaeleza kwa lugha rahisi.",
        cta: "Anza kuongea",
      },
      triage: {
        title: "Tafuta njia inayonifaa",
        text: "Jibu maswali mafupi kuhusu afya yako na maisha yako. Pata njia zilizo salama kwa mwili wako.",
        cta: "Anza maswali",
      },
    },
    howTitle: "Jinsi inavyofanya kazi",
    howSub: "Kuna njia mbili za kutumia ContraBot. Unaweza kubadili wakati wowote.",
    howChat: {
      title: "Mazungumzo",
      steps: [
        ["Unaandika swali lako", "Kwa Kiingereza, Kiswahili au Sheng, jinsi ungeongea na rafiki."],
        ["Daktari anaelewa unachohitaji", "AI inasoma ujumbe wako na kuamua: je, ni swali, ombi la mapendekezo, au dharura?"],
        ["Inatafuta kwenye miongozo", "Inapata sehemu za miongozo rasmi zinazojibu swali lako."],
        ["Unapata jibu rahisi", "Daktari anaeleza kwa maneno rahisi, kisha anakuuliza swali ili akusaidie zaidi."],
      ],
    },
    howTriage: {
      title: "Maswali ya mapendekezo",
      steps: [
        ["Unajibu maswali mafupi", "Umri wako, kama unanyonyesha, afya yako, na kinachokujali. Gusa majibu tu."],
        ["Kila njia inakaguliwa usalama", "Majibu yako yanalinganishwa na sheria za WHO za kustahiki kitabibu. Sheria kadhaa zikihusika, iliyo kali zaidi inashinda."],
        ["Unaona njia bora kwako", "Njia zilizo salama kwako, zimepangwa kulingana na maisha yako, na zile za kuepuka, pamoja na sababu."],
        ["Unaweza kuendelea kuuliza", "Nenda kwenye mazungumzo na daktari atakumbuka majibu yako."],
      ],
    },
    dataTitle: "Taarifa zinatoka wapi",
    dataSub: "ContraBot haibuni mambo. Kila jibu la kiafya linatokana na nyaraka hizi za kuaminika.",
    sources: [
      ["Miongozo ya Kitaifa ya Uzazi wa Mpango ya Kenya", "Wizara ya Afya, toleo la 7, 2025. Mwongozo rasmi wa wahudumu wa afya Kenya: kila njia, jinsi ya kuitumia, madhara na la kufanya mambo yakienda vibaya."],
      ["Vigezo vya WHO vya Kustahiki Kitabibu", "Shirika la Afya Duniani, toleo la 5. Sheria za njia zipi ni salama kwa watu wenye hali tofauti za kiafya."],
      ["Maelezo ya uzoefu wa jamii (APHRC)", "Maelezo mafupi kuhusu kwa nini watu Kenya huacha kutumia njia, ili daktari aweze kuzungumzia wasiwasi halisi."],
    ],
    dataHowTitle: "Jinsi daktari anavyozitumia",
    dataHow: [
      "Nyaraka zimegawanywa katika sehemu ndogo, kila moja ikiwa na ukurasa wake.",
      "Kwa kila swali, sehemu zinazohusika zaidi zinapatikana na kupewa daktari.",
      "Daktari anaweza kujibu kutoka kwa sehemu hizo tu. Zisipojibu, daktari anasema hivyo na kukutuma kwa mhudumu wa afya.",
      "Uliza \"hii imetoka wapi?\" wakati wowote na daktari atakuambia.",
    ],
    safetyTitle: "Salama na siri",
    safety: [
      ["Dalili za hatari kwanza", "Ukitaja mambo kama maumivu ya kifua, damu nyingi sana au kulazimishwa kufanya ngono, unaambiwa mara moja mahali pa kupata msaada."],
      ["Mwongozo, si kliniki", "ContraBot inakusaidia kuelewa chaguo zako. Muuguzi, kliniki au mhudumu wa afya ya jamii anapaswa kuthibitisha kabla hujaanza au kubadili njia."],
      ["Mazungumzo yako ni siri", "Hatuulizi jina lako wala nambari ya simu, na mazungumzo yako hayahifadhiwi: yanapotea ukifunga ukurasa. Ujumbe wako unachakatwa na AI ili kuandika majibu."],
    ],
    ctaTitle: "Tuko tayari ukiwa tayari.",
    footer: "ContraBot inategemea Miongozo ya Kitaifa ya Uzazi wa Mpango ya Kenya (2025) na Vigezo vya WHO vya Kustahiki Kitabibu. Haichukui nafasi ya mhudumu wa afya.",
  },
};


// ---------- Recommendation text ----------

export const METHOD_TEXT = {
  coc: { en: ["Combined pill", "A daily pill with two hormones."], sw: ["Vidonge vya mchanganyiko", "Kidonge cha kila siku chenye homoni mbili."] },
  pop: { en: ["Progestogen-only pill", "A daily pill with one hormone, often fine while breastfeeding."], sw: ["Vidonge vya homoni moja", "Kidonge cha kila siku chenye homoni moja, mara nyingi ni salama wakati wa kunyonyesha."] },
  injectable: { en: ["Injection (Depo)", "An injection every 3 months at a clinic."], sw: ["Sindano (Depo)", "Sindano kila miezi 3 kliniki."] },
  implant: { en: ["Implant", "A small rod in the upper arm that works for 3 to 5 years."], sw: ["Kijiti (kipandikizi)", "Kijiti kidogo kwenye mkono wa juu kinachofanya kazi kwa miaka 3 hadi 5."] },
  iud_copper: { en: ["Copper IUD", "A small device in the womb, hormone-free, for up to 12 years."], sw: ["Kitanzi cha shaba", "Kifaa kidogo kwenye mfuko wa uzazi, bila homoni, kwa hadi miaka 12."] },
  iud_lng: { en: ["Hormonal IUD", "A small device in the womb that often makes periods lighter, for 5 or more years."], sw: ["Kitanzi cha homoni", "Kifaa kidogo kwenye mfuko wa uzazi ambacho mara nyingi hupunguza hedhi, kwa miaka 5 au zaidi."] },
  condom: { en: ["Condoms", "Used every time. The only method that also protects against HIV and STIs."], sw: ["Kondomu (mpira)", "Hutumika kila mara. Njia pekee inayokinga pia dhidi ya VVU na magonjwa ya zinaa."] },
  emergency: { en: ["Emergency pill", "A backup after unprotected sex, taken as soon as possible."], sw: ["Kidonge cha dharura (P2)", "Kinga ya ziada baada ya ngono bila kinga, humezwa mapema iwezekanavyo."] },
  lam: { en: ["Breastfeeding method (LAM)", "Full breastfeeding protects for up to 6 months after birth while periods haven't returned."], sw: ["Njia ya kunyonyesha (LAM)", "Kunyonyesha pekee hukinga hadi miezi 6 baada ya kujifungua, hedhi ikiwa haijarudi."] },
  sterilization: { en: ["Permanent method", "Tubal ligation or vasectomy, for people who want no more children."], sw: ["Njia ya kudumu", "Kufunga kizazi au vasektomi, kwa wasiotaka watoto zaidi."] },
};

export const MEC_LABEL = {
  1: { en: "Safe to use", sw: "Salama kutumia" },
  2: { en: "Safe, with care", sw: "Salama, kwa uangalifu" },
  3: { en: "Not usually recommended", sw: "Kwa kawaida haipendekezwi" },
  4: { en: "Do not use", sw: "Usitumie" },
};

export const ALERT_TEXT = {
  emergency_contraception: {
    en: ["Emergency contraception first", "You had unprotected sex in the last 5 days. Take an emergency pill (like P2) as soon as possible, or get a copper IUD within 5 days."],
    sw: ["Kwanza dawa ya dharura", "Ulifanya ngono bila kinga ndani ya siku 5. Meza kidonge cha dharura (kama P2) mapema iwezekanavyo, au wekewa kitanzi cha shaba ndani ya siku 5."],
  },
  pregnancy_test: {
    en: ["Take a pregnancy test first", "We couldn't rule out pregnancy. Do a pregnancy test before starting, and use condoms in the meantime."],
    sw: ["Pima mimba kwanza", "Hatukuweza kuthibitisha kuwa huna mimba. Pima mimba kabla ya kuanza, na tumia kondomu kwa sasa."],
  },
  pregnant: {
    en: ["You're pregnant", "Contraception isn't needed during pregnancy. Ask about options at your antenatal visits."],
    sw: ["Una mimba", "Njia za uzazi wa mpango hazihitajiki wakati wa ujauzito. Uliza kuhusu njia hizo kliniki ya wajawazito."],
  },
  add_condoms: {
    en: ["Add condoms for protection", "Whatever method you choose, condoms are the only way to also protect against HIV and STIs."],
    sw: ["Ongeza kondomu kwa kinga", "Njia yoyote utakayochagua, kondomu ndiyo njia pekee ya kukinga pia dhidi ya VVU na magonjwa ya zinaa."],
  },
  permanent_option: {
    en: ["Permanent options", "Since you don't want more children, tubal ligation or vasectomy are also worth asking about at a clinic."],
    sw: ["Njia za kudumu", "Kwa kuwa hutaki watoto zaidi, kufunga kizazi au vasektomi ni njia unazoweza kuuliza kliniki."],
  },
};

export const CARD_TEXT = {
  en: { title: "Your best options", screened: "WHO screened", notForYou: "Not recommended for you", confirm: "Please confirm with a clinic or community health worker before starting any method.", howItWorks: "See how it works", pregnancyRate: (n) => `${n} in 100 get pregnant in a year` },
  sw: { title: "Njia bora kwako", screened: "Imechujwa kwa WHO", notForYou: "Haipendekezwi kwako", confirm: "Tafadhali thibitisha na kliniki au mhudumu wa afya ya jamii kabla ya kuanza njia yoyote.", howItWorks: "Ona jinsi inavyofanya kazi", pregnancyRate: (n) => `${n} kati ya 100 hupata mimba kwa mwaka` },
};

// Kiswahili for the backend's reason codes; English comes from the API.
export const REASON_SW = {
  no_restriction: "Hakuna kizuizi kwa hali yako.",
  female_only: "Njia hii ni ya wanawake pekee.",
  health_risk: "Homoni za mchanganyiko haziruhusiwi kwa shinikizo la damu, kipandauso chenye aura, au damu kuganda.",
  health_risk_lng: "Kitanzi cha homoni kinahitaji ukaguzi wa kliniki kwa matatizo ya moyo na mishipa.",
  breastfeeding_under_6m: "Vidonge vya mchanganyiko vinaweza kupunguza maziwa kabla ya miezi 6.",
  lam_not_breastfeeding: "LAM hufanya kazi tu wakati wa kunyonyesha.",
  adolescent_sterilization: "Njia ya kudumu haifai kwa vijana.",
  adolescent: "Vijana wanaweza kutumia kwa ushauri na ufuatiliaji.",
  needs_provider: "Njia hii inahitaji mhudumu wa afya aliyefunzwa.",
  under_20_iud: "Chini ya miaka 20: uwezekano mdogo zaidi wa kitanzi kutoka.",
  age_40_coc: "Miaka 40 au zaidi: hatari kubwa kidogo ya moyo na damu kuganda.",
  age_45_injectable: "Zaidi ya miaka 45: huenda ikaathiri kidogo uimara wa mifupa.",
  pregnant: "Njia za uzazi wa mpango hazihitajiki wakati wa ujauzito.",
  pregnancy_not_ruled_out: "Mimba haijathibitishwa kutokuwepo: kitanzi hakiwezi kuwekwa ukiwa mjamzito.",
  bf_under_6w: "Unanyonyesha, chini ya wiki 6 tangu ujifungue.",
  bf_6w_6m: "Unanyonyesha, wiki 6 hadi miezi 6 tangu ujifungue: homoni ya estrojeni inaweza kupunguza maziwa.",
  bf_over_6m: "Unanyonyesha, zaidi ya miezi 6 tangu ujifungue.",
  pp_under_3w: "Chini ya wiki 3 tangu ujifungue: hatari kubwa ya damu kuganda.",
  pp_3_6w: "Wiki 3 hadi 6 tangu ujifungue: hatari ya damu kuganda imeongezeka.",
  pp_iud_timing: "Saa 48 hadi wiki 4 baada ya kujifungua: kitanzi kiwekwe ndani ya saa 48 au kuanzia wiki 4.",
  pp_lng_48h_bf: "Ndani ya saa 48 tangu ujifungue ukinyonyesha.",
  lam_over_6m: "LAM hufanya kazi tu miezi 6 ya kwanza baada ya kujifungua.",
  lam_not_exclusive: "LAM inahitaji maziwa ya mama pekee, mchana na usiku.",
  lam_periods_back: "LAM haifanyi kazi hedhi ikisharudi.",
  bp_controlled: "Shinikizo la juu la damu, linadhibitiwa kwa dawa.",
  bp_140_159: "Shinikizo la damu 140–159 / 90–99.",
  bp_160_plus: "Shinikizo la damu 160/100 au zaidi.",
  bp_unknown: "Shinikizo la juu la damu, halijapimwa hivi karibuni.",
  migraine_aura: "Kipandauso chenye aura: hatari ya kiharusi ukitumia estrojeni.",
  migraine_aura_po: "Kipandauso chenye aura.",
  migraine: "Kipandauso bila aura.",
  migraine_35: "Kipandauso bila aura, miaka 35 au zaidi.",
  smoker: "Unavuta sigara.",
  smoker_35: "Unavuta sigara, miaka 35 au zaidi.",
  smoker_35_heavy: "Unavuta sigara 15 au zaidi kwa siku, miaka 35 au zaidi.",
  blood_clot: "Uliwahi kuwa na damu kuganda.",
  stroke_heart: "Kiharusi au ugonjwa wa moyo.",
  diabetes_complications: "Kisukari chenye madhara kwa viungo.",
  diabetes: "Kisukari.",
  liver_disease: "Ugonjwa mkubwa wa ini.",
  breast_cancer_current: "Saratani ya matiti kwa sasa.",
  breast_cancer_past: "Uliwahi kuwa na saratani ya matiti.",
  cervical_cancer: "Saratani ya shingo ya kizazi au mfuko wa uzazi, inasubiri matibabu.",
  heavy_periods: "Hedhi nzito au zenye maumivu: kitanzi cha shaba kinaweza kuziongeza.",
  unexplained_bleeding_iud: "Kutokwa damu bila sababu: chanzo kichunguzwe kabla ya kuweka kitanzi.",
  unexplained_bleeding: "Kutokwa damu bila sababu: chanzo kichunguzwe kwanza.",
  sti_signs: "Dalili za maambukizi: tibiwa kwanza kabla ya kuweka kitanzi.",
  rifampicin: "Rifampicin inaweza kupunguza ufanisi wa njia hii.",
  anticonvulsant: "Dawa hii ya kifafa inaweza kupunguza ufanisi wa njia hii.",
  lamotrigine: "Vidonge vya mchanganyiko hupunguza kiwango cha lamotrigine.",
  efavirenz: "Efavirenz au nevirapine huenda zikapunguza ufanisi wa njia hii.",
  ritonavir: "Ritonavir inaweza kupunguza ufanisi wa njia hii.",
};

export const t = (obj, l, doctor) => (obj?.[lang(l)] ?? obj?.en ?? "").replace("{doctor}", doctor || "");
