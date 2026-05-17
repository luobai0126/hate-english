const state = {
  currentNumber: 0,
  correct: 0,
  total: 0,
  answered: false,
  autoAdvanceTimer: null,
  recognition: null,
  isListening: false,
  voiceUnavailableMessage: "",
  audioContext: null,
  listenTimer: null,
  recognitionSupported: false,
};

const digitPreview = document.querySelector("#digit-preview");
const playButton = document.querySelector("#play-button");
const nextButton = document.querySelector("#next-button");
const answerForm = document.querySelector("#answer-form");
const answerInput = document.querySelector("#answer-input");
const answerLabel = document.querySelector("#answer-label");
const voiceButton = document.querySelector("#voice-button");
const feedback = document.querySelector("#feedback");
const modeSelect = document.querySelector("#mode-select");
const rangeSelect = document.querySelector("#range-select");
const speedRange = document.querySelector("#speed-range");
const showAnswerToggle = document.querySelector("#show-answer-toggle");
const scoreCorrect = document.querySelector("#score-correct");
const scoreTotal = document.querySelector("#score-total");

const digitMap = new Map([
  ["零", 0], ["〇", 0], ["○", 0], ["0", 0],
  ["一", 1], ["壹", 1], ["幺", 1], ["1", 1],
  ["二", 2], ["两", 2], ["贰", 2], ["2", 2],
  ["三", 3], ["叁", 3], ["3", 3],
  ["四", 4], ["肆", 4], ["4", 4],
  ["五", 5], ["伍", 5], ["5", 5],
  ["六", 6], ["陆", 6], ["6", 6],
  ["七", 7], ["柒", 7], ["7", 7],
  ["八", 8], ["捌", 8], ["8", 8],
  ["九", 9], ["玖", 9], ["9", 9],
]);

const unitMap = new Map([
  ["十", 10], ["拾", 10],
  ["百", 100], ["佰", 100],
  ["千", 1000], ["仟", 1000],
  ["万", 10000],
]);

const englishSmallNumbers = new Map([
  ["zero", 0], ["oh", 0], ["o", 0],
  ["one", 1], ["a", 1], ["an", 1],
  ["two", 2], ["three", 3], ["four", 4], ["five", 5],
  ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9],
  ["ten", 10], ["eleven", 11], ["twelve", 12], ["thirteen", 13],
  ["fourteen", 14], ["fifteen", 15], ["sixteen", 16],
  ["seventeen", 17], ["eighteen", 18], ["nineteen", 19],
]);

const englishTens = new Map([
  ["twenty", 20], ["thirty", 30], ["forty", 40], ["fourty", 40],
  ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80],
  ["ninety", 90],
]);

function normalizeAnswer(raw) {
  const cleaned = raw
    .trim()
    .replace(/[，,。！!？?\s_]/g, "")
    .replace(/点/g, ".")
    .replace(/负/g, "-");

  if (!cleaned) return null;
  if (/^-?\d+$/.test(cleaned)) return Number(cleaned);
  if (/^[零〇○一壹二两贰三叁四肆五伍六陆七柒八捌九玖0-9]+$/.test(cleaned)) {
    return Number([...cleaned].map((char) => digitMap.get(char)).join(""));
  }

  return parseChineseInteger(cleaned);
}

function normalizeCurrentAnswer(raw) {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  if (/^-?\d+$/.test(cleaned.replace(/[，,\s_]/g, ""))) {
    return Number(cleaned.replace(/[，,\s_]/g, ""));
  }

  if (expectsEnglishAnswer()) return parseEnglishInteger(cleaned);
  return normalizeAnswer(cleaned);
}

function normalizeSpeechAnswer(raw) {
  const answer = expectsEnglishAnswer()
    ? parseEnglishInteger(raw)
    : normalizeAnswer(raw);

  return Number.isFinite(answer) ? answer : null;
}

function parseChineseInteger(text) {
  let total = 0;
  let section = 0;
  let number = 0;
  let sawKnownChar = false;

  for (const char of text) {
    if (digitMap.has(char)) {
      number = digitMap.get(char);
      sawKnownChar = true;
      continue;
    }

    if (!unitMap.has(char)) return null;

    sawKnownChar = true;
    const unit = unitMap.get(char);

    if (unit === 10000) {
      section = (section + number) || 1;
      total += section * unit;
      section = 0;
      number = 0;
      continue;
    }

    section += (number || 1) * unit;
    number = 0;
  }

  if (!sawKnownChar) return null;
  return total + section + number;
}

