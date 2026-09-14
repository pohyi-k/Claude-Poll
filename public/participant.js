const socket = io();

const progressEl = document.getElementById('progress');
const questionTextEl = document.getElementById('questionText');
const optionsEl = document.getElementById('options');
const confirmEl = document.getElementById('confirm');
const connectionNoteEl = document.getElementById('connectionNote');

const clientId = getOrCreateClientId();
let currentIndex = null;
let votedOptionIndex = null;

function getOrCreateClientId() {
  const key = 'raiseYourHandClientId';
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
  votedOptionIndex = state.yourVote !== undefined ? state.yourVote : null;

  progressEl.textContent = `Question ${state.currentIndex + 1} of ${state.totalQuestions}`;
  questionTextEl.textContent = state.question.text;

  renderOptions(state.question.options);
  confirmEl.hidden = votedOptionIndex === null;

  if (questionChanged) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

function renderOptions(options) {
  optionsEl.innerHTML = '';
  options.forEach((option, i) => {
    const btn = document.createElement('button');
    btn.className = `option-btn color-${i % 4}`;
    btn.textContent = option;
    btn.dataset.label = option;
    btn.disabled = votedOptionIndex !== null;
    if (votedOptionIndex === i) {
      btn.classList.add('selected');
    }
    btn.addEventListener('click', () => {
      if (votedOptionIndex !== null) return;
      socket.emit('vote', { clientId, optionIndex: i });
      // Optimistic lock on the UI; server confirmation finalizes it.
      votedOptionIndex = i;
      renderOptions(options);
    });
    optionsEl.appendChild(btn);
  });
}
