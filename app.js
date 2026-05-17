const state = {
  currentNumber: 0,
  correct: 0,
  total: 0,
  answered: false,
  autoAdvanceTimer: null,
  recognition: null,
  isListening: false,
  voiceUnavailableMessage: "",
};

const digitPreview = document.querySelector("#digit-preview");
const playButton = document.querySelector("#play-button");
const nextButton = document.querySelector("#next-button");
const answerForm = document.querySelector("#answer-form");
const answerInput = document.querySelector("#answer-input");
const voiceButton = document.querySelector("#voice-button");
const feedback = document.querySelector("#feedback");
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

function chooseNumber() {
  clearAutoAdvance();
  const max = Number(rangeSelect.value);
  state.currentNumber = Math.floor(Math.random() * (max + 1));
  state.answered = false;
  answerInput.value = "";
  render();
  setFeedback("neutral", "点击播放，听到英文数字后输入或说出中文答案。");
  answerInput.focus();
}

function speakCurrentNumber() {
  if (!("speechSynthesis" in window)) {
    setFeedback("warn", "当前浏览器不支持语音播放，可以换用 Chrome 或 Safari 试试。");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(state.currentNumber));
  utterance.lang = "en-US";
  utterance.rate = Number(speedRange.value);
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function checkAnswer(event) {
  event.preventDefault();
  checkCurrentAnswer();
}

function checkCurrentAnswer() {
  const answer = normalizeAnswer(answerInput.value);
  const isFirstAttempt = !state.answered;

  if (answer === null || Number.isNaN(answer)) {
    setFeedback("warn", "还没识别出这个答案，可以输入中文数字或阿拉伯数字。");
    answerInput.focus();
    return;
  }

  if (isFirstAttempt) {
    state.total += 1;
    state.answered = true;
  }

  if (answer === state.currentNumber) {
    if (isFirstAttempt) state.correct += 1;
    setFeedback("correct", `答对了：${state.currentNumber}，${toChineseNumber(state.currentNumber)}。`);
    scheduleAutoAdvance();
  } else {
    setFeedback("wrong", `还差一点。正确答案是 ${state.currentNumber}，${toChineseNumber(state.currentNumber)}。`);
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

  state.recognition = new Recognition();
  state.recognition.lang = "zh-CN";
  state.recognition.continuous = false;
  state.recognition.interimResults = false;
  state.recognition.maxAlternatives = 1;

  state.recognition.addEventListener("start", () => {
    state.isListening = true;
    voiceButton.classList.add("listening");
    voiceButton.setAttribute("aria-label", "停止语音回答");
    setFeedback("neutral", "正在听，请直接说中文数字。");
  });

  state.recognition.addEventListener("end", () => {
    state.isListening = false;
    voiceButton.classList.remove("listening");
    voiceButton.setAttribute("aria-label", "语音回答");
  });

  state.recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    answerInput.value = transcript;
    setFeedback("neutral", `识别为：${transcript}`);
    checkCurrentAnswer();
  });

  state.recognition.addEventListener("error", (event) => {
    const message = getSpeechErrorMessage(event.error);
    setFeedback("warn", message);
  });
}

function toggleVoiceAnswer() {
  if (!state.recognition) {
    setFeedback("warn", state.voiceUnavailableMessage || "当前浏览器不支持语音识别，可以继续用键盘输入。");
    return;
  }

  if (state.isListening) {
    state.recognition.stop();
    return;
  }

  clearAutoAdvance();
  answerInput.value = "";
  window.speechSynthesis?.cancel();
  try {
    state.recognition.start();
  } catch {
    setFeedback("warn", "语音识别还没准备好，请稍等一下再点。");
  }
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

function scheduleAutoAdvance() {
  clearAutoAdvance();
  state.autoAdvanceTimer = window.setTimeout(chooseNumber, 900);
}

function clearAutoAdvance() {
  if (!state.autoAdvanceTimer) return;
  window.clearTimeout(state.autoAdvanceTimer);
  state.autoAdvanceTimer = null;
}

function render() {
  digitPreview.textContent = showAnswerToggle.checked ? state.currentNumber : "?";
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

playButton.addEventListener("click", speakCurrentNumber);
nextButton.addEventListener("click", chooseNumber);
answerForm.addEventListener("submit", checkAnswer);
voiceButton.addEventListener("click", toggleVoiceAnswer);
rangeSelect.addEventListener("change", chooseNumber);
showAnswerToggle.addEventListener("change", render);

window.numberTrainer = {
  normalizeAnswer,
  toChineseNumber,
};

setupSpeechRecognition();
chooseNumber();