function toChineseNumber(number) {
  if (number === 0) return "零";
  if (number === 10000) return "一万";

  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const units = ["", "十", "百", "千"];
  const parts = [];
  const section = String(number);

  for (let i = 0; i < section.length; i += 1) {
    const digit = Number(section[i]);
    const unitIndex = section.length - i - 1;
    if (digit === 0) {
      if (parts.at(-1) !== "零" && i !== section.length - 1) parts.push("零");
    } else {
      parts.push(digits[digit] + units[unitIndex]);
    }
  }

  return parts.join("").replace(/^一十/, "十").replace(/零+$/g, "");
}

function toEnglishNumber(number) {
  if (number === 0) return "zero";
  if (number === 10000) return "ten thousand";

  const belowTwenty = [
    "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  function belowThousand(value) {
    const parts = [];
    if (value >= 100) {
      parts.push(`${belowTwenty[Math.floor(value / 100)]} hundred`);
      value %= 100;
    }
    if (value >= 20) {
      const ten = tens[Math.floor(value / 10)];
      const rest = value % 10;
      parts.push(rest ? `${ten} ${belowTwenty[rest]}` : ten);
    } else if (value > 0) {
      parts.push(belowTwenty[value]);
    }
    return parts.join(" ");
  }

  if (number >= 1000) {
    const thousands = Math.floor(number / 1000);
    const rest = number % 1000;
    return rest ? `${belowThousand(thousands)} thousand ${belowThousand(rest)}` : `${belowThousand(thousands)} thousand`;
  }

  return belowThousand(number);
}

function parseEnglishInteger(raw) {
  const normalized = raw
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/[,.!?]/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/\bto\b/g, "two")
    .replace(/\btoo\b/g, "two")
    .replace(/\bfor\b/g, "four")
    .trim();

  if (!normalized) return null;
  if (/^\d+$/.test(normalized.replace(/\s/g, ""))) return Number(normalized.replace(/\s/g, ""));

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  if (tokens.every((token) => englishSmallNumbers.has(token) && englishSmallNumbers.get(token) < 10)) {
    return Number(tokens.map((token) => englishSmallNumbers.get(token)).join(""));
  }

  let total = 0;
  let current = 0;
  let sawNumber = false;

  for (const token of tokens) {
    if (englishSmallNumbers.has(token)) {
      current += englishSmallNumbers.get(token);
      sawNumber = true;
      continue;
    }

    if (englishTens.has(token)) {
      current += englishTens.get(token);
      sawNumber = true;
      continue;
    }

    if (token === "hundred") {
      current = (current || 1) * 100;
      sawNumber = true;
      continue;
    }

    if (token === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
      sawNumber = true;
      continue;
    }

    return null;
  }

  if (!sawNumber) return null;
  return total + current;
}

function chooseNumber(options = {}) {
  clearAutoAdvance();
  stopListening();
  const max = Number(rangeSelect.value);
  state.currentNumber = Math.floor(Math.random() * (max + 1));
  state.answered = false;
  answerInput.value = "";
  render();
  setFeedback("neutral", getReadyMessage());
  answerInput.focus();
  if (options.autoPlay) {
    window.setTimeout(startCurrentPrompt, 120);
  }
}

function startCurrentPrompt() {
  if (modeSelect.value === "read-en") {
    startVoiceAnswer({ clearInput: true });
    return;
  }

  speakCurrentNumber({ listenAfter: true });
}

function speakCurrentNumber(options = {}) {
  if (!("speechSynthesis" in window)) {
    setFeedback("warn", "当前浏览器不支持语音播放，可以换用 Chrome 或 Safari 试试。");
    return;
  }

  stopListening();
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(getPromptText());
  utterance.lang = modeSelect.value === "zh-to-en" ? "zh-CN" : "en-US";
  utterance.rate = Number(speedRange.value);
  utterance.pitch = 1;
  utterance.addEventListener("start", () => {
    setFeedback("neutral", "正在播放题目。");
  });
  utterance.addEventListener("end", () => {
    if (options.listenAfter !== false) startVoiceAnswer({ clearInput: true });
  });
  window.speechSynthesis.speak(utterance);
}

function checkAnswer(event) {
  event.preventDefault();
  checkCurrentAnswer();
}

