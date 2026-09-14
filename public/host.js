const socket = io();

const connectionPill = document.getElementById('connectionPill');
const participantCountEl = document.getElementById('participantCount');
const progressEl = document.getElementById('progress');
const questionTextEl = document.getElementById('questionText');
const resultsEl = document.getElementById('results');
const wordCloudEl = document.getElementById('wordCloud');
const wordCloudTotalEl = document.getElementById('wordCloudTotal');
const nextBtn = document.getElementById('nextBtn');
const resetBtn = document.getElementById('resetBtn');
const qrImage = document.getElementById('qrImage');
const joinUrlEl = document.getElementById('joinUrl');

const EMOJI_OPTIONS = { yes: '✅', no: '❌' };

socket.on('connect', () => {
  connectionPill.textContent = '🟢 Live';
  connectionPill.classList.add('connected');
  connectionPill.classList.remove('disconnected');
  socket.emit('join', { role: 'host' });
});

socket.on('disconnect', () => {
  connectionPill.textContent = '🔄 Reconnecting…';
  connectionPill.classList.add('disconnected');
  connectionPill.classList.remove('connected');
});

socket.on('state', (state) => {
  progressEl.textContent = `📋 Question ${state.currentIndex + 1} of ${state.totalQuestions}`;
  questionTextEl.textContent = state.question.text;
  participantCountEl.textContent = state.participantCount;

  if (state.question.type === 'wordcloud') {
    resultsEl.hidden = true;
    wordCloudEl.hidden = false;
    wordCloudTotalEl.hidden = false;
    renderWordCloud(state.results);
  } else {
    wordCloudEl.hidden = true;
    wordCloudTotalEl.hidden = true;
    resultsEl.hidden = false;
    renderResultsBars(state.question.options, state.results);
  }

  nextBtn.disabled = state.currentIndex >= state.totalQuestions - 1;
});

function renderResultsBars(options, results) {
  const { counts, total } = results;
  resultsEl.innerHTML = '';
  options.forEach((option, i) => {
    const count = counts[i] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;

    const emoji = EMOJI_OPTIONS[option.trim().toLowerCase()];
    const label = emoji ? `${emoji} ${option}` : option;

    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `
      <div class="result-label-row">
        <span>${escapeHtml(label)}</span>
        <span class="result-count">${count} · ${pct}%</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill color-${i % 4}" style="width: ${pct}%"></div>
      </div>
    `;
    resultsEl.appendChild(row);
  });
}

function renderWordCloud(results) {
  const { words, total } = results;
  wordCloudEl.innerHTML = '';

  if (words.length === 0) {
    wordCloudEl.innerHTML = '<div class="wordcloud-empty">🦗 Crickets… be the first to answer!</div>';
    wordCloudTotalEl.textContent = '';
    return;
  }

  const counts = words.map((w) => w.count);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const minSize = 22;
  const maxSize = 68;

  words.forEach((w, i) => {
    const t = maxCount === minCount ? 1 : (w.count - minCount) / (maxCount - minCount);
    const size = minSize + t * (maxSize - minSize);
    const span = document.createElement('span');
    span.className = `wc-word accent-${i % 4}`;
    span.style.fontSize = `${size}px`;
    span.textContent = w.text;
    span.title = `${w.count} response${w.count === 1 ? '' : 's'}`;
    wordCloudEl.appendChild(span);
  });

  wordCloudTotalEl.textContent = `💬 ${total} response${total === 1 ? '' : 's'} and counting`;
}

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
