const socket = io();

const connectionPill = document.getElementById('connectionPill');
const participantCountEl = document.getElementById('participantCount');
const progressEl = document.getElementById('progress');
const questionTextEl = document.getElementById('questionText');
const resultsEl = document.getElementById('results');
const nextBtn = document.getElementById('nextBtn');
const resetBtn = document.getElementById('resetBtn');
const qrImage = document.getElementById('qrImage');
const joinUrlEl = document.getElementById('joinUrl');

socket.on('connect', () => {
  connectionPill.textContent = 'Live';
  connectionPill.classList.add('connected');
  connectionPill.classList.remove('disconnected');
  socket.emit('join', { role: 'host' });
});

socket.on('disconnect', () => {
  connectionPill.textContent = 'Reconnecting…';
  connectionPill.classList.add('disconnected');
  connectionPill.classList.remove('connected');
});

socket.on('state', (state) => {
  progressEl.textContent = `Question ${state.currentIndex + 1} of ${state.totalQuestions}`;
  questionTextEl.textContent = state.question.text;
  participantCountEl.textContent = state.participantCount;

  const { counts, total } = state.results;
  resultsEl.innerHTML = '';
  state.question.options.forEach((option, i) => {
    const count = counts[i] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;

    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `
      <div class="result-label-row">
        <span>${escapeHtml(option)}</span>
        <span class="result-count">${count} · ${pct}%</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill color-${i % 4}" style="width: ${pct}%"></div>
      </div>
    `;
    resultsEl.appendChild(row);
  });

  nextBtn.disabled = state.currentIndex >= state.totalQuestions - 1;
});

nextBtn.addEventListener('click', () => socket.emit('hostNext'));
resetBtn.addEventListener('click', () => {
  if (confirm('Reset all votes and return to Question 1?')) {
    socket.emit('hostReset');
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Load the QR code once — the join link stays the same for the whole session.
fetch('/api/qr')
  .then((res) => res.json())
  .then(({ dataUrl, url }) => {
    qrImage.src = dataUrl;
    joinUrlEl.textContent = url;
  })
  .catch(() => {
    joinUrlEl.textContent = 'Could not generate QR code — check server logs.';
  });