function checkCurrentAnswer() {
  const answer = normalizeCurrentAnswer(answerInput.value);
  const isFirstAttempt = !state.answered;

  if (answer === null || Number.isNaN(answer)) {
    setFeedback("warn", getUnrecognizedMessage());
    answerInput.focus();
    return;
  }

  if (isFirstAttempt) {
    state.total += 1;
    state.answered = true;
  }

  if (answer === state.currentNumber) {
    if (isFirstAttempt) state.correct += 1;
    setFeedback("correct", `答对了：${getAnswerSummary()}。`);
    playCorrectSound();
    scheduleAutoAdvance();
  } else {
    answerInput.value = "";
    setFeedback("wrong", "不对，再试一次。");
    playWrongSound();
    window.setTimeout(() => startVoiceAnswer({ clearInput: true }), 650);
  }

  renderScore();
}

function setupSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!window.isSecureContext && !isLocalHost()) {
    state.voiceUnavailableMessage = "iPad 通过局域网 HTTP 打开时，浏览器会拒绝语音识别。需要 HTTPS，或先在 Mac 本机 localhost 使用语音。";
    voiceButton.title = state.voiceUnavailableMessage;
    return;
  }

  if (!Recognition) {
    state.voiceUnavailableMessage = "当前浏览器不支持网页语音识别，可以继续用键盘输入。";
    voiceButton.title = state.voiceUnavailableMessage;
    return;
  }

  state.recognitionSupported = true;
}

function createRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new Recognition();
  recognition.lang = getRecognitionLang();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 5;

  recognition.addEventListener("start", () => {
    state.isListening = true;
    voiceButton.classList.add("listening");
    voiceButton.setAttribute("aria-label", "停止语音回答");
    setFeedback("neutral", "滴声后开始回答。");
    playReadyBeep();
  });

  recognition.addEventListener("end", () => {
    state.isListening = false;
    voiceButton.classList.remove("listening");
    voiceButton.setAttribute("aria-label", "语音回答");
  });

  recognition.addEventListener("result", (event) => {
    const transcript = getBestTranscript(event);
    const numericAnswer = normalizeSpeechAnswer(transcript);

    if (numericAnswer === null) {
      answerInput.value = "";
      setFeedback("warn", `没有识别到数字：${transcript || "未听清"}。请听到滴声后再说一次。`);
      window.setTimeout(() => startVoiceAnswer({ clearInput: true }), 650);
      return;
    }

    answerInput.value = String(numericAnswer);
    setFeedback("neutral", `识别为数字：${numericAnswer}`);
    checkCurrentAnswer();
  });

  recognition.addEventListener("error", (event) => {
    const message = getSpeechErrorMessage(event.error);
    setFeedback("warn", message);
  });

  return recognition;
}

function toggleVoiceAnswer() {
  startVoiceAnswer({ clearInput: true });
}

function startVoiceAnswer(options = {}) {
  if (!state.recognitionSupported) {
    setFeedback("warn", state.voiceUnavailableMessage || "当前浏览器不支持语音识别，可以继续用键盘输入。");
    return;
  }

  if (state.isListening) {
    state.recognition.stop();
    return;
  }

  clearAutoAdvance();
  clearListenTimer();
  if (options.clearInput) answerInput.value = "";
  window.speechSynthesis?.cancel();
  state.recognition = createRecognition();
  setFeedback("neutral", "正在打开麦克风。");
  try {
    state.recognition.start();
  } catch {
    setFeedback("warn", "语音识别还没准备好，请稍等一下再点。");
  }
}

function stopListening() {
  clearListenTimer();
  if (!state.recognition || !state.isListening) return;
  state.recognition.stop();
}

function getBestTranscript(event) {
  const transcripts = [];

  for (let resultIndex = event.resultIndex; resultIndex < event.results.length; resultIndex += 1) {
    const result = event.results[resultIndex];
    for (let altIndex = 0; altIndex < result.length; altIndex += 1) {
      transcripts.push(result[altIndex].transcript.trim());
    }
  }

  return transcripts.find((transcript) => normalizeSpeechAnswer(transcript) !== null) || transcripts[0] || "";
}

function clearListenTimer() {
  if (!state.listenTimer) return;
  window.clearTimeout(state.listenTimer);
  state.listenTimer = null;
}

function getRecognitionLang() {
  return expectsEnglishAnswer() ? "en-US" : "zh-CN";
}

