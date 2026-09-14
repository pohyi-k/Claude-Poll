const socket = io();

const progressEl = document.getElementById('progress');
const questionTextEl = document.getElementById('questionText');
const optionsEl = document.getElementById('options');
const wordFormEl = document.getElementById('wordForm');
const wordInputEl = document.getElementById('wordInput');
const wordSubmitBtn = document.getElementById('wordSubmitBtn');
const confirmEl = document.getElementById('confirm');
const connectionNoteEl = document.getElementById('connectionNote');

const clientId = getOrCreateClientId();
let currentIndex = null;
let currentAnswer = null; // optionIndex (yesno) or normalized text (wordcloud), or null
let lastTypedText = null; // preserves the participant's own casing after submit

function getOrCreateClientId() {
  const key = 'icebreakerPollClientId';
  let id = localStorage.getItem(key);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    localStorage.setItem(key, id);
  }
  return id;
}

socket.on('connect', () => {
  connectionNoteEl.hidden = true;
  socket.emit('join', { role: 'participant', clientId });
});

socket.on('disconnect', () => {
  connectionNoteEl.hidden = false;
});

socket.on('state', (state) => {
  const questionChanged = currentIndex !== state.currentIndex;
  currentIndex = state.currentIndex;
  currentAnswer = state.yourAnswer !== undefined ? state.yourAnswer : null;

  progressEl.textContent = `📋 Question ${state.currentIndex + 1} of ${state.totalQuestions}`;
  questionTextEl.textContent = state.question.text;

  if (questionChanged) {
    lastTypedText = null;
  }

  if (state.question.type === 'wordcloud') {
    optionsEl.hidden = true;
    wordFormEl.hidden = false;
    renderWordForm(currentAnswer);
  } else {
    wordFormEl.hidden = true;
    optionsEl.hidden = false;
    renderOptions(state.question.options);
  }

  confirmEl.hidden = currentAnswer === null;

  if (questionChanged) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

const EMOJI_OPTIONS = { yes: '✅', no: '❌' };

function renderOptions(options) {
  optionsEl.innerHTML = '';
  options.forEach((option, i) => {
    const emoji = EMOJI_OPTIONS[option.trim().toLowerCase()];
    const btn = document.createElement('button');
    btn.className = `option-btn color-${i % 4}`;
    btn.textContent = emoji ? `${emoji} ${option}` : option;
    btn.dataset.label = option;
    btn.disabled = currentAnswer !== null;
    if (currentAnswer === i) {
      btn.classList.add('selected');
    }
    btn.addEventListener('click', () => {
      if (currentAnswer !== null) return;
      socket.emit('vote', { clientId, optionIndex: i });
      // Optimistic lock on the UI; server confirmation finalizes it.
      currentAnswer = i;
      renderOptions(options);
      confirmEl.hidden = false;
    });
    optionsEl.appendChild(btn);
  });
}

function renderWordForm(answer) {
  const answered = answer !== null;
  wordInputEl.value = answered ? (lastTypedText !== null ? lastTypedText : answer) : '';
  wordInputEl.disabled = answered;
  wordSubmitBtn.disabled = answered;
}

wordFormEl.addEventListener('submit', (e) => {
  e.preventDefault();
  if (currentAnswer !== null) return;
  const text = wordInputEl.value.trim();
  if (!text) return;

  socket.emit('vote', { clientId, text });
  // Optimistic lock on the UI; server confirmation finalizes it.
  lastTypedText = text;
  currentAnswer = text.toLowerCase();
  wordInputEl.value = text;
  wordInputEl.disabled = true;
  wordSubmitBtn.disabled = true;
  confirmEl.hidden = false;
});