function getPromptText() {
  return modeSelect.value === "zh-to-en" ? toChineseNumber(state.currentNumber) : String(state.currentNumber);
}

function getReadyMessage() {
  if (modeSelect.value === "read-en") return "看屏幕上的数字，听到滴声后说出英文。";

  return modeSelect.value === "zh-to-en"
    ? "点击播放，听到中文数字后输入或说出英文答案。"
    : "点击播放，听到英文数字后输入或说出中文答案。";
}

function getUnrecognizedMessage() {
  return expectsEnglishAnswer()
    ? "还没识别出英文数字，可以说英文数字或输入阿拉伯数字。"
    : "还没识别出中文数字，可以说中文数字或输入阿拉伯数字。";
}

function getAnswerSummary() {
  if (expectsEnglishAnswer()) {
    return `${state.currentNumber}，${toEnglishNumber(state.currentNumber)}`;
  }

  return `${state.currentNumber}，${toChineseNumber(state.currentNumber)}`;
}

function expectsEnglishAnswer() {
  return modeSelect.value === "zh-to-en" || modeSelect.value === "read-en";
}

function isLocalHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function getSpeechErrorMessage(error) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    if (!window.isSecureContext && !isLocalHost()) {
      return "这不是系统麦克风开关的问题：iPad 上局域网 HTTP 页面不能使用语音识别，需要 HTTPS。";
    }

    return "浏览器拒绝了语音识别。请检查 Safari 网站设置里的麦克风权限，然后刷新页面再试。";
  }

  if (error === "no-speech") return "这次没有听到声音，可以再点“说”重试。";
  if (error === "audio-capture") return "没有检测到可用麦克风，请检查系统麦克风权限。";
  if (error === "network") return "语音识别服务连接失败，可以稍后再试或改用键盘输入。";

  return "这次没有听清，可以再点“说”重试。";
}

function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  if (!state.audioContext) state.audioContext = new AudioContext();
  if (state.audioContext.state === "suspended") state.audioContext.resume();
  return state.audioContext;
}

function playTone(frequency, duration, options = {}) {
  const audioContext = getAudioContext();
  if (!audioContext) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;
  const volume = options.volume ?? 0.08;

  oscillator.type = options.type || "sine";
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playReadyBeep() {
  playTone(880, 0.1, { volume: 0.07 });
}

function playCorrectSound() {
  playTone(660, 0.11, { volume: 0.08 });
  window.setTimeout(() => playTone(920, 0.14, { volume: 0.08 }), 105);
}

function playWrongSound() {
  playTone(190, 0.18, { type: "square", volume: 0.045 });
}

function scheduleAutoAdvance() {
  clearAutoAdvance();
  state.autoAdvanceTimer = window.setTimeout(() => chooseNumber({ autoPlay: true }), 780);
}

function clearAutoAdvance() {
  if (!state.autoAdvanceTimer) return;
  window.clearTimeout(state.autoAdvanceTimer);
  state.autoAdvanceTimer = null;
}

function render() {
  digitPreview.textContent = modeSelect.value === "read-en" || showAnswerToggle.checked ? state.currentNumber : "?";
  const needsEnglish = expectsEnglishAnswer();
  answerLabel.textContent = needsEnglish ? "输入或说出英文数字" : "输入或说出中文数字";
  answerInput.placeholder = needsEnglish ? "例如：three hundred twenty six" : "例如：三百二十六";
  renderScore();
}

function renderScore() {
  scoreCorrect.textContent = state.correct;
  scoreTotal.textContent = state.total;
}

function setFeedback(type, message) {
  feedback.className = `feedback ${type}`;
  feedback.textContent = message;
}

playButton.addEventListener("click", startCurrentPrompt);
nextButton.addEventListener("click", () => chooseNumber({ autoPlay: true }));
answerForm.addEventListener("submit", checkAnswer);
voiceButton.addEventListener("click", toggleVoiceAnswer);
modeSelect.addEventListener("change", () => chooseNumber({ autoPlay: modeSelect.value === "read-en" }));
rangeSelect.addEventListener("change", () => chooseNumber({ autoPlay: false }));
showAnswerToggle.addEventListener("change", render);

window.numberTrainer = {
  normalizeAnswer,
  normalizeSpeechAnswer,
  getBestTranscript,
  parseEnglishInteger,
  toChineseNumber,
  toEnglishNumber,
};

setupSpeechRecognition();
chooseNumber();
